import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { db } from '../database/index.js';
import type { AiProvider } from '../database/types.js';
import { HttpError } from '../http/errors.js';

export type AiConnection = { provider: AiProvider; model: string; apiKey: string };
export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export class AssistantStore {
  private readonly encryptionKey: Buffer | undefined;

  constructor(secret: string | undefined) {
    this.encryptionKey = secret ? createHash('sha256').update(secret).digest() : undefined;
  }

  get canSaveKey() { return Boolean(this.encryptionKey); }

  private key() {
    if (!this.encryptionKey) throw new HttpError(503, 'Máy chủ chưa cấu hình lưu khóa AI cá nhân.', 'AI_KEY_STORAGE_DISABLED');
    return this.encryptionKey;
  }

  settings(userId: string) {
    return db.selectFrom('assistant_settings').select(['provider', 'model']).where('user_id', '=', userId).executeTakeFirst();
  }

  async connection(userId: string): Promise<AiConnection | undefined> {
    const row = await db.selectFrom('assistant_settings').selectAll().where('user_id', '=', userId).executeTakeFirst();
    if (!row) return undefined;
    const key = this.key();
    try {
      const [iv, tag, ciphertext] = row.encrypted_key.split('.').map((part) => Buffer.from(part, 'base64url'));
      if (!iv || !tag || !ciphertext) throw new Error('Invalid encrypted key');
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(Buffer.from(`${userId}:${row.provider}`));
      decipher.setAuthTag(tag);
      const apiKey = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
      return { provider: row.provider, model: row.model, apiKey };
    } catch {
      throw new HttpError(503, 'Không mở được khóa AI đã lưu. Hãy nhập lại khóa trong Cài đặt.', 'AI_KEY_UNREADABLE');
    }
  }

  async saveConnection(userId: string, { provider, model, apiKey }: AiConnection) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    cipher.setAAD(Buffer.from(`${userId}:${provider}`));
    const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
    const encrypted_key = [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
    const values = { provider, model, encrypted_key };
    await db.insertInto('assistant_settings').values({ user_id: userId, ...values })
      .onConflict((conflict) => conflict.column('user_id').doUpdateSet(values)).execute();
  }

  async removeConnection(userId: string) {
    await db.deleteFrom('assistant_settings').where('user_id', '=', userId).execute();
  }

  async history(userId: string, scope: string): Promise<ChatMessage[]> {
    const row = await db.selectFrom('assistant_conversations').select('messages_json')
      .where('user_id', '=', userId).where('scope', '=', scope).executeTakeFirst();
    return row ? JSON.parse(row.messages_json) as ChatMessage[] : [];
  }

  async saveHistory(userId: string, scope: string, messages: ChatMessage[]) {
    const messages_json = JSON.stringify(messages.slice(-60));
    await db.insertInto('assistant_conversations').values({ user_id: userId, scope, messages_json })
      .onConflict((conflict) => conflict.columns(['user_id', 'scope']).doUpdateSet({ messages_json })).execute();
  }

  async clearHistory(userId: string, scope: string) {
    await db.deleteFrom('assistant_conversations').where('user_id', '=', userId).where('scope', '=', scope).execute();
  }
}
