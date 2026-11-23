import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import { ApplicationError } from '../src/application/errors.ts';
import { createAssistantActions } from '../src/assistant/actions.ts';
import { formatUpcomingDeadlines } from '../src/assistant/deadlines.ts';
import { readPersonalSchedule } from '../src/assistant/personal-schedule.ts';
import { GroqRateLimitError, messageWithFile, modelText, sendModel } from '../src/assistant/provider.ts';
import { createAssistantRouter } from '../src/assistant/router.ts';
import { errorHandler } from '../src/middleware/error-handler.ts';

const userA = randomUUID();
const userB = randomUUID();
const sessions = new Map([
  ['a', { userId: userA, sessionId: 'session-a' }],
  ['a-other-device', { userId: userA, sessionId: 'session-a-other-device' }],
  ['b', { userId: userB, sessionId: 'session-b' }],
]);

function modelCall(name, args, id) {
  return { type: 'function_call', name, arguments: JSON.stringify(args), call_id: id, id };
}

test('personal schedule resolves one local date and an unambiguous time interval', () => {
  assert.deepEqual(readPersonalSchedule('Đặt việc ăn sinh nhật tối mai lúc 8h15 đến 9h', '2026-11-23'), {
    slot: { date: '2026-11-24', start: 1215, end: 1260 },
  });
  assert.deepEqual(readPersonalSchedule('Dọn nhà từ 07:30–09:00 ngày mốt', '2026-12-30'), {
    slot: { date: '2027-01-01', start: 450, end: 540 },
  });
  assert.deepEqual(readPersonalSchedule('Họp nhóm 14:30 tới 15:30 ngày 24/11/2026', '2026-11-23'), {
    slot: { date: '2026-11-24', start: 870, end: 930 },
  });
  assert.ok(readPersonalSchedule('Dọn nhà 8 đến 9 giờ ngày mai', '2026-11-23').question);
  assert.ok(readPersonalSchedule('Tập thể thao 20:00–21:00', '2026-11-23').question);
  assert.ok(readPersonalSchedule('Họp nhóm 20:00–21:00 ngày 30/02/2027', '2026-11-23').question);
  assert.ok(readPersonalSchedule('Họp nhóm 23:00–01:00 ngày mai', '2026-11-23').question);
  assert.equal(readPersonalSchedule('Đọc tài liệu trong 7 ngày tới', '2026-11-23'), undefined);
});

test('scheduled personal task only saves the confirmed local date and times', async (t) => {
  // It is already 23 November in Vietnam but still 22 November in UTC.
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-22T17:15:00Z') });
  const saved = [];
  const auth = { authenticate: async (token) => sessions.get(token) };
  const services = { projects: { createPersonalTask: async (userId, task) => {
    assert.equal(userId, userA);
    saved.push(task);
  } } };
  const output = (text) => [{ type: 'message', content: [{ type: 'output_text', text }] }];
  const fakeModel = async (input, _instructions, tools, _signal, format) => {
    if (!format) return output('Bạn đang xem lịch.');
    assert.equal(format.name, 'scheduled_personal_task');
    assert.equal(tools.length, 0);
    if (input[0].content.includes('xem phim')) return output('Đã lưu vào lịch.');
    const title = input[0].content.startsWith('Xem') ? null : 'Đi ăn sinh nhật';
    return output(JSON.stringify({ title }));
  };
  const app = express().use(createAssistantRouter(auth, createAssistantActions(services, {}), fakeModel)).use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const request = (path, body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method: 'POST', headers: { Authorization: 'Bearer a', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const chat = async (content) => {
    const response = await request('/chat', { timeZone: 'Asia/Ho_Chi_Minh', messages: [{ role: 'user', content }] });
    assert.equal(response.status, 200);
    return response.json();
  };
  try {
    const { reply, changes } = await chat('Thêm công việc cá nhân là Đi ăn sinh nhật vào tối mai lúc 8 đến 9 giờ');
    const expectedSlot = { date: '2026-11-24', start: 1200, end: 1260 };
    assert.match(reply, /chờ xác nhận/);
    assert.equal(changes.length, 1);
    assert.deepEqual(changes[0].details, { title: 'Đi ăn sinh nhật', category: 'personal', fixedSlot: expectedSlot });
    assert.deepEqual(saved, []);
    assert.equal((await request(`/changes/${changes[0].id}/apply`)).status, 204);
    assert.equal(saved.length, 1);
    assert.deepEqual(saved[0].fixedSlot, expectedSlot);
    assert.equal(saved[0].category, 'personal');

    const ambiguous = await chat('Thêm việc Đi ăn sinh nhật từ 8 đến 9 giờ ngày mai');
    assert.match(ambiguous.reply, /24 giờ/);
    assert.deepEqual(ambiguous.changes, []);
    const reading = await chat('Xem lịch ngày mai từ 20:00 đến 21:00');
    assert.equal(reading.reply, 'Bạn đang xem lịch.');
    assert.deepEqual(reading.changes, []);
    const malformed = await chat('Thêm việc đi xem phim từ 20:00 đến 21:00 ngày mai');
    assert.match(malformed.reply, /chưa xác định/);
    assert.deepEqual(malformed.changes, []);
    assert.equal(saved.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('deadline summary includes today and the sixth following day in the user time zone', () => {
  const window = { today: '2026-11-23', days: 7, timeZone: 'Asia/Ho_Chi_Minh' };
  const result = formatUpcomingDeadlines(window, [
    { title: 'Bài tập tối', deadline: '2026-11-22T17:30:00Z', status: 'In Progress' },
    { title: 'Bài quá hạn', deadline: '2026-11-22' },
    { title: 'Bài đã làm xong', deadline: '2026-11-24', status: 'Completed' },
    { title: 'Bài ở ngoài khoảng', deadline: '2026-11-29T18:00:00Z' },
  ], [
    { title: 'Task cuối khoảng', projectTitle: 'Báo cáo nhóm', dueDate: '2026-11-29', status: 'todo' },
    { title: 'Task đã hoàn thành', projectTitle: 'Báo cáo nhóm', dueDate: '2026-11-24', status: 'done' },
  ], [
    { title: 'Lấy sách', dueDate: '2026-11-25', category: 'personal' },
    { title: 'Ca làm lặp', dueDate: '2026-11-24', category: 'employment' },
    { title: 'Việc đã hoàn thành', dueDate: '2026-11-24', category: 'personal', isDone: true },
  ]);
  assert.match(result, /23\/11\/2026 đến hết ngày 29\/11\/2026, bạn có 3 mục/);
  assert.deepEqual(result.trim().split('\n').filter((line) => line.startsWith('-')), [
    '- 23/11/2026 lúc 00:30 · Bài tập tối (Bài tập)',
    '- 25/11/2026 · Lấy sách (Việc cá nhân)',
    '- 29/11/2026 · Task cuối khoảng (Dự án Báo cáo nhóm)',
  ]);
});

test('the seven-day chat query reads all three categories for the signed-in account without calling a model', async () => {
  const auth = { authenticate: async (token) => sessions.get(token) };
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short' }).format(new Date());
  const projectId = randomUUID();
  const services = {
    study: { list: async (userId, resource) => {
      assert.equal(resource, 'assignments');
      return userId === userA ? [{ title: 'Nộp sơ đồ ERD', deadline: today }] : [];
    } },
    projects: {
      list: async (userId) => userId === userA ? [{ id: projectId, title: 'Báo cáo nhóm' }] : [],
      listTasks: async (userId, id) => {
        assert.equal(userId, userA);
        assert.equal(id, projectId);
        return [{ title: 'Viết kết luận', dueDate: today }];
      },
      listPersonalTasks: async (userId) => userId === userA ? [{ title: 'Lấy sách', category: 'personal', dueDate: today }] : [],
    },
  };
  let modelCalls = 0;
  const fakeModel = async () => {
    modelCalls++;
    return [{ type: 'message', content: [{ type: 'output_text', text: 'Luồng trợ lý thông thường' }] }];
  };
  const app = express().use(createAssistantRouter(auth, createAssistantActions(services, {}), fakeModel)).use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const chat = async (content, token) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/chat`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content }] }),
      });
      assert.equal(response.status, 200);
      return response.json();
    };
    const summary = await chat('Tôi có deadline nào trong 7 ngày tới không?', 'a');
    assert.match(summary.reply, /3 mục chưa hoàn thành/);
    assert.match(summary.reply, /Nộp sơ đồ ERD/);
    assert.match(summary.reply, /Viết kết luận/);
    assert.match(summary.reply, /Lấy sách/);
    assert.deepEqual(summary.changes, []);

    const empty = await chat('Hãy kiểm tra bài tập, task dự án và công việc cá nhân chưa hoàn thành của tôi. Liệt kê những mục có hạn trong 7 ngày tới, kèm ngày hạn.', 'b');
    assert.match(empty.reply, /không có bài tập, task dự án hoặc việc cá nhân/);
    assert.doesNotMatch(empty.reply, /Nộp sơ đồ ERD|Viết kết luận|Lấy sách/);
    assert.equal(modelCalls, 0);

    await chat('Đổi deadline bài tập sang một ngày trong 7 ngày tới.', 'a');
    assert.equal(modelCalls, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('assistant confines tool calls to account data and applies a proposal only once after confirmation', async () => {
  const taskA = { id: randomUUID(), title: 'Đọc giáo trình' };
  const taskB = { id: randomUUID(), title: 'Việc riêng của B' };
  const work = new Map([[userA, [taskA]], [userB, [taskB]]]);
  const auth = { authenticate: async (token) => {
    const session = sessions.get(token);
    if (!session) throw new ApplicationError('UNAUTHENTICATED', 'Cần đăng nhập.');
    return session;
  } };
  const services = { projects: {
    listPersonalTasks: async (userId) => work.get(userId),
    createPersonalTask: async (userId, input) => work.get(userId).push({ ...input, id: randomUUID() }),
    deletePersonalTask: async (userId, id) => work.set(userId, work.get(userId).filter((task) => task.id !== id)),
  } };
  const tools = createAssistantActions(services, {});
  const fakeModel = async (input) => {
    const results = new Map(input.filter((item) => item.type === 'function_call_output')
      .map((item) => [item.call_id, JSON.parse(item.output)]));
    if (!results.size) {
      if (input[0].content === 'Xóa công việc') {
        return [modelCall('propose_lifeos_change', { resource: 'tasks', operation: 'delete', id: taskA.id }, 'delete')];
      }
      return [
        modelCall('read_lifeos', { resource: 'tasks' }, 'read'),
        modelCall('read_lifeos', { resource: 'tasks', userId: userB }, 'forged-user'),
        modelCall('propose_lifeos_change', { resource: 'tasks', operation: 'delete', id: taskB.id }, 'foreign-task'),
        modelCall('propose_lifeos_change', { resource: 'profile', operation: 'update', data: { fullName: 'A', password: 'new' } }, 'password'),
        modelCall('run_shell', { command: 'git status' }, 'unavailable'),
        modelCall('describe_lifeos_change', { resource: 'tasks', operation: 'create' }, 'describe'),
        modelCall('propose_lifeos_change', { resource: 'tasks', operation: 'create', data: { title: 'Lấy sách ở thư viện' } }, 'create'),
      ];
    }
    if (results.has('create')) {
      assert.deepEqual(results.get('read').items, [taskA]);
      for (const name of ['forged-user', 'foreign-task', 'password', 'unavailable']) assert.ok(results.get(name).error, name);
      assert.ok(results.get('describe').fields.properties.title);
      assert.equal(results.get('create').status, 'awaiting_approval');
    }
    return [{ type: 'message', content: [{ type: 'output_text', text: 'Đã lưu công việc.' }] }];
  };
  const app = express().use(express.json()).use(createAssistantRouter(auth, tools, fakeModel)).use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const request = (path, token, method = 'GET', body) => fetch(origin + path, { method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const chat = (content, token) => request('/chat', token, 'POST', { messages: [{ role: 'user', content }] });
    assert.equal((await chat('Đọc dữ liệu', 'x')).status, 401);

    const response = await chat('Thêm công việc', 'a');
    assert.equal(response.status, 200);
    const { reply, changes } = await response.json();
    assert.match(reply, /chờ xác nhận/);
    assert.equal(changes.length, 1);
    const [{ id, details }] = changes;
    assert.equal(details.title, 'Lấy sách ở thư viện');
    assert.deepEqual(work.get(userA), [taskA]);
    assert.deepEqual(work.get(userB), [taskB]);
    assert.equal((await request(`/changes/${id}/apply`, 'b', 'POST')).status, 404);
    assert.equal((await request(`/changes/${id}/apply`, 'a-other-device', 'POST')).status, 404);
    assert.equal((await request(`/changes/${id}/apply`, 'a', 'POST', { details: { title: 'Payload thay thế' } })).status, 204);
    assert.equal((await request(`/changes/${id}/apply`, 'a', 'POST')).status, 404);
    assert.deepEqual(work.get(userA).map((task) => task.title), ['Đọc giáo trình', 'Lấy sách ở thư viện']);

    const deletion = await chat('Xóa công việc', 'a');
    assert.equal(deletion.status, 200);
    const deleteDraft = (await deletion.json()).changes[0];
    assert.equal(deleteDraft.target, taskA.title);
    assert.equal((await request(`/changes/${deleteDraft.id}`, 'a', 'DELETE')).status, 204);
    assert.equal((await request(`/changes/${deleteDraft.id}/apply`, 'a', 'POST')).status, 404);
    assert.deepEqual(work.get(userA).map((task) => task.title), ['Đọc giáo trình', 'Lấy sách ở thư viện']);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('grade extraction checks course ownership and previews the source without writing', async () => {
  const courseId = randomUUID();
  let sent = 0;
  const auth = { authenticate: async (token) => sessions.get(token) };
  const tools = createAssistantActions({ study: {
    list: async (userId) => userId === userA ? [{ id: courseId, name: 'Mạng máy tính' }] : [],
  } }, {});
  const fakeModel = async (input, _instructions, enabledTools) => {
    sent++;
    assert.deepEqual(enabledTools, []);
    assert.equal(input[0].content[1].type, 'input_file');
    assert.match(input[0].content[1].file_data, /^data:application\/pdf;base64,/);
    return [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({
      components: [{ name: 'Cuối kỳ', weight: 60, page: 2, excerpt: 'Thi cuối kỳ 60%' }], note: 'Slide mới ghi một phần.',
    }) }] }];
  };
  const app = express().use(createAssistantRouter(auth, tools, fakeModel)).use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const url = `http://127.0.0.1:${server.address().port}/grade-extraction?filename=syllabus.pdf&courseId=${courseId}`;
    const request = (token, body) => fetch(url, { method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' }, body });
    assert.equal((await request('b', '%PDF-1.7')).status, 404);
    assert.equal((await request('a', 'not a PDF')).status, 400);
    assert.equal(sent, 0);
    const preview = await request('a', '%PDF-1.7');
    assert.equal(preview.status, 200);
    assert.equal((await preview.json()).components[0].page, 2);
    assert.equal(sent, 1);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('Gemini uses the selected credential and preserves model parts when returning tool output', async (t) => {
  const connection = { provider: 'gemini', model: 'gemini-test', apiKey: 'private-gemini-test-key' };
  const callPart = { functionCall: { name: 'read_lifeos', args: { resource: 'courses' }, id: 'call-course' }, thoughtSignature: 'fixture' };
  const mock = t.mock.method(globalThis, 'fetch', async (url, request) => {
    assert.match(url, /models\/gemini-test:generateContent$/);
    assert.equal(request.headers.get('x-goog-api-key'), connection.apiKey);
    const data = JSON.parse(request.body);
    if (data.contents.length === 1) return Response.json({ candidates: [{ content: { parts: [callPart] } }] });
    assert.deepEqual(data.contents[1].parts, [callPart]);
    assert.equal(data.contents[2].parts[0].functionResponse.id, 'call-course');
    return Response.json({ candidates: [{ content: { parts: [{ text: 'Đã đọc môn học.' }] } }] });
  });
  const input = [{ role: 'user', content: 'Mình đang học môn nào?' }];
  const signal = AbortSignal.timeout(2000);
  const first = await sendModel(connection, input, 'LifeOS', [], signal);
  assert.equal(first.find((part) => part.type === 'function_call').call_id, 'call-course');
  const reply = await sendModel(connection, [...input, ...first,
    { type: 'function_call_output', call_id: 'call-course', providerId: 'call-course', output: '{"items":[]}' }], 'LifeOS', [], signal);
  assert.match(reply.find((part) => part.type === 'message').content[0].text, /Đã đọc/);
  assert.equal(mock.mock.calls.length, 2);
});

const groqConnection = { provider: 'groq', model: 'qwen/qwen3.8-27b', apiKey: 'fixture-groq-key' };

test('GroqCloud sends local tools and replays each result with the original call ID', async (t) => {
  const call = { id: 'call-1', type: 'function', function: { name: 'read_lifeos', arguments: '{"resource":"courses"}' } };
  const definition = { type: 'function', name: 'read_lifeos', description: 'Đọc dữ liệu',
    parameters: { type: 'object', properties: { resource: { type: 'string' } } } };
  const user = { role: 'user', content: 'Mình đang học môn nào?' };
  const mock = t.mock.method(globalThis, 'fetch', async (url, request) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(request.headers.get('authorization'), `Bearer ${groqConnection.apiKey}`);
    const data = JSON.parse(request.body);
    assert.equal(data.model, groqConnection.model);
    assert.equal(data.reasoning_format, 'hidden');
    assert.deepEqual(data.tools, [{ type: 'function', function: {
      name: definition.name, description: definition.description, parameters: definition.parameters,
    } }]);
    assert.deepEqual(data.messages.slice(0, 2), [{ role: 'system', content: 'LifeOS' }, user]);
    if (data.messages.length === 2) {
      return Response.json({ choices: [{ message: { content: null, reasoning: 'internal', tool_calls: [call] } }] });
    }
    assert.deepEqual(data.messages.slice(2), [
      { role: 'assistant', content: null, tool_calls: [call] },
      { role: 'tool', tool_call_id: call.id, content: '{"items":[]}' },
    ]);
    return Response.json({ choices: [{ message: { content: 'Bạn chưa có môn học.' } }] });
  });
  const signal = AbortSignal.timeout(2000);
  const first = await sendModel(groqConnection, [user], 'LifeOS', [definition], signal);
  assert.deepEqual(first.find((item) => item.type === 'function_call'), {
    type: 'function_call', call_id: call.id, name: call.function.name, arguments: call.function.arguments,
  });
  const result = { type: 'function_call_output', call_id: call.id, output: '{"items":[]}' };
  const final = await sendModel(groqConnection, [user, ...first, result], 'LifeOS', [definition], signal);
  assert.equal(modelText(final), 'Bạn chưa có môn học.');
  assert.equal(mock.mock.calls.length, 2);
});

test('GroqCloud encodes a slide as an image and rejects PDF before calling the API', async (t) => {
  const format = { name: 'grade_components', schema: { type: 'object', additionalProperties: false } };
  const mock = t.mock.method(globalThis, 'fetch', async (_url, request) => {
    const data = JSON.parse(request.body);
    assert.deepEqual(data.messages[1], { role: 'user', content: [
      { type: 'text', text: 'Đọc slide' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,YQ==' } },
    ] });
    assert.deepEqual(data.response_format, { type: 'json_schema', json_schema: { ...format, strict: true } });
    assert.ok(!data.tools);
    return Response.json({ choices: [{ message: { content: '{"components":[],"note":""}' } }] });
  });
  const signal = AbortSignal.timeout(2000);
  const image = messageWithFile('Đọc slide', { name: 'slide.png', mimeType: 'image/png', data: 'YQ==' });
  assert.deepEqual(JSON.parse(modelText(await sendModel(groqConnection, [image], 'LifeOS', [], signal, format))), {
    components: [], note: '',
  });
  const pdf = messageWithFile('Đọc slide', { name: 'slide.pdf', mimeType: 'application/pdf', data: 'YQ==' });
  await assert.rejects(sendModel(groqConnection, [pdf], 'LifeOS', [], signal, format), {
    code: 'ASSISTANT_GROQ_PDF_UNSUPPORTED',
  });
  assert.equal(mock.mock.calls.length, 1);
});

test('GroqCloud reports its retry interval when the free plan limit is reached', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 429, headers: { 'Retry-After': '7' } }));
  await assert.rejects(sendModel(groqConnection, [], 'LifeOS', [], AbortSignal.timeout(2000)), {
    code: 'ASSISTANT_PROVIDER_RATE_LIMIT', message: /GroqCloud.*7 giây/,
  });
});

test('assistant retries the same Groq image request once after a short rate limit', async () => {
  const auth = { authenticate: async (token) => sessions.get(token) };
  const tools = createAssistantActions({}, {});
  const calls = new Map();
  const fakeModel = async (input) => {
    const text = input[0].content[0].text;
    const previous = calls.get(text);
    if (!previous) calls.set(text, { count: 1, input });
    else {
      assert.equal(input, previous.input);
      previous.count += 1;
    }
    if (!previous || text === 'Vẫn giới hạn') {
      const seconds = text === 'Chờ lâu' ? '60' : '1';
      throw new GroqRateLimitError(new Response(null, { status: 429, headers: { 'Retry-After': seconds } }));
    }
    return [{ type: 'message', content: [{ type: 'output_text', text: 'Đã đọc ảnh.' }] }];
  };
  const app = express().use(createAssistantRouter(auth, tools, fakeModel)).use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const chat = (content) => fetch(`http://127.0.0.1:${server.address().port}/chat`, {
      method: 'POST', headers: { Authorization: 'Bearer a', 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content }],
        file: { name: 'lich.jpg', mimeType: 'image/jpeg', data: '/9j/' } }),
    });
    const success = await chat('Đọc ảnh lịch học');
    assert.equal(success.status, 200);
    assert.equal((await success.json()).reply, 'Đã đọc ảnh.');
    assert.equal(calls.get('Đọc ảnh lịch học').count, 2);
    const limited = await chat('Vẫn giới hạn');
    assert.equal(limited.status, 503);
    assert.equal(calls.get('Vẫn giới hạn').count, 2);
    const longWait = await chat('Chờ lâu');
    assert.equal(longWait.status, 503);
    assert.match((await longWait.json()).error.message, /60 giây/);
    assert.equal(calls.get('Chờ lâu').count, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('OpenAI distinguishes exhausted credits from temporary request limits', async (t) => {
  const responses = [
    Response.json({ error: { code: 'credit_balance_exhausted', type: 'insufficient_quota' } }, { status: 429 }),
    Response.json({ error: { code: 'rate_limit_exceeded', type: 'rate_limit_error' } }, { status: 429, headers: { 'Retry-After': '3' } }),
  ];
  t.mock.method(globalThis, 'fetch', async () => responses.shift());
  const connection = { provider: 'openai', model: 'gpt-5-mini', apiKey: 'fixture-key' };
  const send = () => sendModel(connection, [{ role: 'user', content: 'OK' }], 'LifeOS', [], AbortSignal.timeout(2000));
  await assert.rejects(send, { code: 'ASSISTANT_PROVIDER_QUOTA', message: /hết credit/ });
  await assert.rejects(send, { code: 'ASSISTANT_PROVIDER_RATE_LIMIT', message: /3 giây/ });
});

test('assistant reports blocked network access separately from provider errors', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('fetch failed', { cause: { code: 'EACCES' } });
  });
  const connection = { provider: 'openai', model: 'gpt-5-mini', apiKey: 'fixture-key' };
  await assert.rejects(sendModel(connection, [], 'LifeOS', [], AbortSignal.timeout(2000)),
    { code: 'ASSISTANT_PROVIDER_CONNECTION', message: /chặn truy cập mạng tới OpenAI/ });
});

test('Gemini reports project free-tier ineligibility separately from key errors', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    error: { code: 403, status: 'PERMISSION_DENIED', message: 'The Gemini API free tier is not available for this project.' },
  }, { status: 403 }));
  const connection = { provider: 'gemini', model: 'gemini-3.8-flash', apiKey: 'fixture-key' };
  await assert.rejects(sendModel(connection, [], 'LifeOS', [], AbortSignal.timeout(2000)), {
    code: 'ASSISTANT_PROVIDER_GEMINI_FREE_TIER_UNAVAILABLE', message: /quyền dùng Gemini API miễn phí/,
  });
});

test('assistant only previews task blocks in the user’s availability and rechecks on apply', async () => {
  const taskId = randomUUID();
  let availability = [{ weekday: 1, start: '10:00', end: '11:00' }];
  let saved = 0;
  let previews = 0;
  const actions = createAssistantActions({
    projects: { listPersonalTasks: async () => [{ id: taskId, title: 'Ôn tập' }], list: async () => [] },
    planning: { get: async () => ({ availability }) },
  }, {
    preview: async () => { previews++; },
    create: async () => { saved++; },
  });
  const propose = (start, end) => actions.prepare(userA, {
    operation: 'create', resource: 'task-blocks', data: { blocks: [{ taskId, date: '2026-11-23', start, end }] },
  });
  await assert.rejects(propose(540, 570), { code: 'ASSISTANT_OUTSIDE_AVAILABILITY' });
  const draft = await propose(600, 630);
  assert.equal(previews, 1);
  assert.equal(saved, 0);
  availability = [];
  await assert.rejects(draft.apply(), { code: 'ASSISTANT_OUTSIDE_AVAILABILITY' });
  assert.equal(saved, 0);
  availability = [{ weekday: 1, start: '10:00', end: '11:00' }];
  await draft.apply();
  assert.equal(previews, 2);
  assert.equal(saved, 1);
});

test('assistant uses the open course for a new note when the model omits the course id', async () => {
  const courseId = randomUUID();
  const created = [];
  const actions = createAssistantActions({
    study: {
      list: async () => [{ id: courseId, name: 'Mạng máy tính' }],
      create: async (userId, resource, data) => { created.push({ userId, resource, data }); },
    },
  }, {});
  const context = await actions.context(userA, { kind: 'course', id: courseId });
  const base = { operation: 'create', resource: 'notes', data: { title: 'Đọc chương 2', date: '2026-11-21' } };
  const draft = await actions.prepare(userA, base, context);
  assert.equal(draft.details.courseId, 'Mạng máy tính');
  assert.equal(created.length, 0);
  await draft.apply();
  assert.equal(created[0].data.courseId, courseId);
  const general = await actions.prepare(userA, { ...base, data: { ...base.data, courseId: null } }, context);
  await general.apply();
  assert.equal(created[1].data.courseId, null);
});
