import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { db, inTransaction } from '../database/index.js';
import type { AiProvider } from '../database/types.js';
import { HttpError } from '../http/errors.js';
import type { PlanCommand } from './plans.js';

export type AiConnection = { provider: AiProvider; model: string; apiKey: string };
export type ChatMessage = { role: 'user' | 'assistant'; content: string; execution?: unknown; sources?: { title: string; href: string }[]; model?: string; steps?: { tool: string; status: string }[] };

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
    await inTransaction(async () => {
      await db.selectFrom('users').select('id').where('id', '=', userId).forUpdate().executeTakeFirstOrThrow();
      await db.deleteFrom('assistant_conversations').where('user_id', '=', userId).where('scope', '=', scope).execute();
      await db.updateTable('assistant_drafts').set({ status: 'cancelled', command_json: '{}' }).where('user_id', '=', userId).where('scope', '=', scope).where('status', '=', 'pending').execute();
    });
  }

  async appendHistory(userId: string, scope: string, messages: ChatMessage[]) {
    await inTransaction(async () => {
      await db.selectFrom('users').select('id').where('id', '=', userId).forUpdate().executeTakeFirstOrThrow();
      await this.saveHistory(userId, scope, [...await this.history(userId, scope), ...messages]);
    });
  }

  async saveDraft(id: string, userId: string, sessionId: string, scope: string, command: PlanCommand, preview: object) {
    const now = new Date();
    await db.updateTable('assistant_drafts').set({ status: 'expired', command_json: '{}' })
      .where('user_id', '=', userId).where('status', '=', 'pending').where('expires_at', '<=', now.toISOString()).execute();
    await db.insertInto('assistant_drafts').values({ id, user_id: userId, session_id: sessionId, scope,
      command_json: JSON.stringify(command), preview_json: JSON.stringify(preview), status: 'pending', result_json: null,
      created_at: now.toISOString(), expires_at: new Date(now.getTime() + 15 * 60000).toISOString() }).execute();
  }

  async drafts(userId: string, sessionId: string, scope: string) {
    const rows = await db.selectFrom('assistant_drafts').select(['id', 'preview_json'])
      .where('user_id', '=', userId).where('session_id', '=', sessionId).where('scope', '=', scope)
      .where('status', '=', 'pending').where('expires_at', '>', new Date().toISOString()).orderBy('created_at').execute();
    return rows.map((row) => ({ id: row.id, ...JSON.parse(row.preview_json) }));
  }

  async applyDraft<T>(id: string, userId: string, sessionId: string, apply: (command: PlanCommand) => Promise<T>): Promise<T> {
    return inTransaction(async () => {
      await db.selectFrom('users').select('id').where('id', '=', userId).forUpdate().executeTakeFirstOrThrow();
      const row = await db.selectFrom('assistant_drafts').selectAll().where('id', '=', id)
        .where('user_id', '=', userId).where('session_id', '=', sessionId).forUpdate().executeTakeFirst();
      if (!row) throw new HttpError(404, 'Không tìm thấy đề xuất trong phiên đăng nhập này.');
      if (row.status === 'applied' && row.result_json) return JSON.parse(row.result_json) as T;
      if (row.status !== 'pending' || row.expires_at <= new Date().toISOString()) throw new HttpError(409, 'Đề xuất đã hết hạn hoặc đã được bỏ qua.');
      const command = JSON.parse(row.command_json) as PlanCommand;
      const result = await apply(command);
      await db.updateTable('assistant_drafts').set({ status: 'applied', result_json: JSON.stringify(result), command_json: '{}' }).where('id', '=', id).execute();
      const history = await this.history(userId, row.scope);
      const execution = result as { steps?: { operation: string; target: string; resource: string }[] };
      const operations: Record<string, string> = { create: 'Thêm', update: 'Cập nhật', delete: 'Xóa' };
      await this.saveHistory(userId, row.scope, [...history, { role: 'assistant', execution: result,
        content: `Đã thực hiện: ${execution.steps?.map((step) => `${operations[step.operation] ?? 'Xử lý'} ${step.target || step.resource}`).join('; ') ?? 'Thay đổi đã được lưu.'}` }]);
      return result;
    });
  }

  async cancelDraft(id: string, userId: string, sessionId: string) {
    await inTransaction(async () => {
      await db.selectFrom('users').select('id').where('id', '=', userId).forUpdate().executeTakeFirstOrThrow();
      const row = await db.updateTable('assistant_drafts').set({ status: 'cancelled', command_json: '{}' })
        .where('id', '=', id).where('user_id', '=', userId).where('session_id', '=', sessionId).where('status', '=', 'pending')
        .returning(['scope', 'preview_json']).executeTakeFirst();
      if (!row) throw new HttpError(404, 'Đề xuất không tồn tại hoặc đã được xử lý.');
      const preview = JSON.parse(row.preview_json);
      await this.appendHistory(userId, row.scope, [{ role: 'assistant', content: `Đã bỏ qua đề xuất “${preview.target || preview.resource}”. Chưa thay đổi dữ liệu.`, execution: { status: 'cancelled', id } }]);
    });
  }
}
