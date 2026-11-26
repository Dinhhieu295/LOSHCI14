import { sql, type Kysely, type Transaction } from 'kysely';
import { db } from '../../database/index.js';
import type {
  AccountUser, AvailabilityWindow, CalendarTime, PersonalState, Project, ProjectInput, ProjectPatch, SessionRecord,
  StudyItem, StudyPreference, StudyResourceName, Task, TaskInput, TaskPatch,
} from '../../application/models.js';
import type { LifeOsRepositories, TaskScope } from '../../application/ports/repositories.js';
import { ApplicationError } from '../../application/errors.js';
import type { Database } from '../../database/types.js';
import { closeProjectTimer } from './project-resources-repository.js';
import { assertCalendarAvailable, lockCalendar } from './task-calendar-repository.js';
import { calculateCourseScore, courseLetterGrade } from '../../application/assistant-math.js';

const studyResources = {
  courses: { table: 'courses', fields: { name: 'name', code: 'code', instructor: 'instructor', credits: 'credits', semester: 'semester', progress: 'progress', score10: 'score10', grade: 'grade', gradeComponents: 'grade_components_json', attendance: 'attendance', absences: 'absences', studyHours: 'study_hours', aimStudyHours: 'aim_study_hours', color: 'color', status: 'status' } },
  assignments: { table: 'assignments', fields: { title: 'title', courseId: 'course_id', priority: 'priority', deadline: 'deadline', status: 'status', prevStatus: 'prev_status', estimatedTime: 'estimated_time', dependencies: 'dependencies_json' } },
  exams: { table: 'exams', fields: { title: 'title', courseId: 'course_id', date: 'date', type: 'type', weight: 'weight', prepProgress: 'prep_progress' } },
  notes: { table: 'notes', fields: { title: 'title', courseId: 'course_id', content: 'content', date: 'note_date', tags: 'tags_json' } },
  schedule: { table: 'schedule_items', fields: { title: 'title', time: 'time', color: 'color', date: 'schedule_date' } },
  'course-sessions': { table: 'course_sessions', fields: { courseId: 'course_id', weekday: 'weekday', startTime: 'start_time', endTime: 'end_time', periodStart: 'period_start', periodEnd: 'period_end', location: 'location', room: 'room', color: 'color' } },
  'study-logs': { table: 'study_logs', fields: { courseId: 'course_id', date: 'log_date', durationMinutes: 'duration_minutes', note: 'note' } },
} as const;

const taskOwner = (scope: TaskScope) => 'projectId' in scope
  ? { column: 'project_id' as const, id: scope.projectId }
  : { column: 'personal_user_id' as const, id: scope.personalUserId };

const fixedSlotValues = (slot?: CalendarTime | null) => ({
  fixed_date: slot?.date ?? null,
  fixed_start_minute: slot?.start ?? null,
  fixed_end_minute: slot?.end ?? null,
});

function mapAccount(row: Record<string, any>): AccountUser {
  return {
    id: row.id, email: row.email, passwordHash: row.password_hash,
    fullName: row.full_name, dob: row.dob, avatarUrl: row.avatar_url,
    phone: row.phone ?? null, location: row.location ?? null, bio: row.bio ?? null,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapProject(row: Record<string, any>): Project {
  return {
    id: row.id, userId: row.user_id, title: row.title, description: row.description,
    startDate: row.start_date, endDate: row.end_date, tag: row.tag, priority: row.priority,
    status: row.status, progress: row.progress, daysLeft: row.days_left,
    isPinned: Boolean(row.is_pinned), members: JSON.parse(row.members_json),
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapTask(row: Record<string, any>): Task {
  return {
    id: row.id, projectId: row.project_id, title: row.title, priority: row.priority,
    category: row.category,
    fixedSlot: row.fixed_date ? { date: row.fixed_date, start: row.fixed_start_minute, end: row.fixed_end_minute } : null,
    subtasksDone: row.subtasks_done, subtasksTotal: row.subtasks_total,
    dueDate: row.due_date, assignee: row.assignee, status: row.status, isDone: Boolean(row.is_done),
    completedAt: row.completed_at,
    estimate: row.estimate, actual: row.actual, startDay: row.start_day, durationDays: row.duration_days,
    baselineStart: row.baseline_start, baselineDuration: row.baseline_duration,
    isMilestone: Boolean(row.is_milestone), dependencies: JSON.parse(row.dependencies_json),
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapStudyItem(resource: StudyResourceName, row: Record<string, any>): StudyItem {
  const definition = studyResources[resource] as { fields: Record<string, string> };
  const item: Record<string, unknown> = { id: row.id, createdAt: row.created_at, updatedAt: row.updated_at };
  for (const [apiField, column] of Object.entries(definition.fields)) {
    const value = row[column];
    item[apiField] = column.endsWith('_json') ? JSON.parse(value) : value;
  }
  if (resource === 'courses') {
    if (typeof row.timer_seconds === 'number') item.trackedSeconds = row.timer_seconds;
    item.score10 = calculateCourseScore(item.gradeComponents as { name: string; score10: number | null; weight: number }[]);
    item.grade = courseLetterGrade(item.score10 as number | null) ?? 'N/A';
  }
  return item as StudyItem;
}

function mapPersonalState(row: Record<string, any>): PersonalState {
  return {
    userId: row.user_id, streak: row.streak, lastLoginDate: row.last_login_date, updatedAt: row.updated_at,
  };
}

export class KyselyLifeOsRepository implements LifeOsRepositories {
  async createAccount(user: AccountUser, initialState: PersonalState, session: SessionRecord): Promise<void> {
    try {
      await db.transaction().execute(async (trx) => {
        await trx.insertInto('users').values({
          id: user.id, email: user.email, password_hash: user.passwordHash,
          full_name: user.fullName, dob: user.dob, avatar_url: user.avatarUrl,
          created_at: user.createdAt, updated_at: user.updatedAt,
        }).execute();
        await trx.insertInto('personal_states').values(this.personalValues(initialState)).execute();
        await trx.insertInto('sessions').values({
          id: session.id, user_id: session.userId, token_hash: session.tokenHash,
          expires_at: session.expiresAt, created_at: session.createdAt,
        }).execute();
      });
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === '23505') {
        throw new ApplicationError('ALREADY_EXISTS', 'Email này đã được đăng ký.');
      }
      throw error;
    }
  }

  async findUserByEmail(email: string): Promise<AccountUser | undefined> {
    const row = await db.selectFrom('users').selectAll().where('email', '=', email).executeTakeFirst();
    return row ? mapAccount(row) : undefined;
  }

  async findUserById(userId: string): Promise<AccountUser | undefined> {
    const row = await db.selectFrom('users').selectAll().where('id', '=', userId).executeTakeFirst();
    return row ? mapAccount(row) : undefined;
  }

  async updateProfile(userId: string, patch: Pick<Partial<AccountUser>, 'fullName' | 'dob' | 'avatarUrl' | 'phone' | 'location' | 'bio'>, updatedAt: string): Promise<void> {
    const values: Record<string, unknown> = { updated_at: updatedAt };
    if (patch.fullName !== undefined) values.full_name = patch.fullName;
    if (patch.dob !== undefined) values.dob = patch.dob;
    if (patch.avatarUrl !== undefined) values.avatar_url = patch.avatarUrl;
    if (patch.phone !== undefined) values.phone = patch.phone;
    if (patch.location !== undefined) values.location = patch.location;
    if (patch.bio !== undefined) values.bio = patch.bio;
    await db.updateTable('users').set(values).where('id', '=', userId).execute();
  }

  async updatePassword(userId: string, passwordHash: string, updatedAt: string): Promise<void> {
    await db.updateTable('users').set({ password_hash: passwordHash, updated_at: updatedAt }).where('id', '=', userId).execute();
  }

  async createSession(session: SessionRecord): Promise<void> {
    await db.insertInto('sessions').values({
      id: session.id, user_id: session.userId, token_hash: session.tokenHash,
      expires_at: session.expiresAt, created_at: session.createdAt,
    }).execute();
  }

  async findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | undefined> {
    const row = await db.selectFrom('sessions').selectAll().where('token_hash', '=', tokenHash).executeTakeFirst();
    return row ? { id: row.id, userId: row.user_id, tokenHash: row.token_hash, expiresAt: row.expires_at, createdAt: row.created_at } : undefined;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await db.deleteFrom('sessions').where('id', '=', sessionId).execute();
  }

  async deleteOtherSessions(userId: string, keepSessionId: string): Promise<void> {
    await db.deleteFrom('sessions').where('user_id', '=', userId).where('id', '!=', keepSessionId).execute();
  }

  async listProjects(userId: string): Promise<Project[]> {
    const rows = await db.selectFrom('projects').selectAll().where('user_id', '=', userId).orderBy('updated_at', 'desc').execute();
    return rows.map(mapProject);
  }

  async findProject(userId: string, projectId: string): Promise<Project | undefined> {
    const row = await db.selectFrom('projects').selectAll().where('id', '=', projectId).where('user_id', '=', userId).executeTakeFirst();
    return row ? mapProject(row) : undefined;
  }

  async createProject(userId: string, input: ProjectInput, id: string, now: string): Promise<Project> {
    const row = {
      id, user_id: userId, title: input.title, description: input.description,
      start_date: input.startDate, end_date: input.endDate, tag: input.tag,
      priority: input.priority, status: input.status, progress: input.progress,
      days_left: input.daysLeft, is_pinned: Number(input.isPinned),
      members_json: JSON.stringify(input.members), created_at: now, updated_at: now,
    };
    await db.insertInto('projects').values(row).execute();
    return mapProject({ ...row, user_id: userId });
  }

  async updateProject(userId: string, projectId: string, patch: ProjectPatch, now: string): Promise<Project | undefined> {
    const fields: Record<string, string> = {
      title: 'title', description: 'description', startDate: 'start_date', endDate: 'end_date',
      tag: 'tag', priority: 'priority', status: 'status', progress: 'progress', daysLeft: 'days_left',
      isPinned: 'is_pinned', members: 'members_json',
    };
    const updates: Record<string, unknown> = { updated_at: now };
    for (const [key, value] of Object.entries(patch)) {
      updates[fields[key]!] = key === 'isPinned' ? Number(value) : key === 'members' ? JSON.stringify(value) : value;
    }
    await db.updateTable('projects').set(updates).where('id', '=', projectId).where('user_id', '=', userId).execute();
    return this.findProject(userId, projectId);
  }

  async deleteProject(userId: string, projectId: string): Promise<boolean> {
    const result = await db.deleteFrom('projects').where('id', '=', projectId).where('user_id', '=', userId).executeTakeFirst();
    return Boolean(result.numDeletedRows);
  }

  async listTasks(scope: TaskScope): Promise<Task[]> {
    const owner = taskOwner(scope);
    const rows = await db.selectFrom('tasks').selectAll().where(owner.column, '=', owner.id).orderBy('created_at').execute();
    return rows.map(mapTask);
  }

  async createTask(scope: TaskScope, input: TaskInput, id: string, now: string): Promise<Task> {
    if (input.category === 'employment' && !input.fixedSlot) {
      throw new ApplicationError('WEEKLY_TIME_REQUIRED', 'Chọn ngày bắt đầu và khung giờ cho lịch hằng tuần.');
    }
    const row = {
      id, project_id: 'projectId' in scope ? scope.projectId : null,
      personal_user_id: 'personalUserId' in scope ? scope.personalUserId : null,
      category: 'personalUserId' in scope ? input.category ?? 'personal' : null,
      ...fixedSlotValues(input.fixedSlot),
      title: input.title, priority: input.priority,
      subtasks_done: input.subtasksDone, subtasks_total: input.subtasksTotal, due_date: input.dueDate,
      assignee: input.assignee, status: input.status, is_done: Number(input.isDone),
      completed_at: input.isDone ? now : null,
      estimate: input.estimate, actual: input.actual, start_day: input.startDay,
      duration_days: input.durationDays, baseline_start: input.baselineStart,
      baseline_duration: input.baselineDuration, is_milestone: Number(input.isMilestone),
      dependencies_json: JSON.stringify(input.dependencies), created_at: now, updated_at: now,
    };
    if ('personalUserId' in scope && input.fixedSlot) {
      const slot = input.fixedSlot;
      await db.transaction().execute(async (trx) => {
        await lockCalendar(trx, scope.personalUserId);
        if (!input.isDone || row.category !== 'employment') {
          await assertCalendarAvailable(trx, scope.personalUserId, [slot], { weekly: row.category === 'employment' });
        }
        await trx.insertInto('tasks').values(row).execute();
      });
    } else {
      await db.insertInto('tasks').values(row).execute();
    }
    return mapTask(row);
  }

  async updateTask(scope: TaskScope, taskId: string, patch: TaskPatch, now: string): Promise<Task | undefined> {
    const fields: Record<string, string> = {
      title: 'title', priority: 'priority', subtasksDone: 'subtasks_done', subtasksTotal: 'subtasks_total',
      dueDate: 'due_date', assignee: 'assignee', status: 'status', isDone: 'is_done', estimate: 'estimate',
      actual: 'actual', startDay: 'start_day', durationDays: 'duration_days', baselineStart: 'baseline_start',
      baselineDuration: 'baseline_duration', isMilestone: 'is_milestone', dependencies: 'dependencies_json',
    };
    const { category, fixedSlot, ...fieldsPatch } = patch;
    const updates: Record<string, unknown> = { updated_at: now };
    if ('personalUserId' in scope && category !== undefined) updates.category = category;
    for (const [key, value] of Object.entries(fieldsPatch)) {
      updates[fields[key]!] = ['isDone', 'isMilestone'].includes(key) ? Number(value) : key === 'dependencies' ? JSON.stringify(value) : value;
    }
    if (patch.isDone !== undefined) {
      updates.completed_at = patch.isDone
        ? sql<string | null>`case when is_done = 1 or status = 'done' then completed_at else ${now} end`
        : null;
    }
    const owner = taskOwner(scope);
    const update = (connection: Kysely<Database>) => connection.updateTable('tasks').set(updates).where('id', '=', taskId)
      .where(owner.column, '=', owner.id).returningAll().executeTakeFirst();
    if ('personalUserId' in scope && (fixedSlot !== undefined || category !== undefined || patch.isDone === false)) {
      if (fixedSlot !== undefined) Object.assign(updates, fixedSlotValues(fixedSlot));
      return db.transaction().execute(async (trx) => {
        await lockCalendar(trx, scope.personalUserId);
        const current = await trx.selectFrom('tasks').select([
          'fixed_date', 'fixed_start_minute', 'fixed_end_minute', 'category', 'is_done', 'status',
        ]).where('id', '=', taskId).where(owner.column, '=', owner.id).executeTakeFirst();
        if (!current) return undefined;
        const currentSlot = current.fixed_date && current.fixed_start_minute !== null && current.fixed_end_minute !== null
          ? { date: current.fixed_date, start: current.fixed_start_minute, end: current.fixed_end_minute } : null;
        const nextSlot = fixedSlot === undefined ? currentSlot : fixedSlot;
        const nextCategory = category ?? current.category;
        const weekly = nextCategory === 'employment';
        if (weekly && !nextSlot) {
          throw new ApplicationError('WEEKLY_TIME_REQUIRED', 'Chọn ngày bắt đầu và khung giờ cho lịch hằng tuần.');
        }
        if (nextSlot) {
          if (!current.fixed_date) {
            const booked = await trx.selectFrom('task_schedule_blocks').select('id').where('task_id', '=', taskId).executeTakeFirst();
            if (booked) throw new ApplicationError('CALENDAR_CONFLICT', 'Hãy trả các phiên đã xếp của việc này về hàng đợi trước khi đặt giờ cố định.');
          }
          const wasPaused = Boolean(current.is_done) || current.status === 'done';
          const paused = patch.isDone ?? wasPaused;
          const changed = nextSlot.date !== current.fixed_date || nextSlot.start !== current.fixed_start_minute ||
            nextSlot.end !== current.fixed_end_minute || nextCategory !== current.category;
          if ((!weekly || !paused) && (changed || (weekly && wasPaused))) {
            await assertCalendarAvailable(trx, scope.personalUserId, [nextSlot], { weekly, ignoredFixedTaskId: taskId });
          }
        }
        const row = await update(trx);
        return row ? mapTask(row) : undefined;
      });
    }
    const row = await update(db);
    return row ? mapTask(row) : undefined;
  }

  async deleteTask(scope: TaskScope, taskId: string): Promise<boolean> {
    const owner = taskOwner(scope);
    const remove = async (connection: Kysely<Database>) => {
      const result = await connection.deleteFrom('tasks').where('id', '=', taskId).where(owner.column, '=', owner.id).executeTakeFirst();
      return Boolean(result.numDeletedRows);
    };
    if (!('projectId' in scope)) return remove(db);
    return db.transaction().execute(async (trx) => {
      await trx.selectFrom('projects').select('id').where('id', '=', scope.projectId).forUpdate().executeTakeFirst();
      const active = await trx.selectFrom('project_timer_sessions').select(['id', 'started_at as startedAt'])
        .where('project_id', '=', scope.projectId).where('task_id', '=', taskId).where('stopped_at', 'is', null).executeTakeFirst();
      if (active) await closeProjectTimer(trx, active, new Date());
      return remove(trx);
    });
  }

  async listStudyItems(userId: string, resource: StudyResourceName): Promise<StudyItem[]> {
    if (resource === 'courses') {
      const courses = await db.selectFrom('courses').selectAll('courses').select((eb) => eb.selectFrom('project_timer_sessions')
        .select(sql<number>`coalesce(sum(duration_seconds), 0)::double precision`.as('seconds'))
        .whereRef('project_timer_sessions.course_id', '=', 'courses.id').as('timer_seconds'))
        .where('courses.user_id', '=', userId).orderBy('courses.created_at', 'desc').execute();
      return courses.map((course) => mapStudyItem('courses', course));
    }
    const table = studyResources[resource].table;
    const rows = await (db as any).selectFrom(table).selectAll().where('user_id', '=', userId).orderBy('created_at', 'desc').execute();
    return rows.map((row: Record<string, any>) => mapStudyItem(resource, row));
  }

  private async checkAssignmentDependencies(trx: Transaction<Database>, userId: string, courseId: string | null, id: string, dependencies: string[]) {
    if (!dependencies.length) return;
    const rows = courseId ? await trx.selectFrom('assignments').select(['id', 'dependencies_json'])
      .where('user_id', '=', userId).where('course_id', '=', courseId).execute() : [];
    const graph = new Map(rows.map((row) => [row.id, JSON.parse(row.dependencies_json) as string[]]));
    if (dependencies.some((dependency) => dependency === id || !graph.has(dependency))) {
      throw new ApplicationError('INVALID_TASK_DEPENDENCY', 'Bài tập phụ thuộc phải thuộc cùng môn học.');
    }
    const seen = new Set<string>();
    const pending = [...dependencies];
    while (pending.length) {
      const dependency = pending.pop()!;
      if (dependency === id) throw new ApplicationError('INVALID_TASK_DEPENDENCY', 'Phụ thuộc tạo thành vòng lặp giữa các bài tập.');
      if (seen.has(dependency)) continue;
      seen.add(dependency);
      pending.push(...(graph.get(dependency) ?? []));
    }
  }

  private async detachAssignment(trx: Transaction<Database>, userId: string, courseId: string, id: string, now: string) {
    await trx.selectFrom('courses').select('id').where('id', '=', courseId).where('user_id', '=', userId).forUpdate().executeTakeFirst();
    const timers = trx.selectFrom('project_timer_sessions').where('course_id', '=', courseId).where('assignment_id', '=', id);
    const active = await timers.select(['id', 'started_at as startedAt']).where('stopped_at', 'is', null).executeTakeFirst();
    if (active) await closeProjectTimer(trx, active, new Date(), 'assignment_id');
    await trx.updateTable('project_timer_sessions').set({ assignment_id: null }).where('course_id', '=', courseId)
      .where('assignment_id', '=', id).execute();
    const related = await trx.selectFrom('assignments').select(['id', 'dependencies_json']).where('user_id', '=', userId)
      .where('course_id', '=', courseId).where('id', '!=', id).execute();
    for (const row of related) {
      const dependencies = JSON.parse(row.dependencies_json) as string[];
      if (dependencies.includes(id)) {
        await trx.updateTable('assignments').set({ dependencies_json: JSON.stringify(dependencies.filter((dependency) => dependency !== id)), updated_at: now })
          .where('id', '=', row.id).execute();
      }
    }
  }

  async createStudyItem(userId: string, resource: StudyResourceName, item: Record<string, unknown>, id: string, now: string): Promise<StudyItem> {
    const definition = studyResources[resource];
    const values: Record<string, unknown> = { id, user_id: userId, created_at: now, updated_at: now };
    for (const [apiKey, column] of Object.entries(definition.fields)) {
      if (apiKey in item) values[column] = column.endsWith('_json') ? JSON.stringify(item[apiKey]) : item[apiKey];
    }
    const create = async (connection: Kysely<Database>) => {
      const row = await (connection as any).insertInto(definition.table).values(values).returningAll().executeTakeFirstOrThrow();
      return mapStudyItem(resource, row);
    };
    if (resource !== 'assignments' || !Array.isArray(item.dependencies) || !item.dependencies.length) return create(db);
    return db.transaction().execute(async (trx) => {
      await lockCalendar(trx, userId);
      await this.checkAssignmentDependencies(trx, userId, typeof item.courseId === 'string' ? item.courseId : null, id, item.dependencies as string[]);
      return create(trx);
    });
  }

  async updateStudyItem(userId: string, resource: StudyResourceName, id: string, patch: Record<string, unknown>, now: string): Promise<StudyItem | undefined> {
    const definition = studyResources[resource];
    const updates: Record<string, unknown> = { updated_at: now };
    for (const [apiKey, column] of Object.entries(definition.fields)) {
      if (apiKey in patch) updates[column] = column.endsWith('_json') ? JSON.stringify(patch[apiKey]) : patch[apiKey];
    }
    const update = async (connection: Kysely<Database>) => {
      const row = await (connection as any).updateTable(definition.table).set(updates).where('id', '=', id)
        .where('user_id', '=', userId).returningAll().executeTakeFirst();
      return row ? mapStudyItem(resource, row) : undefined;
    };
    if (resource === 'courses' && 'status' in patch) {
      return db.transaction().execute(async (trx) => {
        await lockCalendar(trx, userId);
        return update(trx);
      });
    }
    if (resource !== 'assignments' || (!('courseId' in patch) && !('dependencies' in patch))) return update(db);
    return db.transaction().execute(async (trx) => {
      await lockCalendar(trx, userId);
      const assignment = await trx.selectFrom('assignments').select('course_id').where('id', '=', id).where('user_id', '=', userId).executeTakeFirst();
      if (!assignment) return undefined;
      const courseId = 'courseId' in patch ? typeof patch.courseId === 'string' ? patch.courseId : null : assignment.course_id;
      const moving = courseId !== assignment.course_id;
      if (Array.isArray(patch.dependencies)) await this.checkAssignmentDependencies(trx, userId, courseId, id, patch.dependencies as string[]);
      else if (moving) updates.dependencies_json = '[]';
      if (moving && assignment.course_id) await this.detachAssignment(trx, userId, assignment.course_id, id, now);
      return update(trx);
    });
  }

  async deleteStudyItem(userId: string, resource: StudyResourceName, id: string): Promise<boolean> {
    const remove = async (connection: Kysely<Database>) => {
      const result = await (connection as any).deleteFrom(studyResources[resource].table)
        .where('id', '=', id).where('user_id', '=', userId).executeTakeFirst();
      return Boolean(result.numDeletedRows);
    };
    if (resource !== 'assignments' && resource !== 'courses') return remove(db);
    return db.transaction().execute(async (trx) => {
      await lockCalendar(trx, userId);
      if (resource === 'assignments') {
        const assignment = await trx.selectFrom('assignments').select('course_id').where('id', '=', id).where('user_id', '=', userId).executeTakeFirst();
        if (assignment?.course_id) await this.detachAssignment(trx, userId, assignment.course_id, id, new Date().toISOString());
      } else {
        await trx.selectFrom('courses').select('id').where('id', '=', id).where('user_id', '=', userId).forUpdate().executeTakeFirst();
        await trx.updateTable('assignments').set({ dependencies_json: '[]' }).where('course_id', '=', id).where('user_id', '=', userId).execute();
      }
      return remove(trx);
    });
  }

  async ownsCourse(userId: string, courseId: string): Promise<boolean> {
    const row = await db.selectFrom('courses').select('id').where('id', '=', courseId).where('user_id', '=', userId).executeTakeFirst();
    return Boolean(row);
  }

  async findPersonalState(userId: string): Promise<PersonalState | undefined> {
    const row = await db.selectFrom('personal_states').selectAll().where('user_id', '=', userId).executeTakeFirst();
    return row ? mapPersonalState(row) : undefined;
  }

  async savePersonalState(userId: string, state: PersonalState): Promise<PersonalState> {
    const values = this.personalValues({ ...state, userId });
    const { user_id: _userId, ...updates } = values;
    const row = await db.insertInto('personal_states').values(values)
      .onConflict((conflict) => conflict.column('user_id').doUpdateSet(updates))
      .returningAll().executeTakeFirstOrThrow();
    return mapPersonalState(row);
  }

  async findAvailability(userId: string): Promise<AvailabilityWindow[] | null> {
    const row = await db.selectFrom('study_availability').select('windows_json')
      .where('user_id', '=', userId).executeTakeFirst();
    return row ? JSON.parse(row.windows_json) as AvailabilityWindow[] : null;
  }

  async saveAvailability(userId: string, windows: AvailabilityWindow[]): Promise<void> {
    const windows_json = JSON.stringify(windows);
    await db.insertInto('study_availability').values({ user_id: userId, windows_json })
      .onConflict((conflict) => conflict.column('user_id').doUpdateSet({ windows_json })).execute();
  }

  async listStudyFeedback(userId: string): Promise<{ courseId: string; preference: StudyPreference }[]> {
    return db.selectFrom('study_feedback').select(['course_id as courseId', 'preference'])
      .where('user_id', '=', userId).execute();
  }

  async saveStudyFeedback(userId: string, courseId: string, preference: StudyPreference | null): Promise<boolean> {
    return db.transaction().execute(async (trx) => {
      const course = await trx.selectFrom('courses').select('id')
        .where('id', '=', courseId).where('user_id', '=', userId).forKeyShare().executeTakeFirst();
      if (!course) return false;
      if (preference === null) {
        await trx.deleteFrom('study_feedback').where('user_id', '=', userId).where('course_id', '=', courseId).execute();
      } else {
        await trx.insertInto('study_feedback').values({ user_id: userId, course_id: courseId, preference })
          .onConflict((conflict) => conflict.columns(['user_id', 'course_id']).doUpdateSet({ preference })).execute();
      }
      return true;
    });
  }

  private personalValues(state: PersonalState) {
    return {
      user_id: state.userId, streak: state.streak, last_login_date: state.lastLoginDate, updated_at: state.updatedAt,
    };
  }
}
