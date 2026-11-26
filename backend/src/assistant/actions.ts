import { z } from 'zod';
import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import { db } from '../database/index.js';
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
import { ProjectResourcesRepository } from '../infrastructure/repositories/project-resources-repository.js';
import { createWorkspaceTools, sourceFor } from './workspace-tools.js';
import type { AssistantFile, AssistantTool } from './provider.js';
import { parseTimeRange } from '../application/assistant-math.js';

type Row = Record<string, unknown>;
type Operation = 'create' | 'update' | 'delete';
type Scope = { userId: string; id?: string; projectId?: string; courseId?: string; semester?: string };
export type ChangeCommand = { input: Record<string, unknown>; attachment?: AssistantFile };
export const fingerprint = (value: unknown): string => createHash('sha256').update(JSON.stringify(value, (_key, entry) =>
  entry && typeof entry === 'object' && !Array.isArray(entry) ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry) ?? 'null').digest('hex');
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
  const projectResources = new ProjectResourcesRepository();
  const courseFiles = new ProjectResourcesRepository('course');
  const workspaceRepository = (kind: string) => kind === 'course' ? courseFiles : projectResources;
  const workspaceInput = {
    workspaceKind: z.enum(['project', 'course']), workspaceId: z.uuid(),
  };
  async function listFiles(scope: Scope) {
    const workspaces = scope.projectId ? [{ kind: 'project', id: scope.projectId }] : scope.courseId ? [{ kind: 'course', id: scope.courseId }] : [
      ...(await services.projects.list(scope.userId)).map((item) => ({ kind: 'project', id: item.id })),
      ...(await services.study.list(scope.userId, 'courses')).map((item) => ({ kind: 'course', id: item.id })),
    ];
    return (await Promise.all(workspaces.map(async ({ kind, id }) => (await workspaceRepository(kind).listFiles(scope.userId, id))
      .map((file) => ({ ...file, workspaceKind: kind, workspaceId: id, projectId: kind === 'project' ? id : undefined, courseId: kind === 'course' ? id : undefined }))))).flat();
  }
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
    files: {
      label: 'Tài liệu', read: listFiles,
      writes: {
        create: write(z.object({ ...workspaceInput, taskId: z.uuid().nullable().optional(), name: z.string().min(1).max(180), contentsBase64: z.string().min(1) }),
          ({ userId }, data) => workspaceRepository(data.workspaceKind).addFile(userId, data.workspaceId, data.taskId ?? null, data.name, Buffer.from(data.contentsBase64, 'base64'))),
        delete: remove(async (scope) => {
          const file = (await listFiles(scope)).find((item) => item.id === scope.id);
          if (!file) throw new HttpError(404, 'Không tìm thấy tài liệu.');
          await workspaceRepository(file.workspaceKind).deleteFile(scope.userId, file.workspaceId, scope.id!);
        }),
      },
    },
    'timer-start': {
      label: 'Bắt đầu hoặc chuyển phiên bấm giờ', read: async () => [],
      writes: { create: write(z.object({ ...workspaceInput, taskId: z.uuid().nullable().optional(), switchFrom: z.uuid().optional() }),
        async ({ userId }, data) => {
          if (data.workspaceKind === 'course' && !data.taskId) throw new HttpError(400, 'Chọn bài tập để bấm giờ.');
          return workspaceRepository(data.workspaceKind).startTimer(userId, data.workspaceId, data.taskId ?? null, data.switchFrom);
        }) },
    },
    'timer-stop': {
      label: 'Dừng và lưu phiên bấm giờ', read: async () => [],
      writes: { create: write(z.object({ ...workspaceInput, sessionId: z.uuid() }),
        ({ userId }, data) => workspaceRepository(data.workspaceKind).stopTimer(userId, data.workspaceId, data.sessionId)) },
    },
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
  const args = z.strictObject({ resource: z.enum(resourceKeys), id: z.uuid().optional(), projectId: z.uuid().optional(), courseId: z.uuid().optional() });
  const readArgs = args.extend({ query: z.string().max(160).optional(), semester: z.string().max(40).optional(), courseId: z.uuid().optional(),
    from: z.iso.date().optional(), to: z.iso.date().optional(), status: z.string().max(40).optional(), priority: z.string().max(24).optional(), offset: z.number().int().min(0).max(10000).optional() });
  const writeArgs = args.extend({ operation: z.enum(['create', 'update', 'delete']), data: z.record(z.string(), z.unknown()).optional() });
  const describeArgs = z.strictObject({ resource: z.enum(resourceKeys), operation: writeArgs.shape.operation });

  const workspaceTools = createWorkspaceTools(async () => []);
  const tools: AssistantTool[] = [
    { name: 'read_lifeos', description: 'Đọc dữ liệu của người dùng. Có thể tìm theo tên và theo ngày. Đọc courses để tra GPA và course-sessions để biết lịch học.', schema: readArgs },
    { name: 'describe_lifeos_change', description: 'Xem trường dữ liệu và quy tắc của một thao tác trước khi soạn đề xuất.', schema: describeArgs },
    { name: 'propose_lifeos_change', description: 'Tạo một đề xuất thay đổi để người dùng duyệt. Dùng ID lấy từ read_lifeos. Có thể đề xuất nhiều thay đổi riêng trong một lượt.', schema: writeArgs },
  ].map(({ name, description, schema }) => ({ type: 'function', name, description, strict: false, parameters: z.toJSONSchema(schema) }));
  tools.push(...workspaceTools.tools);
  tools.push(...[
    { name: 'get_lifeos_timer', description: 'Đọc phiên đang chạy, lịch sử và tổng thời gian của dự án/môn hoặc task/bài tập.', schema: z.strictObject({ ...workspaceInput, taskId: z.uuid().optional() }) },
    { name: 'read_lifeos_file', description: 'Đọc từng phần tệp TXT/MD/CSV/JSON UTF-8 tối đa 80 KB trong tài khoản. Dùng offset/limit và nextOffset để đọc thêm. Tệp nhị phân cần đính kèm vào chat.', schema: z.strictObject({ ...workspaceInput, fileId: z.uuid(), offset: z.number().int().min(0).max(80000).optional(), limit: z.number().int().min(1).max(12000).optional() }) },
    { name: 'propose_attachment_upload', description: 'Đề xuất lưu tệp người dùng vừa đính kèm vào dự án/môn hoặc task/bài tập. Không truyền nội dung tệp.', schema: z.strictObject({ ...workspaceInput, taskId: z.uuid().optional() }) },
  ].map(({ name, description, schema }) => ({ type: 'function', name, description, strict: false, parameters: z.toJSONSchema(schema) })));

  return {
    catalog, tools,
    label: (resource: string) => resources.get(resource)?.label ?? resource,
    async lock(userId: string, input: Record<string, unknown>) {
      if (input.resource === 'availability') await db.selectFrom('study_availability').select('user_id').where('user_id', '=', userId).forUpdate().execute();
      if (input.resource === 'study-feedback' && typeof input.id === 'string') await db.selectFrom('study_feedback').select('user_id')
        .where('user_id', '=', userId).where('course_id', '=', input.id).forUpdate().execute();
      if (typeof input.id !== 'string' || !z.uuid().safeParse(input.id).success) return;
      const resource = String(input.resource);
      if (resource === 'tasks' || resource === 'project-tasks') {
        await db.selectFrom('tasks').leftJoin('projects', 'projects.id', 'tasks.project_id').select('tasks.id')
          .where('tasks.id', '=', input.id).where((eb) => eb.or([eb('tasks.personal_user_id', '=', userId), eb('projects.user_id', '=', userId)]))
          .forUpdate('tasks').execute();
        return;
      }
      const tables: Record<string, string> = { projects: 'projects', courses: 'courses', assignments: 'assignments', exams: 'exams', notes: 'notes',
        schedule: 'schedule_items', 'course-sessions': 'course_sessions', 'study-logs': 'study_logs', 'task-blocks': 'task_schedule_blocks' };
      const table = tables[resource];
      if (table) await sql`select id from ${sql.table(table)} where id = ${input.id} and user_id = ${userId} for update`.execute(db);
      if (resource === 'projects' && input.operation === 'delete') {
        await db.selectFrom('tasks').select('id').where('project_id', '=', input.id)
          .where('project_id', 'in', db.selectFrom('projects').select('id').where('user_id', '=', userId)).forUpdate().execute();
      }
    },
    async executeRead(userId: string, name: string, input: unknown) {
      if (name === 'get_lifeos_timer' || name === 'read_lifeos_file') {
        const common = z.strictObject({ ...workspaceInput, taskId: z.uuid().optional(), fileId: z.uuid().optional(),
          offset: z.number().int().min(0).max(80000).default(0), limit: z.number().int().min(1).max(12000).default(6000) }).parse(input);
        const repository = workspaceRepository(common.workspaceKind);
        if (name === 'get_lifeos_timer') return repository.timer(userId, common.workspaceId, common.taskId);
        if (!common.fileId) throw new HttpError(400, 'Thiếu ID tài liệu.');
        const file = await repository.getFile(userId, common.workspaceId, common.fileId);
        if (!/\.(txt|md|csv|json)$/i.test(file.name) || file.contents.length > 80000) return { name: file.name, readable: false, note: 'Chỉ đọc trực tiếp TXT/MD/CSV/JSON tối đa 80 KB. Đính kèm PDF/ảnh vào chat để phân tích.' };
        let content: string;
        try { content = new TextDecoder('utf-8', { fatal: true }).decode(file.contents); }
        catch { throw new HttpError(400, 'Tệp văn bản cần dùng mã hóa UTF-8.'); }
        return { name: file.name, readable: true, content: content.slice(common.offset, common.offset + common.limit), totalCharacters: content.length,
          nextOffset: common.offset + common.limit < content.length ? common.offset + common.limit : null,
          source: { title: file.name, href: common.workspaceKind === 'course' ? `/study?course=${common.workspaceId}&tab=documents` : `/projects?project=${common.workspaceId}` } };
      }
      return createWorkspaceTools(async (resource, projectId) => {
        const result = await resources.get(resource)!.read({ userId, projectId });
        return Array.isArray(result) ? result.filter(isRow) : [];
      }).execute(name, input);
    },
    validate(input: unknown) {
      const parsed = writeArgs.parse(input);
      const action = resources.get(parsed.resource)!.writes?.[parsed.operation];
      if (!action || action.needsId && !parsed.id || parsed.resource === 'project-tasks' && !parsed.projectId) throw new HttpError(400, 'Thiếu đối tượng hoặc thao tác không được hỗ trợ.');
      submittedFields(action.schema.parse(parsed.data ?? {}), parsed.data ?? {});
      return parsed;
    },
    async context(userId: string, scope: { kind: 'course' | 'project'; id: string }) {
      const items = scope.kind === 'course' ? await services.study.list(userId, 'courses') : await services.projects.list(userId);
      const item = items.find((row) => row.id === scope.id);
      if (!item) throw new HttpError(404, 'Không tìm thấy môn học hoặc dự án này trong tài khoản.');
      return { ...scope, title: String('name' in item ? item.name : 'title' in item ? item.title : '') };
    },
    async read(userId: string, input: unknown) {
      const { resource, id, projectId, semester, query, from, to, courseId, status, priority, offset = 0 } = readArgs.parse(input);
      const result = await resources.get(resource)!.read({ userId, id, projectId, semester, courseId });
      if (!Array.isArray(result)) return result;
      const semesterCourses = semester && courseResources.has(resource) ? new Set((await services.study.list(userId, 'courses'))
        .filter((course) => course.semester === semester).map((course) => course.id)) : undefined;
      const matches = result.filter((row): row is Row => {
        if (!isRow(row) || (id && row.id !== id) || (courseId && row.courseId !== courseId && !(resource === 'courses' && row.id === courseId))) return false;
        if (semester && resource === 'courses' && row.semester !== semester || semesterCourses && !semesterCourses.has(String(row.courseId))) return false;
        if (status && normalize(String(row.status)) !== normalize(status) || priority && normalize(String(row.priority)) !== normalize(priority)) return false;
        if (query && !normalize(`${rowLabel(row)} ${row.code ?? ''} ${row.projectTitle ?? ''}`).includes(normalize(query))) return false;
        const date = row.date ?? row.dueDate ?? row.deadline ?? row.endDate;
        return typeof date !== 'string' ? !from && !to : (!from || date.slice(0, 10) >= from) && (!to || date.slice(0, 10) <= to);
      });
      const items = matches.slice(offset, offset + 25).map((row) => ({ ...Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
        typeof value === 'string' && value.length > (id ? 4000 : 500) ? `${value.slice(0, id ? 4000 : 500)}…` : value,
      ])), ...(sourceFor(resource, row) ? { source: sourceFor(resource, row) } : {}) }));
      return { items, total: matches.length, nextOffset: offset + items.length < matches.length ? offset + items.length : null };
    },
    describe(input: unknown) {
      const { resource, operation } = describeArgs.parse(input);
      const action = resources.get(resource)!.writes?.[operation];
      if (!action) throw new HttpError(400, 'Thao tác này không có trong LifeOS.');
      return { requiresId: action.needsId, requiresProjectId: resource === 'project-tasks', fields: z.toJSONSchema(action.schema, { io: 'input' }) };
    },
    async prepare(userId: string, input: unknown, context?: { kind: 'course' | 'project'; id: string }, attachment?: AssistantFile) {
      const args = writeArgs.parse(input);
      const { resource, operation, id, data = {} } = args;
      if (resource === 'courses' && (Object.hasOwn(data, 'score10') || Object.hasOwn(data, 'grade'))) {
        throw new HttpError(400, 'Điểm tổng và điểm chữ được tính từ đầu điểm. Hãy cập nhật gradeComponents với tổng tỷ trọng 100%.');
      }
      if (resource === 'files' && operation === 'create') {
        if (!attachment) throw new HttpError(400, 'Đính kèm tệp cần lưu vào tin nhắn này.');
        data.name = attachment.name;
        data.contentsBase64 = attachment.data;
        const destination = z.object(workspaceInput).parse(data);
        await workspaceRepository(destination.workspaceKind).timer(userId, destination.workspaceId, typeof data.taskId === 'string' ? data.taskId : undefined);
      }
      const projectId = args.projectId ?? (operation === 'create' && resource === 'project-tasks' && context?.kind === 'project' ? context.id : undefined);
      if (operation === 'create' && context?.kind === 'course' && courseResources.has(resource) && !Object.hasOwn(data, 'courseId')) {
        data.courseId = context.id;
      }
      const entry = resources.get(resource)!;
      const action = entry.writes?.[operation];
      if (!action || (action.needsId && !id) || (resource === 'project-tasks' && !projectId)) {
        throw new HttpError(400, 'Thiếu dữ liệu cần thiết hoặc thao tác này không có trong LifeOS.');
      }
      const scope = { userId, id, projectId, courseId: args.courseId };
      const { details, apply } = action.prepare(scope, data);
      let preview: Row = details;
      let target = rowLabel(details);
      let original: Row | undefined;
      let validateSchedule: (() => Promise<void>) | undefined;
      const currentRecord = async (): Promise<Row | undefined> => {
        const rows = await (resource === 'study-feedback' ? resources.get('courses')! : entry).read(scope);
        if (resource === 'availability' && Array.isArray(rows)) return { windows: rows };
        const current = Array.isArray(rows) ? rows.find((row) => isRow(row) && row.id === id) : rows;
        if (!isRow(current)) return undefined;
        if (resource === 'study-feedback') {
          const feedback = (await services.planning.get(userId)).feedback;
          return { ...current, preference: feedback.find((item) => item.courseId === id)?.preference ?? null };
        }
        return current;
      };
      if (action.needsId || operation === 'update') {
        original = await currentRecord();
        if (action.needsId && !original) throw new HttpError(404, 'Không tìm thấy mục này trong tài khoản.');
        if (original) target = rowLabel(original) || entry.label;
      }
      if (original && operation === 'update') validateSessionTimes(resource as StudyResourceName, { ...original, ...details });
      if (resource === 'timer-start' || resource === 'timer-stop') {
        const kind = String(details.workspaceKind);
        const workspaceId = String(details.workspaceId);
        if (kind === 'course' && resource === 'timer-start' && !details.taskId) throw new HttpError(400, 'Chọn bài tập để bấm giờ.');
        const state = await workspaceRepository(kind).timer(userId, workspaceId, typeof details.taskId === 'string' ? details.taskId : undefined);
        if (resource === 'timer-stop' && !state.sessions.some((session) => session.id === details.sessionId)) throw new HttpError(404, 'Không tìm thấy phiên bấm giờ.');
        if (resource === 'timer-start' && state.active && state.active.id !== details.switchFrom && state.active.taskId !== (details.taskId ?? null)) throw new HttpError(409, 'Đang có phiên khác. Đọc phiên đang chạy và xin xác nhận chuyển phiên.');
        target = resource === 'timer-start' ? 'Bắt đầu bấm giờ' : 'Dừng và lưu thời gian';
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
          const block = { ...calendarTimeSchema.parse(details), taskId: String(original.taskId), workKind: original.workKind as 'task' | 'assignment' | undefined };
          validateSchedule = () => checkSchedule(userId, [block], id);
        }
        await validateSchedule?.();
        const tasks = await services.projects.listPersonalTasks(userId);
        const projectTasks = await resources.get('project-tasks')!.read({ userId });
        const names = new Map([...tasks, ...(Array.isArray(projectTasks) ? projectTasks.filter(isRow) : [])]
          .map((task) => [task.id, task.title]));
        if (Array.isArray(details.blocks) && details.blocks.some((block: Row) => block.workKind === 'assignment') || original?.workKind === 'assignment') {
          for (const assignment of await services.study.list(userId, 'assignments')) names.set(assignment.id, String(assignment.title));
        }
        if (original) {
          target = `${names.get(original.taskId) ?? 'Phiên làm việc'} · ${original.date} · ${clock(original.start)}–${clock(original.end)}`;
        }
        if (Array.isArray(details.blocks)) preview = { ...preview, blocks: details.blocks.map((block: Row) => {
          const title = names.get(block.taskId);
          if (!title) throw new HttpError(404, 'Không tìm thấy công việc cần xếp giờ trong tài khoản.');
          return { ...block, taskId: title };
        }) };
      }
      if (resource === 'files' && operation === 'create') { const { contentsBase64: _contents, ...metadata } = preview; preview = metadata; }
      const before = original && operation === 'update' ? Object.fromEntries(Object.keys(details).map((key) => [key, original![key] ?? null])) : original;
      const impact: string[] = [];
      if (resource === 'schedule' && operation !== 'delete') {
        const event = { ...original, ...details };
        const range = parseTimeRange(String(event.time));
        if (!range) throw new HttpError(400, 'Khung giờ sự kiện không hợp lệ. Giờ kết thúc phải sau giờ bắt đầu.');
        const agenda = await createWorkspaceTools(async (name) => {
          const items = await resources.get(name)!.read({ userId });
          return Array.isArray(items) ? items.filter(isRow).filter((item) => name !== 'schedule' || item.id !== id) : [];
        }).execute('get_lifeos_agenda', { from: event.date, to: event.date }) as { busy: Row[] };
        const conflicts = agenda.busy.filter((busy) => busy.id !== id && Number(busy.start) < range[1] && Number(busy.end) > range[0]);
        if (conflicts.length) impact.push(`Cảnh báo trùng lịch với ${conflicts.map((busy) => String(busy.title)).join(', ')}. Bạn vẫn có thể xác nhận lưu sự kiện.`);
      }
      if (operation === 'delete' && resource === 'projects') impact.push(`Xóa dự án và ${(await services.projects.listTasks(userId, id!)).length} task cùng tài liệu/phiên liên quan.`);
      if (operation === 'delete' && resource === 'courses') impact.push('Xóa môn và lịch học liên quan. Bài tập, kỳ thi, ghi chú và nhật ký được giữ lại nhưng bỏ liên kết môn; tài liệu và bộ bấm giờ của môn bị xóa.');
      const relatedSnapshot = async () => {
        if (operation === 'delete' && resource === 'projects') return {
          tasks: await services.projects.listTasks(userId, id!), files: await projectResources.listFiles(userId, id!),
        };
        if (operation === 'delete' && resource === 'courses') return {
          sessions: (await services.study.list(userId, 'course-sessions')).filter((item) => item.courseId === id),
          files: await courseFiles.listFiles(userId, id!),
        };
        return undefined;
      };
      const related = await relatedSnapshot();
      const recordVersion = original ? fingerprint(original) : undefined;
      const version = original ? fingerprint({ original, related }) : undefined;
      return { operation, resource: entry.label, resourceKey: resource, target, details: preview, before, impact, version,
        command: { input: args, ...(attachment && resource === 'files' ? { attachment } : {}) } satisfies ChangeCommand,
        apply: async () => {
        if (original) {
          const current = await currentRecord();
          if (!current || fingerprint(current) !== recordVersion || fingerprint(await relatedSnapshot()) !== fingerprint(related)) throw new HttpError(409, 'Dữ liệu đã thay đổi kể từ lúc xem trước. Hãy tạo đề xuất mới.', 'ASSISTANT_STALE_DRAFT');
        }
        await validateSchedule?.();
        return apply();
      } };
    },
  };
}
