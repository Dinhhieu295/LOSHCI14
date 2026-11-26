// Uses a disposable account in the configured PostgreSQL database. No AI API calls.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import { createServices } from '../src/application/services/index.ts';
import { KyselyLifeOsRepository } from '../src/infrastructure/repositories/kysely-lifeos-repository.ts';
import { TaskCalendarRepository } from '../src/infrastructure/repositories/task-calendar-repository.ts';
import { createAssistantActions } from '../src/assistant/actions.ts';
import { createAssistantRouter } from '../src/assistant/router.ts';
import { AssistantStore } from '../src/assistant/store.ts';
import { db, closeDatabase } from '../src/database/index.ts';
import { errorHandler } from '../src/middleware/error-handler.ts';

test('PostgreSQL assistant workflow: persistent previews, atomic plans, stale data, idempotency and assignment calendar', async () => {
  const services = createServices(new KyselyLifeOsRepository());
  const calendar = new TaskCalendarRepository();
  const actions = createAssistantActions(services, calendar);
  const store = new AssistantStore(undefined);
  const account = await services.auth.register({ email: `assistant-integration-${randomUUID()}@example.test`, password: 'Integration-123!', fullName: 'Assistant integration' });
  const session = await services.auth.authenticate(account.token);
  const course = await services.study.create(account.user.id, 'courses', { name: 'HCI', code: '', instructor: '', credits: 3, semester: '',
    progress: 0, score10: null, grade: 'N/A', attendance: 0, absences: null, studyHours: 0, aimStudyHours: 0, color: '', status: 'Active' });
  let instruction;
  const fakeModel = async (input) => {
    if (input.some((item) => item.type === 'function_call_output')) return [{ type: 'message', content: [{ type: 'output_text', text: 'Hãy duyệt bản xem trước.' }] }];
    return [{ type: 'function_call', name: instruction.tool, arguments: JSON.stringify(instruction.args), call_id: 'fixture-call' }];
  };
  let server;
  const start = async () => {
    const app = express().use(createAssistantRouter(services.auth, actions, fakeModel, store)).use(errorHandler);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return `http://127.0.0.1:${server.address().port}`;
  };
  let origin = await start();
  const request = (path, method = 'GET', body, token = account.token) => fetch(origin + path, { method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const propose = async (tool, args) => {
    instruction = { tool, args };
    const response = await request('/chat', 'POST', { messages: [{ role: 'user', content: 'Thực hiện yêu cầu kiểm thử' }] });
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    return (await response.json()).changes[0];
  };
  try {
    const plan = await propose('propose_lifeos_plan', { title: 'Dự án và hai task', steps: [
      { key: 'project', change: { resource: 'projects', operation: 'create', data: { title: 'Dự án AI' } } },
      { key: 'a', change: { resource: 'project-tasks', operation: 'create', projectId: '$project.id', data: { title: 'Thiết kế' } } },
      { key: 'b', change: { resource: 'project-tasks', operation: 'create', projectId: '$project.id', data: { title: 'Lập trình', dependencies: ['$a.id'] } } },
    ] });
    assert.equal((await services.projects.list(account.user.id)).length, 0);
    await new Promise((resolve) => server.close(resolve));
    origin = await start(); // Proposals survive router/process state loss.
    const historyBefore = await (await request('/history')).json();
    assert.ok(historyBefore.changes.some((item) => item.id === plan.id));
    const otherSession = await services.auth.login(account.user.email, 'Integration-123!');
    assert.equal((await request(`/changes/${plan.id}/apply`, 'POST', undefined, otherSession.token)).status, 404);
    const first = await request(`/changes/${plan.id}/apply`, 'POST');
    assert.equal(first.status, 200, JSON.stringify(await first.clone().json()));
    const result = await first.json();
    const projectId = result.steps[0].value.id;
    const tasks = await services.projects.listTasks(account.user.id, projectId);
    assert.equal(tasks.length, 2);
    assert.deepEqual(tasks.find((item) => item.title === 'Lập trình').dependencies, [tasks.find((item) => item.title === 'Thiết kế').id]);
    assert.equal((await request(`/changes/${plan.id}/apply`, 'POST')).status, 200);
    assert.equal((await services.projects.list(account.user.id)).length, 1);
    const historyAfter = await (await request('/history')).json();
    assert.ok(historyAfter.messages.some((message) => message.execution?.steps[0].value.id === projectId));

    const broken = await propose('propose_lifeos_plan', { title: 'Phải hoàn tác', steps: [
      { key: 'project', change: { resource: 'projects', operation: 'create', data: { title: 'Không được tồn tại' } } },
      { key: 'task', change: { resource: 'project-tasks', operation: 'create', projectId: '$project.id', data: { title: 'Phụ thuộc sai', dependencies: [randomUUID()] } } },
    ] });
    assert.equal((await request(`/changes/${broken.id}/apply`, 'POST')).status, 400);
    assert.equal((await services.projects.list(account.user.id)).length, 1);
    assert.ok((await store.drafts(account.user.id, session.sessionId, 'global')).some((item) => item.id === broken.id));

    const stale = await propose('propose_lifeos_change', { resource: 'projects', operation: 'update', id: projectId, data: { title: 'Đề xuất cũ' } });
    await services.projects.update(account.user.id, projectId, { title: 'Sửa mới từ giao diện' });
    assert.equal((await request(`/changes/${stale.id}/apply`, 'POST')).status, 409);
    assert.equal((await services.projects.get(account.user.id, projectId)).title, 'Sửa mới từ giao diện');
    await request(`/changes/${stale.id}`, 'DELETE');
    assert.ok((await store.history(account.user.id, 'global')).some((message) => message.execution?.status === 'cancelled'));

    const filePreview = await actions.prepare(account.user.id, { resource: 'files', operation: 'create', data: { workspaceKind: 'project', workspaceId: projectId } },
      undefined, { name: 'notes.txt', mimeType: 'text/plain', data: Buffer.from('Nội dung khảo sát').toString('base64') });
    assert.ok(!JSON.stringify(filePreview.details).includes('contentsBase64'));
    const fileCommand = { kind: 'change', change: filePreview.command };
    const fileDraftId = randomUUID();
    await store.saveDraft(fileDraftId, account.user.id, session.sessionId, 'global', fileCommand, filePreview.details);
    const fileApplied = await request(`/changes/${fileDraftId}/apply`, 'POST');
    assert.equal(fileApplied.status, 200);
    const fileId = (await fileApplied.json()).steps[0].value.id;
    const content = await actions.executeRead(account.user.id, 'read_lifeos_file', { workspaceKind: 'project', workspaceId: projectId, fileId });
    assert.equal(content.content, 'Nội dung khảo sát');
    const firstPage = await actions.executeRead(account.user.id, 'read_lifeos_file', { workspaceKind: 'project', workspaceId: projectId, fileId, limit: 3 });
    assert.equal(firstPage.content, 'Nội');
    assert.equal(firstPage.nextOffset, 3);
    const nextPage = await actions.executeRead(account.user.id, 'read_lifeos_file', { workspaceKind: 'project', workspaceId: projectId, fileId, offset: 3 });
    assert.equal(firstPage.content + nextPage.content, 'Nội dung khảo sát');

    const startTimer = await propose('propose_lifeos_change', { resource: 'timer-start', operation: 'create',
      data: { workspaceKind: 'project', workspaceId: projectId, taskId: tasks[0].id } });
    const started = await request(`/changes/${startTimer.id}/apply`, 'POST');
    assert.equal(started.status, 200);
    const timerId = (await started.json()).steps[0].value.id;
    const timer = await actions.executeRead(account.user.id, 'get_lifeos_timer', { workspaceKind: 'project', workspaceId: projectId });
    assert.equal(timer.active.id, timerId);
    const stopTimer = await propose('propose_lifeos_change', { resource: 'timer-stop', operation: 'create',
      data: { workspaceKind: 'project', workspaceId: projectId, sessionId: timerId } });
    assert.equal((await request(`/changes/${stopTimer.id}/apply`, 'POST')).status, 200);
    assert.equal((await actions.executeRead(account.user.id, 'get_lifeos_timer', { workspaceKind: 'project', workspaceId: projectId })).active, null);

    const assignmentDraft = await propose('propose_lifeos_plan', { title: 'Bài tập và phiên học', steps: [
      { key: 'assignment', change: { resource: 'assignments', operation: 'create', data: { title: 'Bài HCI', courseId: course.id, deadline: '2030-11-30', estimatedTime: '1h' } } },
      { key: 'slot', change: { resource: 'task-blocks', operation: 'create', data: { blocks: [{ taskId: '$assignment.id', workKind: 'assignment', date: '2030-11-25', start: 600, end: 660 }] } } },
    ] });
    const assignmentResponse = await request(`/changes/${assignmentDraft.id}/apply`, 'POST');
    assert.equal(assignmentResponse.status, 200, JSON.stringify(await assignmentResponse.clone().json()));
    const assignments = await services.study.list(account.user.id, 'assignments');
    const blocks = await calendar.list(account.user.id);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].workKind, 'assignment');
    assert.equal(blocks[0].taskId, assignments[0].id);
    await calendar.move(account.user.id, blocks[0].id, { date: '2030-11-25', start: 660, end: 720 });
    await assert.rejects(calendar.create(account.user.id, [{ taskId: assignments[0].id, workKind: 'assignment', date: '2030-11-25', start: 690, end: 750 }]), /trùng/);
    await services.study.delete(account.user.id, 'assignments', assignments[0].id);
    assert.equal((await calendar.list(account.user.id)).length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await db.deleteFrom('users').where('id', '=', account.user.id).where('email', '=', account.user.email).execute();
    await closeDatabase();
  }
});
