import type { Kysely } from 'kysely';
import type { Database } from '../types.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.createTable('course_sessions')
    .addColumn('id', 'varchar(36)', (column) => column.primaryKey())
    .addColumn('user_id', 'varchar(36)', (column) => column.notNull().references('users.id').onDelete('cascade'))
    .addColumn('course_id', 'varchar(36)', (column) => column.notNull().references('courses.id').onDelete('cascade'))
    .addColumn('weekday', 'integer', (column) => column.notNull())
    .addColumn('start_time', 'varchar(5)', (column) => column.notNull())
    .addColumn('end_time', 'varchar(5)', (column) => column.notNull())
    .addColumn('period_start', 'integer', (column) => column.notNull())
    .addColumn('period_end', 'integer', (column) => column.notNull())
    .addColumn('location', 'varchar(120)', (column) => column.notNull().defaultTo(''))
    .addColumn('room', 'varchar(80)', (column) => column.notNull().defaultTo(''))
    .addColumn('color', 'varchar(40)', (column) => column.notNull().defaultTo(''))
    .addColumn('created_at', 'varchar(32)', (column) => column.notNull())
    .addColumn('updated_at', 'varchar(32)', (column) => column.notNull())
    .execute();
  await db.schema.createIndex('course_sessions_user_weekday_idx').on('course_sessions').columns(['user_id', 'weekday']).execute();

  await db.schema.createTable('study_logs')
    .addColumn('id', 'varchar(36)', (column) => column.primaryKey())
    .addColumn('user_id', 'varchar(36)', (column) => column.notNull().references('users.id').onDelete('cascade'))
    .addColumn('course_id', 'varchar(36)', (column) => column.references('courses.id').onDelete('set null'))
    .addColumn('log_date', 'varchar(10)', (column) => column.notNull())
    .addColumn('duration_minutes', 'integer', (column) => column.notNull())
    .addColumn('note', 'varchar(500)', (column) => column.notNull().defaultTo(''))
    .addColumn('created_at', 'varchar(32)', (column) => column.notNull())
    .addColumn('updated_at', 'varchar(32)', (column) => column.notNull())
    .execute();
  await db.schema.createIndex('study_logs_user_date_idx').on('study_logs').columns(['user_id', 'log_date']).execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('study_logs').ifExists().execute();
  await db.schema.dropTable('course_sessions').ifExists().execute();
}
