import { z } from 'zod';
import type { StudyResourceName } from '../application/models.js';
import type { AppServices } from '../application/services/index.js';
import { HttpError } from '../http/errors.js';
import type { TaskBlockInput, TaskCalendarRepository } from '../infrastructure/repositories/task-calendar-repository.js';
import { calendarBlocksSchema, calendarTimeSchema } from '../routes/calendar.js';
import { availabilitySchema, feedbackSchema } from '../routes/planning.js';
import { profilePatch } from '../routes/profile.js';
import { pickPresentKeys, projectPatch, projectSchema, taskPatch, taskSchema } from '../routes/projects.js';
import { studySchemas, validateSessionTimes } from '../routes/study.js';
import { parsePersonalTask, personalTaskPatch, personalTaskSchema } from '../routes/tasks.js';

type Row = Record<string, unknown>;
type Operation = 'create' | 'update' | 'delete';
type Scope = { userId: string; id?: string; projectId?: string; semester?: string };
type WriteAction = {
  schema: z.ZodType<Row>;
  needsId: boolean;
  prepare: (scope: Scope, input: Row) => { details: Row; apply: () => Promise<unknown> };
};
type Resource = { label: string; read: (scope: Scope) => Promise<unknown>; writes?: Partial<Record<Operation, WriteAction>> };

function write<T extends Row>(schema: z.ZodType<T>, apply: (scope: Scope, data: T) => Promise<unknown>, needsId = false) {
  return {
    schema, needsId,
    prepare: (scope: Scope, input: Row) => {
      const value = schema.parse(input);
      const details = submittedFields(value, input);
      return { details, apply: () => apply(scope, value) };
    },
  } satisfies WriteAction;
}

function submittedFields<T extends Row>(value: T, input: Row) {
  const details = pickPresentKeys(value, input);
  if (Object.keys(input).some((key) => !Object.hasOwn(details, key))) {
    throw new HttpError(400, 'Có trường dữ liệu không được hỗ trợ cho thao tác này.');
  }
  return details;
}

// Zod provides typed defaults on creation. For patches, retain only explicitly supplied fields.
function patch<T extends Row>(schema: z.ZodType<T>, apply: (scope: Scope, data: Partial<T>) => Promise<unknown>, needsId = true): WriteAction {
  return {
    schema, needsId,
    prepare: (scope, input) => {
      const details = submittedFields(schema.parse(input), input);
      if (!Object.keys(details).length) throw new HttpError(400, 'Cần có ít nhất một trường để sửa.');
      return { details, apply: () => apply(scope, details) };
    },
  };
}

const remove = (apply: (scope: Scope) => Promise<void>) => write(z.strictObject({}), apply, true);
const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd');
const isRow = (value: unknown): value is Row => value !== null && typeof value === 'object' && !Array.isArray(value);
const rowLabel = (row: Row) => String(row.title ?? row.name ?? row.fullName ?? row.date ?? '');
const clock = (minute: unknown) => typeof minute === 'number'
  ? `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}` : '';
const minuteOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const defaultHours = Array.from({ length: 7 }, (_, day) => ({ weekday: day + 1, start: '07:00', end: '22:00' }));
const courseResources = new Set(['assignments', 'exams', 'notes', 'course-sessions', 'study-logs']);

export function createAssistantActions(services: AppServices, calendar: TaskCalendarRepository) {
  const freeHours = async (userId: string) => (await services.planning.get(userId)).availability ?? defaultHours;
  async function checkSchedule(userId: string, blocks: TaskBlockInput[], ignoredId?: string) {
    const windows = await freeHours(userId);
    for (const block of blocks) {
      const weekday = (new Date(`${block.date}T12:00:00Z`).getUTCDay() + 6) % 7 + 1;
      if (!windows.some((window) => window.weekday === weekday &&
        block.start >= minuteOf(window.start) && block.end <= minuteOf(window.end))) {
        throw new HttpError(409, `Phiên ngày ${block.date} ngoài khung giờ rảnh. Hãy chọn giờ khác hoặc hỏi lại người dùng.`, 'ASSISTANT_OUTSIDE_AVAILABILITY');
      }
    }
    await calendar.preview(userId, blocks, ignoredId);
  }
  const studyNames: Record<StudyResourceName, string> = {
    courses: 'Môn học', assignments: 'Bài tập', exams: 'Kỳ thi', notes: 'Ghi chú học tập',
    schedule: 'Sự kiện cá nhân', 'course-sessions': 'Buổi học hằng tuần', 'study-logs': 'Nhật ký tự học',
  };
  const studyResources = Object.fromEntries((Object.keys(studyNames) as StudyResourceName[]).map((name) => [name, {
    label: studyNames[name], read: ({ userId }) => services.study.list(userId, name),
    writes: {
      create: write<Row>(studySchemas[name], ({ userId }, data) => {
        validateSessionTimes(name, data);
        return services.study.create(userId, name, data);
      }),
      update: patch<Row>(studySchemas[name].partial(), ({ userId, id }, data) => {
        validateSessionTimes(name, data);
        return services.study.update(userId, name, id!, data);
      }),
      delete: remove(({ userId, id }) => services.study.delete(userId, name, id!)),
    },
  } satisfies Resource]));

  const resources = new Map<string, Resource>(Object.entries({
    ...studyResources,
    projects: {
      label: 'Dự án', read: ({ userId }) => services.projects.list(userId),
      writes: {
        create: write(projectSchema, ({ userId }, data) => services.projects.create(userId, data)),
        update: patch(projectPatch, ({ userId, id }, data) => services.projects.update(userId, id!, data)),
        delete: remove(({ userId, id }) => services.projects.delete(userId, id!)),
      },
    },
    'project-tasks': {
      label: 'Công việc dự án', read: async ({ userId, projectId }) => {
        if (projectId) return services.projects.listTasks(userId, projectId);
        const projects = await services.projects.list(userId);
        const results = [];
        for (const project of projects) {
          const tasks = await services.projects.listTasks(userId, project.id);
          results.push(...tasks.map((task) => ({ ...task, projectId: project.id, projectTitle: project.title })));
        }
        return results;
      },
      writes: {
        create: write(taskSchema, ({ userId, projectId }, data) => services.projects.createTask(userId, projectId!, data)),
        update: patch(taskPatch, ({ userId, projectId, id }, data) => services.projects.updateTask(userId, projectId!, id!, data)),
        delete: remove(({ userId, projectId, id }) => services.projects.deleteTask(userId, projectId!, id!)),
      },
    },
    tasks: {
      label: 'Việc cá nhân và lịch đi làm', read: ({ userId }) => services.projects.listPersonalTasks(userId),
      writes: {
        create: write(personalTaskSchema, ({ userId }, data) => services.projects.createPersonalTask(userId, parsePersonalTask(data))),
        update: patch(personalTaskPatch, ({ userId, id }, data) => services.projects.updatePersonalTask(userId, id!, data)),
        delete: remove(({ userId, id }) => services.projects.deletePersonalTask(userId, id!)),
      },
    },
    'task-blocks': {
      label: 'Phiên làm việc trên lịch trình', read: ({ userId }) => calendar.list(userId),
      writes: {
        create: write(calendarBlocksSchema, ({ userId }, data) => calendar.create(userId, data.blocks)),
        update: write(calendarTimeSchema, ({ userId, id }, data) => calendar.move(userId, id!, data), true),
        delete: remove(({ userId, id }) => calendar.remove(userId, id!)),
      },
    },
    availability: {
      label: 'Khung giờ rảnh', read: ({ userId }) => freeHours(userId),
      writes: { update: write(availabilitySchema, ({ userId }, data) => services.planning.saveAvailability(userId, data.windows)) },
    },
    'study-feedback': {
      label: 'Phản hồi gợi ý học theo môn', read: async ({ userId }) => (await services.planning.get(userId)).feedback,
      writes: { update: write(feedbackSchema, ({ userId, id }, data) => services.planning.saveFeedback(userId, id!, data.preference), true) },
    },
    'study-summary': { label: 'Thống kê học tập', read: ({ userId, semester }) => services.study.summary(userId, semester) },
    profile: {
      label: 'Hồ sơ cá nhân', read: async ({ userId }) => {
        const { fullName, dob, avatarUrl, phone, location, bio } = await services.profile.get(userId);
        return { fullName, dob, avatarUrl, phone, location, bio };
      },
      writes: { update: patch(profilePatch, ({ userId }, data) => services.profile.update(userId, data), false) },
    },
  } satisfies Record<string, Resource>));

  const resourceKeys = [...resources.keys()];
  const catalog = [...resources].map(([key, resource]) => `${key}: ${resource.label} (${Object.keys(resource.writes ?? {}).join(', ') || 'đọc'})`).join('\n');
  const args = z.strictObject({ resource: z.enum(resourceKeys), id: z.uuid().optional(), projectId: z.uuid().optional() });
  const readArgs = args.extend({ query: z.string().max(160).optional(), semester: z.string().max(40).optional(), courseId: z.uuid().optional(),
    from: z.iso.date().optional(), to: z.iso.date().optional(), offset: z.number().int().min(0).max(10000).optional() });
  const writeArgs = args.extend({ operation: z.enum(['create', 'update', 'delete']), data: z.record(z.string(), z.unknown()).optional() });
  const describeArgs = z.strictObject({ resource: z.enum(resourceKeys), operation: writeArgs.shape.operation });

  const tools = [
    { name: 'read_lifeos', description: 'Đọc dữ liệu của người dùng. Có thể tìm theo tên và theo ngày. Đọc courses để tra GPA và course-sessions để biết lịch học.', schema: readArgs },
    { name: 'describe_lifeos_change', description: 'Xem trường dữ liệu và quy tắc của một thao tác trước khi soạn đề xuất.', schema: describeArgs },
    { name: 'propose_lifeos_change', description: 'Tạo một đề xuất thay đổi để người dùng duyệt. Dùng ID lấy từ read_lifeos. Có thể đề xuất nhiều thay đổi riêng trong một lượt.', schema: writeArgs },
  ].map(({ name, description, schema }) => ({ type: 'function', name, description, strict: false, parameters: z.toJSONSchema(schema) }));

  return {
    catalog, tools,
    async context(userId: string, scope: { kind: 'course' | 'project'; id: string }) {
      const items = scope.kind === 'course' ? await services.study.list(userId, 'courses') : await services.projects.list(userId);
      const item = items.find((row) => row.id === scope.id);
      if (!item) throw new HttpError(404, 'Không tìm thấy môn học hoặc dự án này trong tài khoản.');
      return { ...scope, title: String('name' in item ? item.name : 'title' in item ? item.title : '') };
    },
    async read(userId: string, input: unknown) {
      const { resource, id, projectId, semester, query, from, to, courseId, offset = 0 } = readArgs.parse(input);
      const result = await resources.get(resource)!.read({ userId, id, projectId, semester });
      if (!Array.isArray(result)) return result;
      const matches = result.filter((row): row is Row => {
        if (!isRow(row) || (id && row.id !== id) || (courseId && row.courseId !== courseId)) return false;
        if (query && !normalize(`${rowLabel(row)} ${row.code ?? ''} ${row.projectTitle ?? ''}`).includes(normalize(query))) return false;
        const date = row.date ?? row.dueDate ?? row.deadline;
        return typeof date !== 'string' ? !from && !to : (!from || date.slice(0, 10) >= from) && (!to || date.slice(0, 10) <= to);
      });
      const items = matches.slice(offset, offset + 25).map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
        typeof value === 'string' && value.length > (id ? 4000 : 500) ? `${value.slice(0, id ? 4000 : 500)}…` : value,
      ])));
      return { items, total: matches.length, nextOffset: offset + items.length < matches.length ? offset + items.length : null };
    },
    describe(input: unknown) {
      const { resource, operation } = describeArgs.parse(input);
      const action = resources.get(resource)!.writes?.[operation];
      if (!action) throw new HttpError(400, 'Thao tác này không có trong LifeOS.');
      return { requiresId: action.needsId, requiresProjectId: resource === 'project-tasks', fields: z.toJSONSchema(action.schema, { io: 'input' }) };
    },
    async prepare(userId: string, input: unknown, context?: { kind: 'course' | 'project'; id: string }) {
      const args = writeArgs.parse(input);
      const { resource, operation, id, data = {} } = args;
      const projectId = args.projectId ?? (operation === 'create' && resource === 'project-tasks' && context?.kind === 'project' ? context.id : undefined);
      if (operation === 'create' && context?.kind === 'course' && courseResources.has(resource) && !Object.hasOwn(data, 'courseId')) {
        data.courseId = context.id;
      }
      const entry = resources.get(resource)!;
      const action = entry.writes?.[operation];
      if (!action || (action.needsId && !id) || (resource === 'project-tasks' && !projectId)) {
        throw new HttpError(400, 'Thiếu dữ liệu cần thiết hoặc thao tác này không có trong LifeOS.');
      }
      const scope = { userId, id, projectId };
      const { details, apply } = action.prepare(scope, data);
      let preview: Row = details;
      let target = rowLabel(details);
      let original: Row | undefined;
      let validateSchedule: (() => Promise<void>) | undefined;
      if (action.needsId) {
        const rows = await (resource === 'study-feedback' ? resources.get('courses')! : entry).read(scope);
        original = Array.isArray(rows) ? rows.find((row) => isRow(row) && row.id === id) as Row | undefined : undefined;
        if (!original) throw new HttpError(404, 'Không tìm thấy mục này trong tài khoản.');
        target = rowLabel(original);
      }
      if (resource === 'project-tasks') {
        const project = await services.projects.get(userId, projectId!);
        target = [project.title, target].filter(Boolean).join(' / ');
      }
      if (typeof details.courseId === 'string' || (resource === 'course-sessions' && typeof original?.courseId === 'string')) {
        const courses = await services.study.list(userId, 'courses');
        const courseId = details.courseId ?? original?.courseId;
        const course = courses.find((row) => row.id === courseId);
        if (course && details.courseId) preview = { ...preview, courseId: course.name ?? course.id };
        if (resource === 'course-sessions') {
          const session = original ?? details;
          const sessionCourse = courses.find((row) => row.id === session.courseId);
          const day = Number(session.weekday);
          target = `${sessionCourse?.name ?? 'Buổi học'} · ${day === 7 ? 'Chủ nhật' : `Thứ ${day + 1}`} · ${session.startTime}–${session.endTime}`;
        }
      }
      if (resource === 'task-blocks') {
        if (operation === 'create') {
          const { blocks } = calendarBlocksSchema.parse(details);
          validateSchedule = () => checkSchedule(userId, blocks);
        } else if (operation === 'update' && original) {
          const block = { ...calendarTimeSchema.parse(details), taskId: String(original.taskId) };
          validateSchedule = () => checkSchedule(userId, [block], id);
        }
        await validateSchedule?.();
        const tasks = await services.projects.listPersonalTasks(userId);
        const projectTasks = await resources.get('project-tasks')!.read({ userId });
        const names = new Map([...tasks, ...(Array.isArray(projectTasks) ? projectTasks.filter(isRow) : [])]
          .map((task) => [task.id, task.title]));
        if (original) {
          target = `${names.get(original.taskId) ?? 'Phiên làm việc'} · ${original.date} · ${clock(original.start)}–${clock(original.end)}`;
        }
        if (Array.isArray(details.blocks)) preview = { ...preview, blocks: details.blocks.map((block: Row) => {
          const title = names.get(block.taskId);
          if (!title) throw new HttpError(404, 'Không tìm thấy công việc cần xếp giờ trong tài khoản.');
          return { ...block, taskId: title };
        }) };
      }
      return { operation, resource: entry.label, resourceKey: resource, target, details: preview, apply: async () => {
        await validateSchedule?.();
        return apply();
      } };
    },
  };
}
