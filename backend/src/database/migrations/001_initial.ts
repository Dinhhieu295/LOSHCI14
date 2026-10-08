import type { Kysely } from 'kysely';
import type { Database } from '../types.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.createTable('users')
    .addColumn('id', 'varchar(36)', (column) => column.primaryKey())
    .addColumn('email', 'varchar(320)', (column) => column.notNull().unique())
    .addColumn('password_hash', 'text', (column) => column.notNull())
    .addColumn('full_name', 'varchar(120)', (column) => column.notNull())
    .addColumn('dob', 'varchar(10)')
    .addColumn('avatar_url', 'text')
    .addColumn('created_at', 'varchar(32)', (column) => column.notNull())
    .addColumn('updated_at', 'varchar(32)', (column) => column.notNull())
    .execute();

  await db.schema.createTable('sessions')
    .addColumn('id', 'varchar(36)', (column) => column.primaryKey())
    .addColumn('user_id', 'varchar(36)', (column) => column.notNull().references('users.id').onDelete('cascade'))
    .addColumn('token_hash', 'varchar(64)', (column) => column.notNull().unique())
    .addColumn('expires_at', 'varchar(32)', (column) => column.notNull())
    .addColumn('created_at', 'varchar(32)', (column) => column.notNull())
    .execute();
  await db.schema.createIndex('sessions_user_id_idx').on('sessions').column('user_id').execute();

  await db.schema.createTable('projects')
    .addColumn('id', 'varchar(36)', (column) => column.primaryKey())
    .addColumn('user_id', 'varchar(36)', (column) => column.notNull().references('users.id').onDelete('cascade'))
    .addColumn('title', 'varchar(200)', (column) => column.notNull())
    .addColumn('description', 'text', (column) => column.notNull().defaultTo(''))
    .addColumn('start_date', 'varchar(10)')
    .addColumn('end_date', 'varchar(10)')
    .addColumn('tag', 'varchar(80)', (column) => column.notNull().defaultTo(''))
    .addColumn('priority', 'varchar(24)', (column) => column.notNull().defaultTo('Medium'))
    .addColumn('status', 'varchar(24)', (column) => column.notNull().defaultTo('Active'))
    .addColumn('progress', 'real', (column) => column.notNull().defaultTo(0))
    .addColumn('days_left', 'integer', (column) => column.notNull().defaultTo(0))
    .addColumn('is_pinned', 'integer', (column) => column.notNull().defaultTo(0))
    .addColumn('members_json', 'text', (column) => column.notNull().defaultTo('[]'))
    .addColumn('created_at', 'varchar(32)', (column) => column.notNull())
    .addColumn('updated_at', 'varchar(32)', (column) => column.notNull())
    .execute();
  await db.schema.createIndex('projects_user_updated_idx').on('projects').columns(['user_id', 'updated_at']).execute();

  await db.schema.createTable('tasks')
    .addColumn('id', 'varchar(36)', (column) => column.primaryKey())
    .addColumn('project_id', 'varchar(36)', (column) => column.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('title', 'varchar(200)', (column) => column.notNull())
    .addColumn('priority', 'varchar(24)', (column) => column.notNull().defaultTo('Medium'))
    .addColumn('subtasks_done', 'integer', (column) => column.notNull().defaultTo(0))
    .addColumn('subtasks_total', 'integer', (column) => column.notNull().defaultTo(0))
    .addColumn('due_date', 'varchar(10)')
    .addColumn('assignee', 'varchar(120)', (column) => column.notNull().defaultTo(''))
    .addColumn('status', 'varchar(24)', (column) => column.notNull().defaultTo('todo'))
    .addColumn('is_done', 'integer', (column) => column.notNull().defaultTo(0))
    .addColumn('estimate', 'varchar(24)', (column) => column.notNull().defaultTo('0h'))
    .addColumn('actual', 'varchar(24)', (column) => column.notNull().defaultTo('0h'))
    .addColumn('start_day', 'integer', (column) => column.notNull().defaultTo(0))
    .addColumn('duration_days', 'integer', (column) => column.notNull().defaultTo(1))
    .addColumn('baseline_start', 'integer', (column) => column.notNull().defaultTo(0))
    .addColumn('baseline_duration', 'integer', (column) => column.notNull().defaultTo(1))
    .addColumn('is_milestone', 'integer', (column) => column.notNull().defaultTo(0))
    .addColumn('dependencies_json', 'text', (column) => column.notNull().defaultTo('[]'))
    .addColumn('created_at', 'varchar(32)', (column) => column.notNull())
    .addColumn('updated_at', 'varchar(32)', (column) => column.notNull())
    .execute();
  await db.schema.createIndex('tasks_project_due_idx').on('tasks').columns(['project_id', 'due_date']).execute();

  await db.schema.createTable('courses')
    .addColumn('id', 'varchar(36)', (column) => column.primaryKey())
    .addColumn('user_id', 'varchar(36)', (column) => column.notNull().references('users.id').onDelete('cascade'))
    .addColumn('name', 'varchar(160)', (column) => column.notNull())
    .addColumn('code', 'varchar(40)', (column) => column.notNull().defaultTo(''))
    .addColumn('instructor', 'varchar(120)', (column) => column.notNull().defaultTo(''))
    .addColumn('credits', 'real', (column) => column.notNull().defaultTo(0))
    .addColumn('semester', 'varchar(40)', (column) => column.notNull().defaultTo(''))
    .addColumn('progress', 'real', (column) => column.notNull().defaultTo(0))
    .addColumn('score10', 'real')
    .addColumn('grade', 'varchar(8)', (column) => column.notNull().defaultTo('N/A'))
    .addColumn('attendance', 'real', (column) => column.notNull().defaultTo(0))
    .addColumn('study_hours', 'real', (column) => column.notNull().defaultTo(0))
    .addColumn('aim_study_hours', 'real', (column) => column.notNull().defaultTo(0))
    .addColumn('color', 'varchar(40)', (column) => column.notNull().defaultTo(''))
    .addColumn('status', 'varchar(24)', (column) => column.notNull().defaultTo('Active'))
    .addColumn('created_at', 'varchar(32)', (column) => column.notNull())
    .addColumn('updated_at', 'varchar(32)', (column) => column.notNull())
    .execute();
  await db.schema.createIndex('courses_user_semester_idx').on('courses').columns(['user_id', 'semester']).execute();

  await db.schema.createTable('assignments')
    .addColumn('id', 'varchar(36)', (column) => column.primaryKey())
    .addColumn('user_id', 'varchar(36)', (column) => column.notNull().references('users.id').onDelete('cascade'))
    .addColumn('course_id', 'varchar(36)', (column) => column.references('courses.id').onDelete('set null'))
    .addColumn('title', 'varchar(200)', (column) => column.notNull())
    .addColumn('priority', 'varchar(24)', (column) => column.notNull().defaultTo('Medium'))
    .addColumn('deadline', 'varchar(32)', (column) => column.notNull())
    .addColumn('status', 'varchar(24)', (column) => column.notNull().defaultTo('Not Started'))
    .addColumn('prev_status', 'varchar(24)')
    .addColumn('estimated_time', 'varchar(24)', (column) => column.notNull().defaultTo('0h'))
    .addColumn('created_at', 'varchar(32)', (column) => column.notNull())
    .addColumn('updated_at', 'varchar(32)', (column) => column.notNull())
    .execute();

  await db.schema.createTable('exams')
    .addColumn('id', 'varchar(36)', (column) => column.primaryKey())
    .addColumn('user_id', 'varchar(36)', (column) => column.notNull().references('users.id').onDelete('cascade'))
    .addColumn('course_id', 'varchar(36)', (column) => column.references('courses.id').onDelete('set null'))
    .addColumn('title', 'varchar(200)', (column) => column.notNull())
    .addColumn('date', 'varchar(32)', (column) => column.notNull())
    .addColumn('type', 'varchar(32)', (column) => column.notNull())
    .addColumn('weight', 'real', (column) => column.notNull().defaultTo(0))
    .addColumn('prep_progress', 'real', (column) => column.notNull().defaultTo(0))
    .addColumn('created_at', 'varchar(32)', (column) => column.notNull())
    .addColumn('updated_at', 'varchar(32)', (column) => column.notNull())
    .execute();

  await db.schema.createTable('notes')
    .addColumn('id', 'varchar(36)', (column) => column.primaryKey())
    .addColumn('user_id', 'varchar(36)', (column) => column.notNull().references('users.id').onDelete('cascade'))
    .addColumn('course_id', 'varchar(36)', (column) => column.references('courses.id').onDelete('set null'))
    .addColumn('title', 'varchar(200)', (column) => column.notNull())
    .addColumn('content', 'text', (column) => column.notNull().defaultTo(''))
    .addColumn('note_date', 'varchar(32)', (column) => column.notNull())
    .addColumn('tags_json', 'text', (column) => column.notNull().defaultTo('[]'))
    .addColumn('created_at', 'varchar(32)', (column) => column.notNull())
    .addColumn('updated_at', 'varchar(32)', (column) => column.notNull())
    .execute();

  await db.schema.createTable('schedule_items')
    .addColumn('id', 'varchar(36)', (column) => column.primaryKey())
    .addColumn('user_id', 'varchar(36)', (column) => column.notNull().references('users.id').onDelete('cascade'))
    .addColumn('title', 'varchar(200)', (column) => column.notNull())
    .addColumn('time', 'varchar(32)', (column) => column.notNull())
    .addColumn('color', 'varchar(40)', (column) => column.notNull().defaultTo(''))
    .addColumn('schedule_date', 'varchar(10)', (column) => column.notNull())
    .addColumn('created_at', 'varchar(32)', (column) => column.notNull())
    .addColumn('updated_at', 'varchar(32)', (column) => column.notNull())
    .execute();
  await db.schema.createIndex('schedule_user_date_idx').on('schedule_items').columns(['user_id', 'schedule_date']).execute();

  await db.schema.createTable('personal_states')
    .addColumn('user_id', 'varchar(36)', (column) => column.primaryKey().references('users.id').onDelete('cascade'))
    .addColumn('coins', 'integer', (column) => column.notNull().defaultTo(0))
    .addColumn('growth_xp', 'integer', (column) => column.notNull().defaultTo(0))
    .addColumn('streak', 'integer', (column) => column.notNull().defaultTo(0))
    .addColumn('last_login_date', 'varchar(10)', (column) => column.notNull())
    .addColumn('selected_seed', 'varchar(40)', (column) => column.notNull().defaultTo('tomato'))
    .addColumn('shop_items_json', 'text', (column) => column.notNull().defaultTo('[]'))
    .addColumn('history_json', 'text', (column) => column.notNull().defaultTo('[]'))
    .addColumn('updated_at', 'varchar(32)', (column) => column.notNull())
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  for (const table of [
    'personal_states', 'schedule_items', 'notes', 'exams', 'assignments',
    'courses', 'tasks', 'projects', 'sessions', 'users',
  ] as const) {
    await db.schema.dropTable(table).ifExists().execute();
  }
}
