import { sql, type Kysely } from 'kysely';
import type { Database } from '../types.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.createTable('task_schedule_blocks')
    .addColumn('id', 'varchar(36)', (column) => column.primaryKey())
    .addColumn('user_id', 'varchar(36)', (column) => column.notNull().references('users.id').onDelete('cascade'))
    .addColumn('task_id', 'varchar(36)', (column) => column.notNull().references('tasks.id').onDelete('cascade'))
    .addColumn('scheduled_date', 'varchar(10)', (column) => column.notNull())
    .addColumn('start_minute', 'integer', (column) => column.notNull())
    .addColumn('end_minute', 'integer', (column) => column.notNull())
    .addCheckConstraint('task_schedule_time_valid', sql`start_minute >= 0 and end_minute <= 1440 and end_minute - start_minute >= 15`)
    .execute();
  await db.schema.createIndex('task_schedule_user_date_idx').on('task_schedule_blocks')
    .columns(['user_id', 'scheduled_date']).execute();
  await db.schema.createIndex('task_schedule_task_idx').on('task_schedule_blocks').column('task_id').execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('task_schedule_blocks').execute();
}
