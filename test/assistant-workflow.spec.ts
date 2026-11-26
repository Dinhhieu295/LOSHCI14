import { expect, test } from '@playwright/test';

const web = process.env.LIFEOS_WEB_URL ?? 'http://127.0.0.1:5173';
const api = process.env.LIFEOS_API_URL ?? 'http://127.0.0.1:4000';
test.beforeEach(async ({ page }) => {
  await page.route('**/api/assistant/**', async (route) => {
    const path = new URL(route.request().url());
    const response = await route.fetch({ url: `http://127.0.0.1:4002${path.pathname}${path.search}` });
    await route.fulfill({ response });
  });
  await page.goto(web);
  await page.getByRole('button', { name: 'Đăng ký ngay' }).click();
  await page.getByLabel('Họ và tên').fill('Workflow QA');
  await page.getByLabel('Email', { exact: true }).fill(`workflow-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`);
  await page.locator('input[autocomplete="new-password"]').first().fill('LifeOS-Workflow-123!');
  await page.locator('input[autocomplete="new-password"]').nth(1).fill('LifeOS-Workflow-123!');
  await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dự án', exact: true })).toBeVisible();
});

test('AI plan persists across reload, applies once, and refreshes project/task UI', async ({ page }) => {
  const name = `AI E2E ${Date.now()}`;
  await page.getByRole('button', { name: 'Dự án', exact: true }).click();
  await page.getByRole('button', { name: 'Mở trợ lý LifeOS' }).click();
  await page.getByLabel('Yêu cầu của bạn').fill(`Tạo dự án ${name} và thêm task Thiết kế`);
  await page.getByRole('button', { name: 'Gửi yêu cầu' }).click();
  const draft = page.getByRole('region', { name: 'Đề xuất thay đổi' });
  await expect(draft).toContainText('Thiết kế');
  const token = await page.evaluate(() => localStorage.getItem('lifeos_token'));
  const headers = { Authorization: `Bearer ${token}` };
  expect(await (await page.request.get(api + '/api/projects', { headers })).json()).toEqual([]);
  await page.reload();
  await page.getByRole('button', { name: 'Mở trợ lý LifeOS' }).click();
  await expect(draft).toContainText(name);
  await draft.getByRole('button', { name: 'Áp dụng kế hoạch' }).click();
  await expect(draft).toHaveCount(0);
  await expect(page.getByRole('log')).toContainText('Đã thực hiện');
  await page.getByRole('button', { name: 'Đóng trợ lý' }).click();
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page.locator('.project-task')).toContainText('Thiết kế');
  await page.getByRole('button', { name: 'Mở trợ lý LifeOS' }).click();
  await page.getByLabel('Yêu cầu của bạn').fill('Tôi có bao nhiêu việc?');
  await page.getByRole('button', { name: 'Gửi yêu cầu' }).click();
  await expect(page.getByRole('log')).toContainText('Đã đọc dữ liệu LifeOS.');
  const projects = await (await page.request.get(api + '/api/projects', { headers })).json();
  expect(projects).toHaveLength(1);
});

test('a stale change keeps its preview and cannot overwrite newer UI data', async ({ page }) => {
  const token = await page.evaluate(() => localStorage.getItem('lifeos_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const created = await page.request.post(api + '/api/projects', { headers, data: { title: 'Dự án stale QA' } });
  const project = await created.json();
  await page.goto(web + '/projects');
  await page.getByRole('button', { name: 'Mở trợ lý LifeOS' }).click();
  await page.getByLabel('Yêu cầu của bạn').fill('Đổi tên dự án Dự án stale QA');
  await page.getByRole('button', { name: 'Gửi yêu cầu' }).click();
  const draft = page.getByRole('region', { name: 'Đề xuất thay đổi' });
  await expect(draft.locator('del')).toHaveText('Dự án stale QA');
  await page.request.patch(`${api}/api/projects/${project.id}`, { headers, data: { title: 'Tên mới do người dùng sửa' } });
  await draft.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Dữ liệu đã thay đổi');
  await expect(draft).toBeVisible();
  expect((await (await page.request.get(`${api}/api/projects/${project.id}`, { headers })).json()).title).toBe('Tên mới do người dùng sửa');
  await draft.getByRole('button', { name: 'Bỏ qua' }).click();
  await expect(draft).toHaveCount(0);
});

test('assignments can be booked from the calendar queue and open the correct course', async ({ page }) => {
  const token = await page.evaluate(() => localStorage.getItem('lifeos_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const course = await (await page.request.post(api + '/api/study/courses', { headers, data: { name: 'HCI lịch AI' } })).json();
  const assignment = await (await page.request.post(api + '/api/study/assignments', { headers,
    data: { title: 'Bài tập lịch AI', courseId: course.id, deadline: '2030-11-30', estimatedTime: '1h' } })).json();
  await page.goto(web + '/calendar?week=2030-11-25');
  await page.getByRole('button', { name: 'Xếp giờ cho Bài tập lịch AI' }).click();
  const editor = page.getByRole('dialog', { name: 'Bài tập lịch AI' });
  await editor.getByLabel('Ngày làm việc').fill('2030-11-25');
  await editor.getByLabel('Giờ bắt đầu').fill('09:00');
  await editor.getByRole('button', { name: 'Lưu phiên' }).click();
  await expect(editor).toHaveCount(0);
  const block = page.locator('.calendar-entry[data-kind="task"]').filter({ hasText: 'Bài tập lịch AI' });
  await expect(block).toBeVisible();
  const saved = await (await page.request.get(api + '/api/calendar/task-blocks', { headers })).json();
  expect(saved[0]).toMatchObject({ taskId: assignment.id, workKind: 'assignment' });
  await block.getByRole('button').first().click();
  await page.getByRole('button', { name: 'Mở công việc', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`course=${course.id}`));
  await expect(page).toHaveURL(new RegExp(`assignment=${assignment.id}`));
});

test('AI saves the actual attachment after approval and refreshes workspace documents', async ({ page }) => {
  const token = await page.evaluate(() => localStorage.getItem('lifeos_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const project = await (await page.request.post(api + '/api/projects', { headers, data: { title: 'AI tài liệu QA' } })).json();
  await page.goto(`${web}/projects?project=${project.id}`);
  await page.getByRole('button', { name: 'Mở trợ lý LifeOS' }).click();
  await page.getByLabel('Chọn tệp cho trợ lý').setInputFiles({ name: 'anh-khao-sat.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64') });
  await page.getByLabel('Yêu cầu của bạn').fill('Lưu tệp này vào dự án');
  await page.getByRole('button', { name: 'Gửi yêu cầu' }).click();
  const draft = page.getByRole('region', { name: 'Đề xuất thay đổi' });
  await expect(draft).toContainText('anh-khao-sat.png');
  expect(await (await page.request.get(`${api}/api/projects/${project.id}/files`, { headers })).json()).toEqual([]);
  await draft.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(draft).toHaveCount(0);
  await page.getByLabel('Chọn tệp cho trợ lý').setInputFiles({ name: 'ghi-chu.txt', mimeType: 'text/plain', buffer: Buffer.from('Nội dung UTF-8: khảo sát AI') });
  await page.getByLabel('Yêu cầu của bạn').fill('Lưu tệp này vào dự án');
  await page.getByRole('button', { name: 'Gửi yêu cầu' }).click();
  await expect(draft).toContainText('ghi-chu.txt');
  await draft.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(draft).toHaveCount(0);
  await page.getByRole('button', { name: 'Đóng trợ lý' }).click();
  await page.getByRole('button', { name: 'Tài liệu', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tải xuống anh-khao-sat.png' })).toBeVisible();
});
