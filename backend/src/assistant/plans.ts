import { z } from 'zod';
import { HttpError } from '../http/errors.js';
import type { createAssistantActions, ChangeCommand } from './actions.js';
import type { AssistantFile } from './provider.js';

type Actions = ReturnType<typeof createAssistantActions>;
type Context = { kind: 'course' | 'project'; id: string };
export type PreparedChange = Awaited<ReturnType<Actions['prepare']>>;
export type PlanCommand = { kind: 'change'; change: ChangeCommand; version?: string; context?: Context } |
  { kind: 'plan'; title: string; steps: { key: string; change: ChangeCommand; version?: string }[]; context?: Context };
const stepSchema = z.strictObject({ key: z.string().regex(/^[a-z][a-z0-9_]{0,30}$/), change: z.strictObject({
  resource: z.string().min(1).max(40), operation: z.enum(['create', 'update', 'delete']),
  id: z.string().max(80).optional(), projectId: z.string().max(80).optional(), courseId: z.string().max(80).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
}) });
export const planSchema = z.strictObject({ title: z.string().trim().min(1).max(160), steps: z.array(stepSchema).min(1).max(20) });
const reference = /^\$([a-z][a-z0-9_]{0,30})\.id$/;
const placeholder = '00000000-0000-4000-8000-000000000001';

function mapReferences(value: unknown, resolve: (key: string) => unknown): unknown {
  if (typeof value === 'string') {
    const match = reference.exec(value);
    if (match) return resolve(match[1]!);
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => mapReferences(item, resolve));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapReferences(item, resolve)]));
  return value;
}
export async function preparePlan(actions: Actions, userId: string, input: unknown, context?: Context, attachment?: AssistantFile) {
  const plan = planSchema.parse(input);
  const previous = new Set<string>();
  const steps: Extract<PlanCommand, { kind: 'plan' }>['steps'] = [];
  const previews: Record<string, unknown>[] = [];
  for (const step of plan.steps) {
    if (previous.has(step.key)) throw new HttpError(400, 'Mã bước trong kế hoạch phải khác nhau.');
    let dependent = false;
    const substituted = mapReferences(step.change, (key) => {
      if (!previous.has(key)) throw new HttpError(400, `Tham chiếu $${key}.id phải trỏ đến bước trước.`);
      const origin = steps.find((item) => item.key === key)!.change.input;
      if (origin.operation === 'delete' || ['task-blocks', 'availability', 'study-feedback', 'profile'].includes(String(origin.resource))) {
        throw new HttpError(400, 'Bước được tham chiếu phải trả về một bản ghi có ID.');
      }
      dependent = true;
      return placeholder;
    });
    let changeInput = step.change;
    if (step.change.resource === 'files' && step.change.operation === 'create') {
      if (!attachment) throw new HttpError(400, 'Đính kèm tệp cần lưu.');
      changeInput = { ...changeInput, data: { ...(changeInput.data as object), name: attachment.name, contentsBase64: attachment.data } };
    }
    if (!dependent) {
      const draft = await actions.prepare(userId, changeInput, context, attachment);
      steps.push({ key: step.key, change: draft.command, version: draft.version });
      const { apply: _apply, command: _command, ...preview } = draft;
      previews.push({ key: step.key, ...preview });
    } else {
      const candidate = step.change.resource === 'files' && attachment ? { ...(substituted as object), data: {
        ...((substituted as Record<string, unknown>).data as object), name: attachment.name, contentsBase64: attachment.data,
      } } : substituted;
      const validated = actions.validate(candidate);
      const { contentsBase64: _contents, ...details } = (step.change.data ?? {}) as Record<string, unknown>;
      steps.push({ key: step.key, change: { input: step.change, ...(step.change.resource === 'files' ? { attachment } : {}) } });
      previews.push({ key: step.key, operation: validated.operation, resourceKey: validated.resource, resource: actions.label(validated.resource),
        target: String(details.title ?? details.name ?? 'Thực hiện sau bước trước'), details, dependsOn: [...previous].filter((key) => JSON.stringify(step.change).includes(`$${key}.id`)) });
    }
    previous.add(step.key);
  }
  return { command: { kind: 'plan', title: plan.title, steps, context } satisfies PlanCommand,
    preview: { operation: 'plan' as const, resource: 'Kế hoạch nhiều bước', resourceKey: 'plan', target: plan.title, details: {}, steps: previews,
      impact: ['Các bước được thực hiện trong một giao dịch. Nếu một bước thất bại, toàn bộ thay đổi của kế hoạch được hoàn tác.'] } };
}

export async function executePlan(actions: Actions, userId: string, command: PlanCommand, lockRows = false) {
  const completed: { key: string; resource: string; operation: string; target: string; value: unknown }[] = [];
  const steps = command.kind === 'plan' ? command.steps : [{ key: 'change', change: command.change, version: command.version }];
  for (const step of steps) {
    const resolved = mapReferences(step.change.input, (key) => {
      const value = completed.find((item) => item.key === key)?.value;
      if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string') throw new HttpError(409, `Bước ${key} chưa trả về ID hợp lệ.`);
      return value.id;
    });
    if (lockRows) await actions.lock(userId, resolved as Record<string, unknown>);
    const draft = await actions.prepare(userId, resolved, command.context, step.change.attachment);
    if (step.version && draft.version !== step.version) throw new HttpError(409, 'Dữ liệu đã thay đổi sau khi xem trước. Hãy tạo đề xuất mới.', 'ASSISTANT_STALE_DRAFT');
    const value = await draft.apply();
    completed.push({ key: step.key, resource: draft.resourceKey, operation: draft.operation, target: draft.target, value: value ?? null });
  }
  return { status: 'applied' as const, resources: [...new Set(completed.map((item) => item.resource))], steps: completed };
}
