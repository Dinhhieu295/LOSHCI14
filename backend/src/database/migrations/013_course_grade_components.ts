import type { Kysely } from 'kysely';
import type { Database } from '../types.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable('courses').addColumn('grade_components_json', 'text', (column) => column.notNull().defaultTo('[]')).execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable('courses').dropColumn('grade_components_json').execute();
}
