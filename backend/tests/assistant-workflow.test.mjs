import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createAssistantActions } from '../src/assistant/actions.ts';
import { preparePlan, executePlan } from '../src/assistant/plans.ts';
import { createWorkspaceTools } from '../src/assistant/workspace-tools.ts';
import { calculateCourseScore, calculateGpa, calculateGradeTarget, subtractBusy } from '../src/application/assistant-math.ts';
import { messageWithFile } from '../src/assistant/provider.ts';
import { toolsForConversation, toolsInGroup } from '../src/assistant/instructions.ts';

test('text attachments preserve UTF-8 and tools can be discovered after initial routing', () => {
  const message = messageWithFile('Tóm tắt', { name: 'note.md', mimeType: 'text/markdown', data: Buffer.from('Đọc chương 2').toString('base64') });
  assert.match(message.content, /Đọc chương 2/);
  const names = ['read_lifeos', 'calculate_lifeos_grades', 'find_free_slots', 'discover_lifeos_tools'];
  const tools = names.map((name) => ({ name }));
  assert.deepEqual(toolsForConversation(tools, 'Tính điểm cuối kỳ').map((tool) => tool.name), ['read_lifeos', 'calculate_lifeos_grades', 'discover_lifeos_tools']);
  assert.deepEqual(toolsInGroup(tools, 'planning').map((tool) => tool.name), ['find_free_slots']);
});

test('plans validate references, wait for approval and use actual IDs returned by earlier steps', async () => {
  const userId = randomUUID();
  const projects = [];
  const tasks = [];
  const actions = createAssistantActions({ projects: {
    list: async () => projects, get: async (_user, id) => projects.find((item) => item.id === id),
    create: async (_user, input) => { const item = { ...input, id: randomUUID() }; projects.push(item); return item; },
    createTask: async (_user, projectId, input) => { const item = { ...input, projectId, id: randomUUID() }; tasks.push(item); return item; },
  } }, {});
  const prepared = await preparePlan(actions, userId, { title: 'Website và task', steps: [
    { key: 'project', change: { resource: 'projects', operation: 'create', data: { title: 'Website' } } },
    { key: 'design', change: { resource: 'project-tasks', operation: 'create', projectId: '$project.id', data: { title: 'Thiết kế' } } },
    { key: 'build', change: { resource: 'project-tasks', operation: 'create', projectId: '$project.id', data: { title: 'Lập trình', dependencies: ['$design.id'] } } },
  ] });
  assert.equal(projects.length, 0);
  assert.equal(tasks.length, 0);
  const result = await executePlan(actions, userId, prepared.command);
  assert.equal(result.status, 'applied');
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].projectId, projects[0].id);
  assert.deepEqual(tasks[1].dependencies, [tasks[0].id]);
  assert.equal(prepared.preview.steps[1].dependsOn[0], 'project');
  await assert.rejects(preparePlan(actions, userId, { title: 'Sai', steps: [
    { key: 'task', change: { resource: 'project-tasks', operation: 'create', projectId: '$later.id', data: { title: 'Sai' } } },
  ] }), /bước trước/);
  await assert.rejects(preparePlan(actions, userId, { title: 'Sai', steps: [
    { key: 'a', change: { resource: 'projects', operation: 'create', data: { title: 'A' } } },
    { key: 'a', change: { resource: 'projects', operation: 'create', data: { title: 'B' } } },
  ] }), /khác nhau/);
});

test('a stale preview cannot overwrite a newer edit and unknown fields are rejected', async () => {
  const item = { id: randomUUID(), title: 'Ban đầu', updatedAt: '1' };
  let writes = 0;
  const actions = createAssistantActions({ projects: { listPersonalTasks: async () => [item],
    updatePersonalTask: async () => { writes++; } } }, {});
  const draft = await actions.prepare('user', { resource: 'tasks', operation: 'update', id: item.id, data: { title: 'Đề xuất' } });
  assert.deepEqual(draft.before, { title: 'Ban đầu' });
  item.title = 'Sửa trên giao diện';
  item.updatedAt = '2';
  await assert.rejects(draft.apply(), { code: 'ASSISTANT_STALE_DRAFT' });
  assert.equal(writes, 0);
  assert.throws(() => actions.validate({ resource: 'tasks', operation: 'create', data: { title: 'X', password: 'bad' } }), /không được hỗ trợ/);
});

test('academic reads respect semester and computed grades cannot be written as direct fields', async () => {
  const a = { id: randomUUID(), name: 'HCI', semester: 'HK1-2026' };
  const b = { id: randomUUID(), name: 'AI', semester: 'HK2-2026' };
  const assignments = [{ id: randomUUID(), title: 'Bài HCI', courseId: a.id }, { id: randomUUID(), title: 'Bài AI', courseId: b.id }];
  const actions = createAssistantActions({ study: { list: async (_user, resource) => resource === 'courses' ? [a, b] : assignments } }, {});
  const courses = await actions.read('user', { resource: 'courses', semester: 'HK1-2026' });
  assert.deepEqual(courses.items.map((item) => item.id), [a.id]);
  const result = await actions.read('user', { resource: 'assignments', semester: 'HK2-2026' });
  assert.deepEqual(result.items.map((item) => item.id), [assignments[1].id]);
  await assert.rejects(actions.prepare('user', { resource: 'courses', operation: 'update', id: a.id, data: { score10: 9 } }), /gradeComponents/);
});

test('search handles Vietnamese accents, content, pagination and project scoping', async () => {
  const projectId = randomUUID();
  const rows = Array.from({ length: 31 }, (_, index) => ({ id: randomUUID(), title: `Đồ án ${index}`, status: 'todo', priority: 'High', projectId }));
  const tools = createWorkspaceTools(async (resource) => resource === 'project-tasks' ? rows : resource === 'notes' ? [{ id: randomUUID(), title: 'Ghi chú', content: 'Thuật toán đồ án' }] : []);
  const first = await tools.execute('search_lifeos', { query: 'do an' });
  assert.equal(first.total, 32);
  assert.equal(first.items.length, 25);
  assert.equal(first.nextOffset, 25);
  const second = await tools.execute('search_lifeos', { query: 'do an', offset: 25 });
  assert.equal(second.items.length, 7);
  assert.equal(second.nextOffset, null);
  const scoped = await tools.execute('search_lifeos', { query: 'do an', projectId });
  assert.equal(scoped.total, 31);
  assert.ok(scoped.items.every((item) => item.resource === 'project-tasks'));
  assert.match(scoped.items[0].source.href, /^\/projects\?project=/);
});

function calendarFixture() {
  const taskId = randomUUID();
  const courseId = randomUUID();
  const data = {
    courses: [{ id: courseId, name: 'HCI', status: 'Active' }],
    'course-sessions': [{ id: randomUUID(), courseId, weekday: 1, startTime: '09:00', endTime: '10:30' }],
    tasks: [{ id: randomUUID(), title: 'Ca làm', category: 'employment', fixedSlot: { date: '2030-11-18', start: 720, end: 780 } }],
    schedule: [{ id: randomUUID(), title: 'Họp', date: '2030-11-25', time: '14:00 - 15:00' }],
    'task-blocks': [{ id: randomUUID(), taskId, date: '2030-11-25', start: 960, end: 1020 }],
    assignments: [{ id: taskId, title: 'Bài HCI', status: 'Not Started', deadline: '2030-11-25', courseId }],
    'project-tasks': [], availability: [{ weekday: 1, start: '07:00', end: '22:00' }],
  };
  return { taskId, courseId, data, tools: createWorkspaceTools(async (resource) => data[resource] ?? []) };
}

test('agenda expands recurring work and free slots subtract classes, events and saved sessions', async () => {
  const { tools } = calendarFixture();
  const range = { from: '2030-11-25', to: '2030-11-25', timeZone: 'Asia/Ho_Chi_Minh' };
  const agenda = await tools.execute('get_lifeos_agenda', range);
  assert.equal(agenda.busy.length, 4);
  assert.equal(agenda.deadlines.length, 1);
  const { slots } = await tools.execute('find_free_slots', { ...range, durationMinutes: 30 });
  assert.deepEqual(slots.map(({ start, end }) => [start, end]), [[420, 540], [630, 720], [780, 840], [900, 960], [1020, 1320]]);
  await assert.rejects(tools.execute('find_free_slots', { ...range, timeZone: 'Unknown/Zone' }), /Múi giờ/);
  await assert.rejects(tools.execute('get_lifeos_agenda', { ...range, to: '2031-11-25' }));
});

test('schedule previews support assignments, enforce daily budget and report missing capacity', async () => {
  const { tools, taskId } = calendarFixture();
  const plan = await tools.execute('preview_lifeos_schedule', { from: '2030-11-25', to: '2030-11-25',
    items: [{ resource: 'assignments', id: taskId, minutes: 300 }] });
  const blocks = plan.suggestedChange.data.blocks;
  assert.ok(blocks.every((block) => block.workKind === 'assignment' && block.taskId === taskId));
  // Existing session consumes 60 minutes from the daily 180-minute budget.
  assert.equal(blocks.reduce((sum, block) => sum + block.end - block.start, 0), 120);
  assert.equal(plan.unscheduled[0].remainingMinutes, 180);
});

test('grade calculations use weighted scores, credit weighted GPA and reject missing inputs', () => {
  const rows = [{ name: 'Giữa kỳ', score10: 8, weight: 40 }, { name: 'Cuối kỳ', score10: null, weight: 60 }];
  assert.equal(calculateCourseScore(rows), null);
  assert.equal(calculateGradeTarget(rows, 8).minimum, 8);
  assert.equal(calculateCourseScore([{ ...rows[0] }, { ...rows[1], score10: 9 }]), 8.6);
  assert.equal(calculateGpa([{ score10: 8.5, credits: 3 }, { score10: 7, credits: 1 }]).value, 3.75);
  assert.throws(() => calculateGradeTarget([{ ...rows[0], score10: null }, rows[1]], 8), /Cần có điểm/);
  assert.equal(calculateGradeTarget([{ name: 'Giữa kỳ', score10: 0, weight: 90 }, { name: 'Cuối kỳ', score10: null, weight: 10 }], 8).achievable, false);
  assert.deepEqual(subtractBusy(420, 900, [[500, 600], [550, 650], [800, 1000]]), [[420, 500], [650, 800]]);
});
