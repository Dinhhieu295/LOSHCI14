import { Pool } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import { config } from '../config.js';
import type { Database } from './types.js';

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool: new Pool({ connectionString: config.DATABASE_URL }) }),
});

export async function closeDatabase(): Promise<void> {
  await db.destroy();
}
