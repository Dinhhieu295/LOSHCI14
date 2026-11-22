import type { Kysely } from 'kysely';
import type { Database } from '../types.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.createTable('assistant_settings')
    .addColumn('user_id', 'varchar(36)', (column) => column.primaryKey().references('users.id').onDelete('cascade'))
    .addColumn('provider', 'varchar(16)', (column) => column.notNull())
    .addColumn('model', 'varchar(100)', (column) => column.notNull())
    .addColumn('encrypted_key', 'text', (column) => column.notNull())
    .execute();
  await db.schema.createTable('assistant_conversations')
    .addColumn('user_id', 'varchar(36)', (column) => column.notNull().references('users.id').onDelete('cascade'))
    .addColumn('scope', 'varchar(48)', (column) => column.notNull())
    .addColumn('messages_json', 'text', (column) => column.notNull())
    .addPrimaryKeyConstraint('assistant_conversations_pk', ['user_id', 'scope'])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('assistant_conversations').execute();
  await db.schema.dropTable('assistant_settings').execute();
}
