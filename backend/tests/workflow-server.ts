// Deterministic model fixture for browser tests; never imported by production.
import express from 'express';
import { createServices } from '../src/application/services/index.js';
import { KyselyLifeOsRepository } from '../src/infrastructure/repositories/kysely-lifeos-repository.js';
import { TaskCalendarRepository } from '../src/infrastructure/repositories/task-calendar-repository.js';
import { createAssistantActions } from '../src/assistant/actions.js';
import { createAssistantRouter } from '../src/assistant/router.js';
import { AssistantStore } from '../src/assistant/store.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { closeDatabase } from '../src/database/index.js';
import type { ModelItem } from '../src/assistant/provider.js';

const services = createServices(new KyselyLifeOsRepository());
const actions = createAssistantActions(services, new TaskCalendarRepository());
const call = (name: string, args: unknown): ModelItem[] => [{ type: 'function_call', name, arguments: JSON.stringify(args), call_id: `fixture-${name}` }];
const reply = (text: string): ModelItem[] => [{ type: 'message', content: [{ type: 'output_text', text }] }];
const model = async (input: ModelItem[], instructions: string) => {
  const user = input.filter((item) => item.role === 'user').at(-1)!;
  const text = typeof user.content === 'string' ? user.content : String((user.content as ModelItem[])[0]!.text);
  const outputs = input.filter((item) => item.type === 'function_call_output');
  const last = outputs.length ? JSON.parse(String(outputs.at(-1)!.output)) : undefined;
  if (last?.error) return reply(last.error);
  const plan = /^Tạo dự án (.+) và thêm task (.+)$/.exec(text);
  if (plan) return outputs.length ? reply('Kế hoạch đã sẵn sàng. Hãy xem và xác nhận.') : call('propose_lifeos_plan', {
    title: plan[1], steps: [
      { key: 'project', change: { resource: 'projects', operation: 'create', data: { title: plan[1] } } },
      { key: 'task', change: { resource: 'project-tasks', operation: 'create', projectId: '$project.id', data: { title: plan[2] } } },
    ],
  });
  if (text.startsWith('Đổi tên dự án ')) {
    const title = text.slice('Đổi tên dự án '.length);
    if (!outputs.length) return call('search_lifeos', { resources: ['projects'], query: title });
    if (outputs.length === 1) return call('propose_lifeos_change', { resource: 'projects', operation: 'update', id: last.items[0].id, data: { title: `${title} đã sửa` } });
    return reply('Hãy kiểm tra tên trước và sau rồi áp dụng.');
  }
  if (text.startsWith('Lưu tệp này vào dự án')) {
    const context = /Page context \(data\): (\{[^\n]+\})\./.exec(instructions);
    if (!context) return reply('Mở dự án cần lưu tệp.');
    return outputs.length ? reply('Hãy xác nhận lưu tài liệu.') : call('propose_attachment_upload', { workspaceKind: 'project', workspaceId: JSON.parse(context[1]!).id });
  }
  return outputs.length ? reply('Đã đọc dữ liệu LifeOS.') : call('get_lifeos_overview', {});
};
const app = express();
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/assistant', createAssistantRouter(services.auth, actions, model, new AssistantStore(undefined))).use(errorHandler);
const server = app.listen(4002, '127.0.0.1', () => console.log('Workflow browser fixture listening on 4002'));
process.on('SIGINT', () => server.close(() => void closeDatabase()));
