import type { Kysely } from 'kysely';
import type { Database } from '../types.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable('tasks').addColumn('completed_at', 'varchar(32)').execute();
  await db.schema.createTable('study_availability')
    .addColumn('user_id', 'varchar(36)', (column) => column.primaryKey().references('users.id').onDelete('cascade'))
    .addColumn('windows_json', 'text', (column) => column.notNull())
    .execute();
  await db.schema.createTable('study_feedback')
    .addColumn('user_id', 'varchar(36)', (column) => column.notNull().references('users.id').onDelete('cascade'))
    .addColumn('course_id', 'varchar(36)', (column) => column.notNull().references('courses.id').onDelete('cascade'))
    .addColumn('preference', 'varchar(10)', (column) => column.notNull())
    .addPrimaryKeyConstraint('study_feedback_pk', ['user_id', 'course_id'])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('study_feedback').execute();
  await db.schema.dropTable('study_availability').execute();
  await db.schema.alterTable('tasks').dropColumn('completed_at').execute();
}
