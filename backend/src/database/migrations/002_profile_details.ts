import type { Kysely } from 'kysely';
import type { Database } from '../types.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable('users').addColumn('phone', 'varchar(40)').execute();
  await db.schema.alterTable('users').addColumn('location', 'varchar(120)').execute();
  await db.schema.alterTable('users').addColumn('bio', 'varchar(500)').execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable('users').dropColumn('bio').execute();
  await db.schema.alterTable('users').dropColumn('location').execute();
  await db.schema.alterTable('users').dropColumn('phone').execute();
}
