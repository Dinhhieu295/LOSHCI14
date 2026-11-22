import type { Kysely } from 'kysely';
import type { Database } from '../types.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.updateTable('courses').set({ status: 'Completed' }).where('status', '=', 'Archived').execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.updateTable('courses').set({ status: 'Archived' }).where('status', '=', 'Completed').execute();
}
