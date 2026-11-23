import type { Kysely } from 'kysely';
import type { Database } from '../types.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.createTable('assistant_connections')
    .addColumn('user_id', 'varchar(36)', (column) => column.notNull().references('users.id').onDelete('cascade'))
    .addColumn('provider', 'varchar(16)', (column) => column.notNull())
    .addColumn('model', 'varchar(100)', (column) => column.notNull())
    .addColumn('encrypted_key', 'text', (column) => column.notNull())
    .addPrimaryKeyConstraint('assistant_connections_pk', ['user_id', 'provider'])
    .execute();
  await db.insertInto('assistant_connections').columns(['user_id', 'provider', 'model', 'encrypted_key'])
    .expression((query) => query.selectFrom('assistant_settings').select(['user_id', 'provider', 'model', 'encrypted_key']))
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('assistant_connections').execute();
}
