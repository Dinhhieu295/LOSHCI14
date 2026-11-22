import type { Kysely } from 'kysely';
import type { Database } from '../types.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable('project_timer_sessions')
    .addColumn('task_id', 'varchar(36)', (column) => column.references('tasks.id').onDelete('set null'))
    .addColumn('task_title', 'varchar(200)')
    .execute();
  await db.schema.createIndex('project_timer_task_idx').on('project_timer_sessions').columns(['task_id', 'started_at']).execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropIndex('project_timer_task_idx').execute();
  await db.schema.alterTable('project_timer_sessions').dropColumn('task_id').dropColumn('task_title').execute();
}
