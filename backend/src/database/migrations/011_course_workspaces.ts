import { sql, type Kysely, type SqlBool } from 'kysely';
import type { Database } from '../types.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable('assignments').addColumn('dependencies_json', 'text', (column) => column.notNull().defaultTo('[]')).execute();
  await db.schema.alterTable('project_task_files').alterColumn('task_id', (column) => column.dropNotNull())
    .addColumn('assignment_id', 'varchar(36)', (column) => column.references('assignments.id').onDelete('cascade')).execute();
  await db.schema.alterTable('project_task_files').addCheckConstraint('work_file_owner',
    sql`(task_id is null) <> (assignment_id is null)`).execute();
  await db.schema.createIndex('work_file_assignment_idx').on('project_task_files').column('assignment_id').execute();
  await db.schema.alterTable('project_timer_sessions').alterColumn('project_id', (column) => column.dropNotNull())
    .addColumn('course_id', 'varchar(36)', (column) => column.references('courses.id').onDelete('cascade'))
    .addColumn('assignment_id', 'varchar(36)', (column) => column.references('assignments.id').onDelete('set null')).execute();
  await db.schema.alterTable('project_timer_sessions').addCheckConstraint('work_timer_owner', sql`
    (project_id is not null and course_id is null and assignment_id is null)
    or (project_id is null and course_id is not null and task_id is null)
  `).execute();
  await db.schema.createIndex('work_timer_course_active_idx').on('project_timer_sessions').column('course_id')
    .unique().where(sql<SqlBool>`course_id is not null and stopped_at is null`).execute();
  await db.schema.createIndex('work_timer_course_history_idx').on('project_timer_sessions').columns(['course_id', 'started_at']).execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.deleteFrom('project_timer_sessions').where('course_id', 'is not', null).execute();
  await db.deleteFrom('project_task_files').where('assignment_id', 'is not', null).execute();
  await db.schema.dropIndex('work_timer_course_history_idx').execute();
  await db.schema.dropIndex('work_timer_course_active_idx').execute();
  await db.schema.dropIndex('work_file_assignment_idx').execute();
  await db.schema.alterTable('project_timer_sessions').dropConstraint('work_timer_owner').execute();
  await db.schema.alterTable('project_task_files').dropConstraint('work_file_owner').execute();
  await db.schema.alterTable('project_timer_sessions').dropColumn('assignment_id').dropColumn('course_id')
    .alterColumn('project_id', (column) => column.setNotNull()).execute();
  await db.schema.alterTable('project_task_files').dropColumn('assignment_id').alterColumn('task_id', (column) => column.setNotNull()).execute();
  await db.schema.alterTable('assignments').dropColumn('dependencies_json').execute();
}
