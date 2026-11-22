import { sql, type Kysely } from 'kysely';
import type { Database } from '../types.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable('project_task_files').dropConstraint('work_file_owner').execute();
  await db.schema.alterTable('project_task_files')
    .addColumn('project_id', 'varchar(36)', (column) => column.references('projects.id').onDelete('cascade'))
    .addColumn('course_id', 'varchar(36)', (column) => column.references('courses.id').onDelete('cascade'))
    .execute();
  await db.schema.alterTable('project_task_files').addCheckConstraint('work_file_owner',
    sql`num_nonnulls(task_id, assignment_id, project_id, course_id) = 1`).execute();
  await db.schema.createIndex('workspace_files_project_idx').on('project_task_files').column('project_id').execute();
  await db.schema.createIndex('workspace_files_course_idx').on('project_task_files').column('course_id').execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.deleteFrom('project_task_files').where('task_id', 'is', null).where('assignment_id', 'is', null).execute();
  await db.schema.alterTable('project_task_files').dropConstraint('work_file_owner').execute();
  await db.schema.alterTable('project_task_files').dropColumn('project_id').dropColumn('course_id').execute();
  await db.schema.alterTable('project_task_files').addCheckConstraint('work_file_owner',
    sql`(task_id is null) <> (assignment_id is null)`).execute();
}
