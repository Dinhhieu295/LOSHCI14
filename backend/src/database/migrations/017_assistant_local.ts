import type { Kysely } from 'kysely';
import type { Database } from '../types.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable('users').addColumn('assistant_local', 'boolean', (column) => column.notNull().defaultTo(false)).execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable('users').dropColumn('assistant_local').execute();
}
