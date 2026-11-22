import { sql, type Kysely } from 'kysely';
import type { Database } from '../types.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable('tasks').alterColumn('project_id', (column) => column.dropNotNull()).execute();
  await db.schema.alterTable('tasks')
    .addColumn('personal_user_id', 'varchar(36)', (column) => column.references('users.id').onDelete('cascade'))
    .execute();
  await db.schema.alterTable('tasks').addCheckConstraint(
    'tasks_exactly_one_owner', sql`(project_id is null) <> (personal_user_id is null)`,
  ).execute();
  await db.schema.createIndex('tasks_personal_user_idx').on('tasks').column('personal_user_id').execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Restoring the old shape is intentionally blocked while personal tasks still exist.
  await db.schema.alterTable('tasks').alterColumn('project_id', (column) => column.setNotNull()).execute();
  await db.schema.dropIndex('tasks_personal_user_idx').execute();
  await db.schema.alterTable('tasks').dropConstraint('tasks_exactly_one_owner').execute();
  await db.schema.alterTable('tasks').dropColumn('personal_user_id').execute();
}
