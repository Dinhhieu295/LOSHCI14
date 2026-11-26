import { Pool } from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Kysely, PostgresDialect } from 'kysely';
import type { Transaction } from 'kysely';
import { config } from '../config.js';
import type { Database } from './types.js';

const database = new Kysely<Database>({
  dialect: new PostgresDialect({ pool: new Pool({ connectionString: config.DATABASE_URL }) }),
});

const transactions = new AsyncLocalStorage<Transaction<Database>>();
// Repositories keep using db. An assistant plan shares one transaction, including
// nested repository operations, receipts and conversation history.
export const db = new Proxy(database, {
  get(target, property) {
    const transaction = transactions.getStore();
    if (transaction && property === 'transaction') {
      return () => ({ execute: <T>(callback: (connection: Transaction<Database>) => Promise<T>) => callback(transaction) });
    }
    const connection = transaction ?? target;
    const value = Reflect.get(connection, property, connection);
    return typeof value === 'function' ? value.bind(connection) : value;
  },
});

export async function inTransaction<T>(operation: () => Promise<T>): Promise<T> {
  if (transactions.getStore()) return operation();
  return database.transaction().execute((transaction) => transactions.run(transaction, operation));
}

export async function closeDatabase(): Promise<void> {
  await database.destroy();
}
