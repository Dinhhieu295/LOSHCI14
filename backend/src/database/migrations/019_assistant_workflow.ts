import { sql, type Kysely } from 'kysely';
import type { Database } from '../types.js';

export async function up(db: Kysely<Database>) {
  await db.schema.alterTable('task_schedule_blocks').alterColumn('task_id', (column) => column.dropNotNull()).execute();
  await db.schema.alterTable('task_schedule_blocks')
    .addColumn('assignment_id', 'varchar(36)', (column) => column.references('assignments.id').onDelete('cascade')).execute();
  await db.schema.alterTable('task_schedule_blocks').addCheckConstraint('calendar_work_item_valid',
    sql`(task_id is not null)::integer + (assignment_id is not null)::integer = 1`).execute();
  await db.schema.createIndex('calendar_assignment_idx').on('task_schedule_blocks').column('assignment_id').execute();
  await db.schema.createTable('assistant_drafts')
    .addColumn('id', 'varchar(36)', (column) => column.primaryKey())
    .addColumn('user_id', 'varchar(36)', (column) => column.notNull().references('users.id').onDelete('cascade'))
    .addColumn('session_id', 'varchar(36)', (column) => column.notNull())
    .addColumn('scope', 'varchar(48)', (column) => column.notNull())
    .addColumn('command_json', 'text', (column) => column.notNull())
    .addColumn('preview_json', 'text', (column) => column.notNull())
    .addColumn('status', 'varchar(16)', (column) => column.notNull().defaultTo('pending'))
    .addColumn('result_json', 'text')
    .addColumn('expires_at', 'varchar(30)', (column) => column.notNull())
    .addColumn('created_at', 'varchar(30)', (column) => column.notNull()).execute();
  await db.schema.createIndex('assistant_drafts_owner_idx').on('assistant_drafts').columns(['user_id', 'session_id', 'scope']).execute();
}

export async function down(db: Kysely<Database>) {
  // Refuse a rollback that would discard assignment bookings.
  const assignment = await db.selectFrom('task_schedule_blocks').select('id').where('assignment_id', 'is not', null).executeTakeFirst();
  if (assignment) throw new Error('Remove assignment bookings before reverting migration 019.');
  await db.schema.dropTable('assistant_drafts').execute();
  await db.schema.alterTable('task_schedule_blocks').dropConstraint('calendar_work_item_valid').execute();
  await db.schema.alterTable('task_schedule_blocks').dropColumn('assignment_id').execute();
  await db.schema.alterTable('task_schedule_blocks').alterColumn('task_id', (column) => column.setNotNull()).execute();
}
