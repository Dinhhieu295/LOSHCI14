import { sql, type Kysely } from 'kysely';
import type { Database } from '../types.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable('tasks').addColumn('category', 'varchar(12)').execute();
  await db.updateTable('tasks').set({ category: 'personal' }).where('personal_user_id', 'is not', null).execute();
  await db.schema.alterTable('tasks').addCheckConstraint('tasks_category_valid', sql`
    (personal_user_id is null and category is null)
    or (personal_user_id is not null and category is not null and category in ('employment', 'personal'))
  `).execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable('tasks').dropConstraint('tasks_category_valid').execute();
  await db.schema.alterTable('tasks').dropColumn('category').execute();
}
