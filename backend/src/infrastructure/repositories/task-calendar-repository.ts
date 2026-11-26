import type { CalendarTime } from '../../application/models.js';
import { randomUUID } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import { ApplicationError } from '../../application/errors.js';
import { db } from '../../database/index.js';
import type { Database } from '../../database/types.js';

export interface TaskBlockInput extends CalendarTime {
  taskId: string;
  workKind?: 'task' | 'assignment';
}

const blockColumns = ['id', sql<string>`coalesce(task_id, assignment_id)`.as('taskId'),
  sql<'task' | 'assignment'>`case when assignment_id is null then 'task' else 'assignment' end`.as('workKind'),
  'scheduled_date as date', 'start_minute as start', 'end_minute as end'] as const;

const weekday = (date: string) => ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
type RepeatingTime = CalendarTime & { weekly?: boolean };
function overlapping(left: RepeatingTime, right: RepeatingTime) {
  if (left.start >= right.end || right.start >= left.end) return false;
  if (left.date === right.date) return true;
  if (!left.weekly && !right.weekly) return false;
  if (weekday(left.date) !== weekday(right.date)) return false;
  return Boolean((left.weekly && right.weekly) ||
    (left.weekly && left.date <= right.date) || (right.weekly && right.date <= left.date));
}
const time = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
};

function personalTime(date: string, value: string): CalendarTime | null {
  const clock = /^(?:[01]?\d|2[0-3]):[0-5]\d$/;
  const [from, to, ...extra] = value.trim().split(/\s*(?:-|–|—|đến|to)\s*/i);
  if (!from || !clock.test(from) || (to !== undefined && !clock.test(to)) || extra.length) return null;
  const start = time(from);
  const end = to === undefined ? Math.min(1440, start + 60) : time(to);
  return start < end ? { date, start, end } : null;
}

export async function lockCalendar(trx: Transaction<Database>, userId: string) {
  await trx.selectFrom('users').select('id').where('id', '=', userId).forUpdate().executeTakeFirstOrThrow();
}

export async function assertCalendarAvailable(
  trx: Transaction<Database>, userId: string, blocks: CalendarTime[],
  { ignoredBlockId, ignoredFixedTaskId, weekly = false }:
    { ignoredBlockId?: string; ignoredFixedTaskId?: string; weekly?: boolean } = {},
) {
  const dates = [...new Set(blocks.map((block) => block.date))].sort();
  const firstDate = dates[0];
  if (!firstDate) return;
  const weekdays = [...new Set(dates.map(weekday))];
  const existing = await trx.selectFrom('task_schedule_blocks').select(blockColumns)
    .where('user_id', '=', userId).where((eb) => weekly
      ? eb('scheduled_date', '>=', firstDate) : eb('scheduled_date', 'in', dates)).execute();
  const sessions = await trx.selectFrom('course_sessions').innerJoin('courses', 'courses.id', 'course_sessions.course_id')
    .select(['weekday', 'start_time', 'end_time', 'courses.name'])
    .where('course_sessions.user_id', '=', userId).where('courses.status', '=', 'Active')
    .where('weekday', 'in', weekdays).execute();
  const events = await trx.selectFrom('schedule_items').select(['schedule_date', 'time', 'title'])
    .where('user_id', '=', userId).where((eb) => weekly
      ? eb('schedule_date', '>=', firstDate) : eb('schedule_date', 'in', dates)).execute();
  const fixedTasks = await trx.selectFrom('tasks').select([
    'id', 'title', 'category', 'is_done', 'status', 'fixed_date as date', 'fixed_start_minute as start', 'fixed_end_minute as end',
  ]).where('personal_user_id', '=', userId).where('fixed_date', 'is not', null).where((eb) => eb.or([
    eb('category', '=', 'employment'),
    weekly ? eb('fixed_date', '>=', firstDate) : eb('fixed_date', 'in', dates),
  ])).execute();
  const busy: (RepeatingTime & { title: string })[] = [
    ...existing.filter((block) => block.id !== ignoredBlockId).map((block) => ({ ...block, title: 'phiên làm việc đã xếp' })),
    ...fixedTasks.flatMap((item) => {
      const recurring = item.category === 'employment';
      if (item.id === ignoredFixedTaskId || !item.date || item.start === null || item.end === null ||
        (recurring && (item.is_done || item.status === 'done'))) return [];
      return [{ date: item.date, start: item.start, end: item.end, weekly: recurring,
        title: `${recurring ? 'lịch hằng tuần' : 'việc cố định'} ${item.title}` }];
    }),
    ...dates.flatMap((date) => sessions.filter((session) => session.weekday === weekday(date))
      .map((session) => ({ date, start: time(session.start_time), end: time(session.end_time), title: `lịch học ${session.name}` }))),
    ...events.flatMap((event) => {
      const range = personalTime(event.schedule_date, event.time);
      return range ? [{ ...range, title: `sự kiện ${event.title}` }] : [];
    }),
  ];
  for (const block of blocks) {
    const conflict = busy.find((item) => overlapping(item, { ...block, weekly }));
    if (conflict) {
      throw new ApplicationError('CALENDAR_CONFLICT', `Khung giờ này trùng với ${conflict.title}. Hãy chọn giờ khác.`);
    }
    busy.push({ ...block, weekly, title: 'phiên làm việc khác trong đề xuất' });
  }
}

export class TaskCalendarRepository {
  list(userId: string) {
    return db.selectFrom('task_schedule_blocks').select(blockColumns).where('user_id', '=', userId)
      .orderBy('scheduled_date').orderBy('start_minute').execute();
  }

  preview(userId: string, blocks: TaskBlockInput[], ignoredId?: string) {
    return db.transaction().execute((trx) => this.validate(trx, userId, blocks, ignoredId));
  }

  create(userId: string, blocks: TaskBlockInput[]) {
    return db.transaction().execute(async (trx) => {
      await lockCalendar(trx, userId);
      await this.validate(trx, userId, blocks);
      return trx.insertInto('task_schedule_blocks').values(blocks.map((block) => ({
        id: randomUUID(), user_id: userId, task_id: block.workKind === 'assignment' ? null : block.taskId,
        assignment_id: block.workKind === 'assignment' ? block.taskId : null,
        scheduled_date: block.date, start_minute: block.start, end_minute: block.end,
      }))).returning(blockColumns).execute();
    });
  }

  move(userId: string, id: string, target: CalendarTime) {
    return db.transaction().execute(async (trx) => {
      await lockCalendar(trx, userId);
      const current = await trx.selectFrom('task_schedule_blocks').select(blockColumns)
        .where('user_id', '=', userId).where('id', '=', id).executeTakeFirst();
      if (!current) throw new ApplicationError('RESOURCE_ITEM_NOT_FOUND', 'Không tìm thấy phiên làm việc.');
      await this.validate(trx, userId, [{ ...target, taskId: current.taskId, workKind: current.workKind }], id);
      return trx.updateTable('task_schedule_blocks')
        .set({ scheduled_date: target.date, start_minute: target.start, end_minute: target.end })
        .where('user_id', '=', userId).where('id', '=', id).returning(blockColumns).executeTakeFirstOrThrow();
    });
  }

  remove(userId: string, id: string) {
    return db.transaction().execute(async (trx) => {
      await lockCalendar(trx, userId);
      const row = await trx.deleteFrom('task_schedule_blocks').where('user_id', '=', userId)
        .where('id', '=', id).returning('id').executeTakeFirst();
      if (!row) throw new ApplicationError('RESOURCE_ITEM_NOT_FOUND', 'Không tìm thấy phiên làm việc.');
    });
  }

  private async validate(trx: Transaction<Database>, userId: string, blocks: TaskBlockInput[], ignoredId?: string) {
    const tasks = [...new Set(blocks.filter((block) => block.workKind !== 'assignment').map((block) => block.taskId))];
    const open = tasks.length ? await trx.selectFrom('tasks').leftJoin('projects', 'projects.id', 'tasks.project_id')
      .select('tasks.id').where((eb) => eb.or([
        eb('projects.user_id', '=', userId), eb('tasks.personal_user_id', '=', userId),
      ])).where('tasks.id', 'in', tasks)
      .where('tasks.is_done', '=', 0).where('tasks.status', '!=', 'done')
      .where('tasks.fixed_date', 'is', null)
      .where((eb) => eb.or([eb('tasks.category', 'is', null), eb('tasks.category', '!=', 'employment')]))
      .forShare('tasks').execute() : [];
    if (open.length !== tasks.length) {
      throw new ApplicationError('TASK_NOT_FOUND', 'Chỉ xếp giờ cho việc linh hoạt chưa hoàn thành.');
    }

    const assignments = [...new Set(blocks.filter((block) => block.workKind === 'assignment').map((block) => block.taskId))];
    if (assignments.length) {
      const available = await trx.selectFrom('assignments').select('id').where('user_id', '=', userId)
        .where('id', 'in', assignments).where('status', '!=', 'Completed').forShare().execute();
      if (available.length !== assignments.length) throw new ApplicationError('TASK_NOT_FOUND', 'Chỉ xếp giờ cho bài tập chưa hoàn thành trong tài khoản.');
    }

    await assertCalendarAvailable(trx, userId, blocks, { ignoredBlockId: ignoredId });
  }
}
