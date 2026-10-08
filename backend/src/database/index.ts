import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import DatabaseDriver from 'better-sqlite3';
import { Pool } from 'pg';
import { Kysely, PostgresDialect, SqliteDialect } from 'kysely';
import { config } from '../config.js';
import type { Database } from './types.js';

function createSqliteDatabase(): Kysely<Database> {
  const configuredPath = config.DATABASE_URL.replace(/^file:/, '');
  const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const databasePath = path.resolve(backendRoot, configuredPath);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const sqlite = new DatabaseDriver(databasePath);
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');

  return new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) });
}

function createPostgresDatabase(): Kysely<Database> {
  if (config.DATABASE_URL.startsWith('file:')) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL when DATABASE_PROVIDER=postgres.');
  }

  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString: config.DATABASE_URL }) }),
  });
}

export const db = config.DATABASE_PROVIDER === 'sqlite'
  ? createSqliteDatabase()
  : createPostgresDatabase();

export async function closeDatabase(): Promise<void> {
  await db.destroy();
}
