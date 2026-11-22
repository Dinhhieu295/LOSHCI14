import { sql, type Kysely, type SqlBool } from 'kysely';
import type { Database } from '../types.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.createTable('project_task_files')
    .addColumn('id', 'varchar(36)', (column) => column.primaryKey())
    .addColumn('task_id', 'varchar(36)', (column) => column.notNull().references('tasks.id').onDelete('cascade'))
    .addColumn('name', 'varchar(255)', (column) => column.notNull())
    .addColumn('size_bytes', 'integer', (column) => column.notNull())
    .addColumn('contents', 'bytea', (column) => column.notNull())
    .addColumn('created_at', 'varchar(30)', (column) => column.notNull())
    .execute();
  await db.schema.createIndex('project_task_files_task_idx').on('project_task_files').column('task_id').execute();

  await db.schema.createTable('project_timer_sessions')
    .addColumn('id', 'varchar(36)', (column) => column.primaryKey())
    .addColumn('project_id', 'varchar(36)', (column) => column.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('started_at', 'varchar(30)', (column) => column.notNull())
    .addColumn('stopped_at', 'varchar(30)')
    .addColumn('duration_seconds', 'integer')
    .execute();
  await db.schema.createIndex('project_timer_active_idx').on('project_timer_sessions').column('project_id')
    .unique().where(sql<SqlBool>`stopped_at is null`).execute();
  await db.schema.createIndex('project_timer_history_idx').on('project_timer_sessions').columns(['project_id', 'started_at']).execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('project_timer_sessions').execute();
  await db.schema.dropTable('project_task_files').execute();
}
