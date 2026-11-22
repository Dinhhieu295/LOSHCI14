import { randomUUID } from 'node:crypto';
import { sql, type Kysely, type Transaction } from 'kysely';
import { ApplicationError } from '../../application/errors.js';
import { db } from '../../database/index.js';
import type { Database } from '../../database/types.js';

type ItemColumn = 'task_id' | 'assignment_id';
const timerFields = ['id', 'task_title as taskTitle', 'started_at as startedAt', 'stopped_at as stoppedAt',
  'duration_seconds as durationSeconds'] as const;
const timerSelection = (column: ItemColumn) => [...timerFields, `${column} as taskId`] as const;

export function closeProjectTimer(trx: Transaction<Database>, session: { id: string; startedAt: string }, now: Date, column: ItemColumn = 'task_id') {
  const duration = Math.max(0, Math.floor((now.getTime() - Date.parse(session.startedAt)) / 1000));
  return trx.updateTable('project_timer_sessions').set({ stopped_at: now.toISOString(), duration_seconds: duration })
    .where('id', '=', session.id).returning(timerSelection(column)).executeTakeFirstOrThrow();
}

export class ProjectResourcesRepository {
  constructor(private readonly scope: 'project' | 'course' = 'project') {}

  private get areaTable() { return this.scope === 'course' ? 'courses' : 'projects'; }
  private get areaColumn() { return this.scope === 'course' ? 'course_id' : 'project_id'; }
  private get itemTable() { return this.scope === 'course' ? 'assignments' : 'tasks'; }
  private get itemColumn() { return this.scope === 'course' ? 'assignment_id' : 'task_id'; }
  private get fileFields() { return ['id', `${this.itemColumn} as taskId`, 'name', 'size_bytes as size', 'created_at as createdAt'] as const; }

  private workspace(connection: Kysely<Database>, userId: string, workspaceId: string) {
    return connection.selectFrom(this.areaTable).select('id').where('id', '=', workspaceId).where('user_id', '=', userId);
  }

  private async requireWorkspace(connection: Kysely<Database>, userId: string, workspaceId: string, lock = false) {
    const query = this.workspace(connection, userId, workspaceId);
    if (!(await (lock ? query.forUpdate() : query).executeTakeFirst())) {
      throw new ApplicationError('PROJECT_NOT_FOUND', this.scope === 'course' ? 'Không tìm thấy môn học.' : 'Không tìm thấy dự án.');
    }
  }

  private workspaceFiles(workspaceId: string) {
    return db.selectFrom('project_task_files').where((eb) => eb.or([
      eb(this.areaColumn, '=', workspaceId),
      eb(this.itemColumn, 'in', eb.selectFrom(this.itemTable).select('id').where(this.areaColumn, '=', workspaceId)),
    ]));
  }

  private async requireTask(connection: Kysely<Database>, workspaceId: string, taskId: string, lock = false) {
    const query = connection.selectFrom(this.itemTable).select(['id', 'title']).where('id', '=', taskId).where(this.areaColumn, '=', workspaceId);
    const task = await (lock ? query.forShare() : query).executeTakeFirst();
    if (!task) throw new ApplicationError('TASK_NOT_FOUND', this.scope === 'course' ? 'Không tìm thấy bài tập trong môn này.' : 'Không tìm thấy task trong dự án này.');
    return task;
  }

  async listFiles(userId: string, workspaceId: string) {
    await this.requireWorkspace(db, userId, workspaceId);
    return this.workspaceFiles(workspaceId).select(this.fileFields).orderBy('created_at', 'desc').orderBy('id').execute();
  }

  addFile(userId: string, workspaceId: string, taskId: string | null, name: string, contents: Buffer) {
    return db.transaction().execute(async (trx) => {
      await this.requireWorkspace(trx, userId, workspaceId);
      if (taskId) await this.requireTask(trx, workspaceId, taskId, true);
      return trx.insertInto('project_task_files').values({ id: randomUUID(), name, contents,
        task_id: this.scope === 'project' ? taskId : null, assignment_id: this.scope === 'course' ? taskId : null,
        project_id: !taskId && this.scope === 'project' ? workspaceId : null,
        course_id: !taskId && this.scope === 'course' ? workspaceId : null,
        size_bytes: contents.byteLength, created_at: new Date().toISOString() }).returning(this.fileFields).executeTakeFirstOrThrow();
    });
  }

  async getFile(userId: string, workspaceId: string, fileId: string) {
    await this.requireWorkspace(db, userId, workspaceId);
    const file = await this.workspaceFiles(workspaceId).where('id', '=', fileId).select(['name', 'contents']).executeTakeFirst();
    if (!file) throw new ApplicationError('RESOURCE_ITEM_NOT_FOUND', 'Không tìm thấy tài liệu.');
    return file;
  }

  async deleteFile(userId: string, workspaceId: string, fileId: string) {
    await this.requireWorkspace(db, userId, workspaceId);
    const file = await db.deleteFrom('project_task_files').where('id', '=', fileId)
      .where('id', 'in', this.workspaceFiles(workspaceId).select('id')).returning('id').executeTakeFirst();
    if (!file) throw new ApplicationError('RESOURCE_ITEM_NOT_FOUND', 'Không tìm thấy tài liệu.');
  }

  async timer(userId: string, workspaceId: string, taskId?: string) {
    await this.requireWorkspace(db, userId, workspaceId);
    if (taskId) await this.requireTask(db, workspaceId, taskId);
    const workspaceQuery = db.selectFrom('project_timer_sessions').where(this.areaColumn, '=', workspaceId);
    const query = taskId ? workspaceQuery.where(this.itemColumn, '=', taskId) : workspaceQuery;
    const sessions = await query.select(timerSelection(this.itemColumn)).orderBy('started_at', 'desc').orderBy('id').limit(20).execute();
    const totals = await query.where('stopped_at', 'is not', null).select([`${this.itemColumn} as taskId` as const,
      sql<number>`coalesce(sum(duration_seconds), 0)::double precision`.as('seconds')]).groupBy(this.itemColumn).execute();
    const active = await this.activeTimer(db, workspaceId);
    return {
      sessions, active: active ?? null,
      seconds: totals.reduce((total, row) => total + row.seconds, 0),
      taskSeconds: Object.fromEntries(totals.flatMap((row) => row.taskId ? [[row.taskId, row.seconds]] : [])),
    };
  }

  private activeTimer(connection: Kysely<Database>, workspaceId: string) {
    return connection.selectFrom('project_timer_sessions').select(timerSelection(this.itemColumn)).where(this.areaColumn, '=', workspaceId)
      .where('stopped_at', 'is', null).executeTakeFirst();
  }

  startTimer(userId: string, workspaceId: string, taskId: string | null, switchFrom?: string) {
    return db.transaction().execute(async (trx) => {
      await this.requireWorkspace(trx, userId, workspaceId, true);
      const task = taskId ? await this.requireTask(trx, workspaceId, taskId, true) : null;
      const active = await this.activeTimer(trx, workspaceId);
      if (active?.taskId === taskId) return active;
      const now = new Date();
      if (active) {
        if (active.id !== switchFrom) throw new ApplicationError('PROJECT_TIMER_CONFLICT', 'Đang bấm giờ cho phiên khác.');
        await closeProjectTimer(trx, active, now, this.itemColumn);
      }
      return trx.insertInto('project_timer_sessions').values({ id: randomUUID(),
        project_id: this.scope === 'project' ? workspaceId : null, course_id: this.scope === 'course' ? workspaceId : null,
        task_id: this.scope === 'project' ? taskId : null, assignment_id: this.scope === 'course' ? taskId : null,
        task_title: task?.title ?? null, started_at: now.toISOString(), stopped_at: null, duration_seconds: null })
        .returning(timerSelection(this.itemColumn)).executeTakeFirstOrThrow();
    });
  }

  stopTimer(userId: string, workspaceId: string, sessionId: string) {
    return db.transaction().execute(async (trx) => {
      await this.requireWorkspace(trx, userId, workspaceId, true);
      const session = await trx.selectFrom('project_timer_sessions').select(timerSelection(this.itemColumn)).where(this.areaColumn, '=', workspaceId)
        .where('id', '=', sessionId).executeTakeFirst();
      if (!session) throw new ApplicationError('RESOURCE_ITEM_NOT_FOUND', 'Không tìm thấy phiên bấm giờ.');
      if (session.stoppedAt) return session;
      return closeProjectTimer(trx, session, new Date(), this.itemColumn);
    });
  }
}
