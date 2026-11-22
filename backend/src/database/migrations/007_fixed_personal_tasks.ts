import { sql, type Kysely } from 'kysely';
import type { Database } from '../types.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable('tasks')
    .addColumn('fixed_date', 'varchar(10)')
    .addColumn('fixed_start_minute', 'integer')
    .addColumn('fixed_end_minute', 'integer')
    .execute();
  await db.schema.alterTable('tasks').addCheckConstraint('tasks_fixed_slot_valid', sql`
    (fixed_date is null and fixed_start_minute is null and fixed_end_minute is null)
    or (personal_user_id is not null and fixed_date is not null
      and fixed_start_minute is not null and fixed_end_minute is not null
      and fixed_start_minute >= 0 and fixed_end_minute <= 1440 and fixed_end_minute - fixed_start_minute >= 15)
  `).execute();
  await db.schema.createIndex('tasks_fixed_day_idx').on('tasks').columns(['personal_user_id', 'fixed_date']).execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropIndex('tasks_fixed_day_idx').execute();
  await db.schema.alterTable('tasks').dropConstraint('tasks_fixed_slot_valid').execute();
  await db.schema.alterTable('tasks').dropColumn('fixed_date').dropColumn('fixed_start_minute').dropColumn('fixed_end_minute').execute();
}
