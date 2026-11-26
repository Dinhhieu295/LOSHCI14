import { z } from 'zod';
import { HttpError } from '../http/errors.js';
import { calculateCourseScore, calculateGpa, calculateGradeTarget, normalizeText, parseTimeRange, subtractBusy, type GradeComponent } from '../application/assistant-math.js';

export type Row = Record<string, unknown>;
export type Source = { title: string; href: string };
export const sourceFor = (resource: string, item: Row): Source | undefined => {
  const id = typeof item.id === 'string' ? item.id : undefined;
  if (!id) return undefined;
  const title = String(item.title ?? item.name ?? item.date ?? resource);
  if (resource === 'files' && typeof item.workspaceId === 'string') return { title,
    href: item.workspaceKind === 'course' ? `/study?course=${encodeURIComponent(item.workspaceId)}&tab=documents` : `/projects?project=${encodeURIComponent(item.workspaceId)}` };
  const query = new URLSearchParams();
  if (resource === 'projects') return { title, href: `/projects?project=${encodeURIComponent(id)}` };
  if (resource === 'project-tasks') { query.set('project', String(item.projectId)); query.set('task', id); return { title, href: `/projects?${query}` }; }
  if (resource === 'tasks') return { title, href: `/work?view=${item.category === 'employment' ? 'employment' : 'personal'}&task=${encodeURIComponent(id)}` };
  if (resource === 'task-blocks' || resource === 'schedule') return { title, href: `/calendar?week=${String(item.date).slice(0, 10)}` };
  if (resource === 'courses') return { title, href: `/study?course=${encodeURIComponent(id)}` };
  const tabs: Record<string, string> = { assignments: 'assignments', exams: 'exams', notes: 'notes', 'study-logs': 'time', 'course-sessions': 'course-schedule' };
  if (tabs[resource]) {
    query.set('tab', tabs[resource]!);
    if (item.courseId) query.set('course', String(item.courseId));
    if (['assignments', 'exams', 'notes'].includes(resource)) query.set(resource === 'assignments' ? 'assignment' : resource === 'exams' ? 'exam' : 'note', id);
    return { title, href: `/study?${query}` };
  }
  return undefined;
};
export const searchableResources = ['projects', 'project-tasks', 'tasks', 'courses', 'assignments', 'exams', 'notes', 'course-sessions', 'study-logs', 'schedule'] as const;
const range = { from: z.iso.date(), to: z.iso.date(), timeZone: z.string().max(100).default('Asia/Ho_Chi_Minh') };
const rangeSchema = z.strictObject(range).refine(({ from, to }) => from <= to && Date.parse(to) - Date.parse(from) <= 31 * 86400000, 'Chọn khoảng ngày từ 1 đến 32 ngày.');
const searchSchema = z.strictObject({ query: z.string().trim().max(160).default(''), resources: z.array(z.enum(searchableResources)).max(10).optional(),
  projectId: z.uuid().optional(), courseId: z.uuid().optional(), status: z.string().max(40).optional(), priority: z.string().max(24).optional(),
  from: z.iso.date().optional(), to: z.iso.date().optional(), offset: z.number().int().min(0).max(10000).default(0) });
const freeSchema = z.strictObject({ ...range, durationMinutes: z.number().int().min(15).max(1440).default(30) });
const planSchema = z.strictObject({ ...range, items: z.array(z.strictObject({ resource: z.enum(['tasks', 'project-tasks', 'assignments']), id: z.uuid(),
  minutes: z.number().int().min(15).max(1440) })).min(1).max(20) });
const gradeSchema = z.strictObject({ courseId: z.uuid().optional(), semester: z.string().max(40).optional(),
  target: z.number().min(0).max(10).optional(), componentName: z.string().max(120).optional() });
const openSchema = z.strictObject({ resource: z.enum(searchableResources), id: z.uuid() });
const helpSchema = z.strictObject({ topic: z.string().max(160).default('LifeOS') });
const definitions = [
  { name: 'get_lifeos_workspace', description: 'Đọc chi tiết một dự án hoặc môn học cùng các task/bài tập, kỳ thi, ghi chú và lịch học liên quan. Kết quả có tổng số và giới hạn chi tiết.', schema: z.strictObject({ workspaceKind: z.enum(['course', 'project']), workspaceId: z.uuid() }) },
  { name: 'get_lifeos_overview', description: 'Đọc tổng quan chính xác: tổng dự án/task/bài tập, việc còn mở và GPA. Không bị giới hạn 25 bản ghi.', schema: z.strictObject({}) },
  { name: 'search_lifeos', description: 'Tìm không dấu trên mọi dữ liệu theo tên/nội dung; lọc trạng thái, ưu tiên, môn, dự án, ngày. Trả nguồn và phân trang; hỏi lại nếu trùng tên.', schema: searchSchema },
  { name: 'get_lifeos_agenda', description: 'Tổng hợp lịch học, ca làm lặp, sự kiện, phiên đã xếp và mọi hạn bài tập/task/kỳ thi theo ngày cụ thể.', schema: rangeSchema },
  { name: 'find_free_slots', description: 'Tính chính xác giờ trống theo khung giờ rảnh và tất cả lịch bận, theo múi giờ người dùng.', schema: freeSchema },
  { name: 'preview_lifeos_schedule', description: 'Tính bản xếp lịch task/bài tập, chừa 15 phút nghỉ và tối đa 3 giờ/ngày. Chưa lưu; chuyển suggestedChange sang propose_lifeos_change để người dùng duyệt.', schema: planSchema },
  { name: 'calculate_lifeos_grades', description: 'Tính điểm môn, GPA theo tín chỉ, hoặc điểm tối thiểu của một đầu điểm để đạt mục tiêu. Dùng công thức hệ thống, không tự suy đoán điểm thiếu.', schema: gradeSchema },
  { name: 'open_lifeos_item', description: 'Tra bản ghi và trả liên kết mở đúng dự án, task, bài tập, môn hoặc ghi chú.', schema: openSchema },
  { name: 'get_lifeos_help', description: 'Tra hướng dẫn chức năng LifeOS, ý nghĩa lịch, điểm, tài liệu và quy trình xác nhận thao tác.', schema: helpSchema },
];
type List = (resource: string, projectId?: string) => Promise<Row[]>;
const clock = (value: unknown) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value));
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
};
const weekday = (date: string) => (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7 + 1;
const dateOf = (item: Row) => String(item.deadline ?? item.dueDate ?? item.date ?? item.endDate ?? '');
export function localClock(timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
    return { date: `${part('year')}-${part('month')}-${part('day')}`, minute: Number(part('hour')) * 60 + Number(part('minute')) };
  } catch { throw new HttpError(400, 'Múi giờ không hợp lệ.'); }
}
const help = [
  { title: 'Tổng quan', href: '/overview', text: 'Xem việc sắp đến hạn, tiến độ dự án, số môn đang học và GPA.' },
  { title: 'Dự án', href: '/projects', text: 'Tạo/sửa/xóa/ghim dự án. Task có hạn, ưu tiên, trạng thái, phụ thuộc cùng dự án và cột mốc. Timeline hiển thị kế hoạch và baseline.' },
  { title: 'Học tập', href: '/study', text: 'Quản lý môn, bài tập có phụ thuộc cùng môn, kỳ thi, ghi chú và nhật ký tự học. Điểm theo tỷ trọng tổng 100%, điểm thiếu không được xem là 0. GPA theo tín chỉ và thang điểm LifeOS.' },
  { title: 'Công việc', href: '/work', text: 'Việc cá nhân linh hoạt hoặc giờ cố định; việc làm lặp theo thứ hằng tuần kể từ ngày bắt đầu. Hoàn thành việc làm sẽ ngừng hiển thị ca lặp.' },
  { title: 'Lịch trình', href: '/calendar', text: 'Lịch học của môn đang học tự hiển thị. Xếp giờ cho task/bài tập, dời hoặc trả phiên về hàng đợi. Phiên làm việc không được trùng lịch bận. Sự kiện cá nhân được lưu trùng lịch sau cảnh báo. Gợi ý chừa 15 phút nghỉ và tối đa 3 giờ mỗi ngày.' },
  { title: 'Tài liệu và bấm giờ', href: '/projects', text: 'Tệp gắn với dự án, task, môn hoặc bài tập. Mỗi tệp tối đa 10 MB; tệp gửi trợ lý tối đa 6 MB. Chọn task/bài tập để bấm giờ; dừng để lưu lịch sử. Khi chuyển phiên phải lưu phiên trước.' },
  { title: 'Trợ lý', href: '/settings', text: 'Trợ lý đọc dữ liệu theo tài khoản. Mọi thay đổi cần bản xem trước và người dùng xác nhận; có thể bỏ qua. Mở Cài đặt để quản lý kết nối AI.' },
];

export function createWorkspaceTools(list: List) {
  async function agenda(input: unknown) {
    const { from, to, timeZone } = rangeSchema.parse(input);
    localClock(timeZone);
    const names = ['courses', 'course-sessions', 'schedule', 'tasks', 'task-blocks', 'assignments', 'exams', 'project-tasks'];
    const data = new Map(await Promise.all(names.map(async (name) => [name, await list(name)] as const)));
    const courses = new Map(data.get('courses')!.filter((course) => course.status === 'Active').map((course) => [course.id, course]));
    const days: string[] = [];
    for (let at = Date.parse(from); at <= Date.parse(to); at += 86400000) days.push(new Date(at).toISOString().slice(0, 10));
    const busy: Row[] = [];
    for (const date of days) {
      for (const session of data.get('course-sessions')!) {
        const course = courses.get(session.courseId);
        if (course && session.weekday === weekday(date)) busy.push({ id: session.id, kind: 'course', title: course.name,
          date, start: clock(session.startTime), end: clock(session.endTime), source: sourceFor('courses', course) });
      }
      for (const task of data.get('tasks')!) {
        const slot = task.fixedSlot as { date: string; start: number; end: number } | null;
        if (!slot) continue;
        const repeats = task.category === 'employment';
        if (repeats && (task.isDone || task.status === 'done')) continue;
        if (repeats ? slot.date <= date && weekday(slot.date) === weekday(date) : slot.date === date) {
          busy.push({ ...slot, date, title: task.title, kind: repeats ? 'employment' : 'fixed-task', source: sourceFor('tasks', task) });
        }
      }
    }
    for (const event of data.get('schedule')!) {
      if (String(event.date) < from || String(event.date) > to) continue;
      const parsed = parseTimeRange(String(event.time));
      if (!parsed) throw new HttpError(409, `Sự kiện “${event.title}” có giờ chưa hợp lệ. Cần chỉnh giờ trước khi tìm lịch trống.`);
      busy.push({ ...event, kind: 'event', start: parsed[0], end: parsed[1], source: sourceFor('schedule', event) });
    }
    for (const block of data.get('task-blocks')!) {
      if (String(block.date) >= from && String(block.date) <= to) busy.push({ ...block, kind: 'work', title: 'Phiên đã xếp', source: sourceFor('task-blocks', block) });
    }
    const deadlines = ['tasks', 'project-tasks', 'assignments', 'exams'].flatMap((name) => data.get(name)!
      .filter((item) => dateOf(item).slice(0, 10) >= from && dateOf(item).slice(0, 10) <= to)
      .map((item) => ({ ...item, resource: name, source: sourceFor(name, item) })));
    return { from, to, timeZone, days, busy: busy.sort((a, b) => String(a.date).localeCompare(String(b.date)) || Number(a.start) - Number(b.start)), deadlines };
  }
  async function free(input: unknown, buffer = 0) {
    const args = freeSchema.parse(input);
    const schedule = await agenda(argsFromRange(args));
    const windows = await list('availability');
    const now = localClock(args.timeZone);
    const slots = schedule.days.flatMap((date) => {
      const window = windows.find((item) => item.weekday === weekday(date));
      if (!window || date < now.date) return [];
      const start = Math.max(clock(window.start), date === now.date ? Math.ceil(now.minute / 5) * 5 : 0);
      const busy = schedule.busy.filter((item) => item.date === date).map((item): [number, number] =>
        [Math.max(0, Number(item.start) - (item.kind === 'work' ? buffer : 0)), Math.min(1440, Number(item.end) + (item.kind === 'work' ? buffer : 0))]);
      return subtractBusy(start, clock(window.end), busy).filter(([from, to]) => to - from >= args.durationMinutes)
        .map(([start, end]) => ({ date, start, end, minutes: end - start }));
    });
    return { slots, schedule };
  }
  return {
    tools: definitions.map(({ name, description, schema }) => ({ type: 'function', name, description, strict: false, parameters: z.toJSONSchema(schema) })),
    async execute(name: string, input: unknown) {
      if (name === 'get_lifeos_workspace') {
        const args = z.strictObject({ workspaceKind: z.enum(['course', 'project']), workspaceId: z.uuid() }).parse(input);
        const resource = args.workspaceKind === 'course' ? 'courses' : 'projects';
        const item = (await list(resource)).find((item) => item.id === args.workspaceId);
        if (!item) throw new HttpError(404, 'Không tìm thấy môn học hoặc dự án trong tài khoản.');
        const related: Record<string, unknown> = {};
        for (const name of args.workspaceKind === 'course' ? ['assignments', 'exams', 'notes', 'course-sessions', 'study-logs'] : ['project-tasks']) {
          const rows = (await list(name, args.workspaceKind === 'project' ? args.workspaceId : undefined))
            .filter((row) => args.workspaceKind !== 'course' || row.courseId === args.workspaceId);
          related[name] = { total: rows.length, items: rows.slice(0, 25).map((row) => ({ ...row,
            content: typeof row.content === 'string' ? row.content.slice(0, 500) : row.content, source: sourceFor(name, row) })), nextOffset: rows.length > 25 ? 25 : null };
        }
        return { item, source: sourceFor(resource, item), related };
      }
      if (name === 'get_lifeos_overview') {
        z.strictObject({}).parse(input);
        const [projects, tasks, personal, assignments, courses] = await Promise.all(['projects', 'project-tasks', 'tasks', 'assignments', 'courses'].map((resource) => list(resource)));
        return { projects: projects!.length, projectTasks: tasks!.length, personalTasks: personal!.length, assignments: assignments!.length,
          openTasks: [...tasks!, ...personal!].filter((item) => !item.isDone && item.status !== 'done').length,
          pendingAssignments: assignments!.filter((item) => item.status !== 'Completed').length,
          gpa: calculateGpa(courses!.map((course) => ({ credits: Number(course.credits), score10: course.score10 as number | null }))) };
      }
      if (name === 'get_lifeos_help') {
        const { topic } = helpSchema.parse(input);
        const words = normalizeText(topic).split(/\s+/);
        const selected = help.filter((item) => words.some((word) => normalizeText(item.title + ' ' + item.text).includes(word)));
        return { items: selected.length ? selected : help };
      }
      if (name === 'search_lifeos') {
        const args = searchSchema.parse(input);
        const words = normalizeText(args.query).split(/\s+/).filter(Boolean);
        const groups = await Promise.all((args.resources ?? [...searchableResources]).map(async (resource) => {
          return (await list(resource, args.projectId))
          .filter((item) => (!args.projectId || resource === 'project-tasks' || resource === 'projects' && item.id === args.projectId) &&
            (!args.courseId || item.courseId === args.courseId || resource === 'courses' && item.id === args.courseId) &&
            (!args.status || normalizeText(String(item.status)) === normalizeText(args.status)) &&
            (!args.priority || normalizeText(String(item.priority)) === normalizeText(args.priority)) &&
            (!args.from || dateOf(item).slice(0, 10) >= args.from) && (!args.to || dateOf(item).slice(0, 10) <= args.to) &&
            words.every((word) => normalizeText([item.title, item.name, item.code, item.content, item.projectTitle].join(' ')).includes(word)))
          .map((item) => ({ ...item, content: typeof item.content === 'string' ? item.content.slice(0, 500) : item.content, resource, source: sourceFor(resource, item) }));
        }));
        const items = groups.flat();
        return { items: items.slice(args.offset, args.offset + 25), total: items.length, nextOffset: args.offset + 25 < items.length ? args.offset + 25 : null };
      }
      if (name === 'open_lifeos_item') {
        const args = openSchema.parse(input);
        const item = (await list(args.resource)).find((item) => item.id === args.id);
        if (!item) throw new HttpError(404, 'Không tìm thấy mục trong tài khoản.');
        return { item, source: sourceFor(args.resource, item) };
      }
      if (name === 'get_lifeos_agenda') return agenda(input);
      if (name === 'find_free_slots') return free(input);
      if (name === 'calculate_lifeos_grades') {
        const args = gradeSchema.parse(input);
        const courses = (await list('courses')).filter((course) => !args.semester || course.semester === args.semester);
        if (args.courseId && !courses.some((course) => course.id === args.courseId)) throw new HttpError(404, 'Không tìm thấy môn học.');
        const selected = args.courseId ? courses.filter((course) => course.id === args.courseId) : courses;
        if (args.target !== undefined && !args.courseId) throw new HttpError(400, 'Chọn môn học cần tính điểm mục tiêu.');
        try {
          return { gpa: calculateGpa(courses.map((course) => ({ credits: Number(course.credits), score10: course.score10 as number | null }))),
            courses: selected.map((course) => ({ id: course.id, name: course.name, source: sourceFor('courses', course),
              score: calculateCourseScore((course.gradeComponents ?? []) as GradeComponent[]),
              ...(args.target === undefined ? {} : { required: calculateGradeTarget((course.gradeComponents ?? []) as GradeComponent[], args.target, args.componentName) }) })) };
        } catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Không đủ dữ liệu điểm.'); }
      }
      if (name === 'preview_lifeos_schedule') {
        const args = planSchema.parse(input);
        const { slots, schedule } = await free({ ...argsFromRange(args), durationMinutes: 15 }, 15);
        const budget = new Map<string, number>();
        for (const block of schedule.busy.filter((item) => item.kind === 'work')) budget.set(String(block.date), (budget.get(String(block.date)) ?? 0) + Number(block.end) - Number(block.start));
        const blocks: Row[] = [];
        const unscheduled: Row[] = [];
        const today = localClock(args.timeZone).date;
        for (const requested of args.items) {
          const item = (await list(requested.resource)).find((item) => item.id === requested.id);
          if (!item || item.isDone || item.status === 'done' || item.status === 'Completed' || item.fixedSlot || item.category === 'employment') throw new HttpError(400, 'Chọn công việc linh hoạt hoặc bài tập chưa hoàn thành trong tài khoản.');
          let remaining = Math.ceil(requested.minutes / 15) * 15;
          const due = dateOf(item).slice(0, 10);
          for (const slot of slots) {
            if (due && due >= today && slot.date > due) continue;
            while (remaining >= 15 && blocks.length < 100) {
              const minutes = Math.floor(Math.min(remaining, 90, slot.end - slot.start, 180 - (budget.get(slot.date) ?? 0)) / 15) * 15;
              if (minutes < 15) break;
              blocks.push({ taskId: requested.id, workKind: requested.resource === 'assignments' ? 'assignment' : 'task', date: slot.date, start: slot.start, end: slot.start + minutes });
              budget.set(slot.date, (budget.get(slot.date) ?? 0) + minutes);
              slot.start += minutes + 15;
              remaining -= minutes;
            }
          }
          if (remaining) unscheduled.push({ id: requested.id, title: item.title, remainingMinutes: remaining });
        }
        return { suggestedChange: blocks.length ? { resource: 'task-blocks', operation: 'create', data: { blocks } } : null, unscheduled,
          note: 'Bản xem trước chưa lưu. Tối đa 3 giờ/ngày, 90 phút/phiên, nghỉ 15 phút. Phút yêu cầu được làm tròn lên bội số 15.' };
      }
      throw new HttpError(400, 'Công cụ không được hỗ trợ.');
    },
  };
}
const argsFromRange = ({ from, to, timeZone }: { from: string; to: string; timeZone: string }) => ({ from, to, timeZone });
