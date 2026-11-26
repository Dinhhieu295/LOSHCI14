/**
 * LifeOS E2E/API tests.
 * Run the app first, then: npx playwright test test/lifeos.spec.ts --reporter=list
 * Optional URLs: LIFEOS_WEB_URL, LIFEOS_API_URL.
 */
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

const WEB_URL = process.env.LIFEOS_WEB_URL ?? 'http://127.0.0.1:5173';
const API_URL = process.env.LIFEOS_API_URL ?? 'http://127.0.0.1:4000';
const password = 'LifeOS-Test-123!';
const makeStamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function dateInDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function nextMonday() {
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7 - (now.getDay() + 6) % 7, 12);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

async function mouseDrag(page: Page, grip: Locator, target: { x: number; y: number }) {
  const source = (await grip.boundingBox())!;
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
}

async function openProjectPage(page: Page, name: string) {
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/projects\?project=/);
  expect(page.context().pages()).toHaveLength(1);
  return page;
}

async function apiJson<T>(
  request: APIRequestContext,
  path: string,
  token?: string,
  options: {
    method?: string;
    data?: unknown;
    expectedStatus?: number;
  } = {},
): Promise<T> {
  const response = await request.fetch(`${API_URL}/api${path}`, {
    method: options.method ?? 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    data: options.data,
  });
  const expectedStatus = options.expectedStatus ?? 200;
  expect(response.status(), `${options.method ?? 'GET'} ${path}`).toBe(expectedStatus);
  if (response.status() === 204) return undefined as T;
  return (await response.json()) as T;
}

async function registerApiUser(request: APIRequestContext, email: string, fullName: string) {
  return apiJson<{ user: { id: string; email: string }; token: string }>(request, '/auth/register', undefined, {
    method: 'POST',
    expectedStatus: 201,
    data: { email, password, fullName },
  });
}

async function registerInUi(page: Page, email: string, name: string) {
  await page.goto(WEB_URL);
  await page.getByRole('button', { name: 'Đăng ký ngay' }).click();
  await page.getByLabel('Họ và tên').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.locator('input[autocomplete="new-password"]').first().fill(password);
  await page.locator('input[autocomplete="new-password"]').nth(1).fill(password);
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(name.split(' ')[0]) })).toBeVisible();
}

async function addCourseInUi(page: Page, courseName: string) {
  await page.getByRole('button', { name: 'Thêm môn học' }).click();
  await page.getByLabel('Tên môn học').fill(courseName);
  await page
    .locator('form.study-editor')
    .filter({ has: page.getByLabel('Tên môn học') })
    .getByRole('button', { name: 'Thêm môn' })
    .click();
}

test.describe('Giao diện LifeOS', () => {
  let stamp: string;
  let email: string;
  let name: string;

  test.beforeEach(async ({ page }) => {
    stamp = makeStamp();
    email = `qa-${stamp}@example.test`;
    name = `QA ${stamp}`;
    await registerInUi(page, email, name);
  });

  test('đăng nhập lại và đăng xuất', async ({ page }) => {
    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await expect(page.getByRole('heading', { name: 'Chào mừng trở lại' })).toBeVisible();
    await page.getByLabel('Email').fill(email);
    await page.locator('input[autocomplete="current-password"]').fill(password);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(page.getByRole('heading', { name: new RegExp(name.split(' ')[0]) })).toBeVisible();
    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await expect(page.getByRole('heading', { name: 'Chào mừng trở lại' })).toBeVisible();
  });

  test('hiển thị tổng quan và lưu giao diện tối sau khi tải lại', async ({ page }) => {
    await expect(page.getByText('Dự án đang chạy')).toBeVisible();
    await expect(page.getByText('Chưa có dự án nào')).toBeVisible();
    await page.getByRole('button', { name: 'Chuyển sang giao diện tối' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('tạo, sửa, hoàn thành, tìm kiếm (hỗ trợ đ -> d) và xóa dự án cùng task', async ({ page }) => {
    const projectName = `Dự án ${stamp}`;
    const taskName = `Task ${stamp}`;
    const editedTaskName = `Task đã sửa ${stamp}`;
    await page.getByRole('button', { name: 'Dự án', exact: true }).click();
    await page.getByRole('button', { name: 'Tạo dự án' }).first().click();
    await page.getByPlaceholder('Tên dự án').fill(projectName);
    await page.getByPlaceholder('Mô tả ngắn (không bắt buộc)').fill('Dự án kiểm thử tự động');
    await page.locator('form.create-project').getByRole('button', { name: 'Tạo dự án' }).click();

    const project = page.locator('.project-card').filter({ hasText: projectName });
    await expect(project).toBeVisible();
    await openProjectPage(page, projectName);
    await expect(project).toHaveCount(0);
    await page.goBack();
    await expect(project).toBeVisible();
    const detail = await openProjectPage(page, projectName);
    await expect(detail.getByLabel('Tên task')).toHaveCount(0);
    await detail.getByRole('button', { name: 'Thêm task' }).click();
    await detail.getByRole('dialog', { name: 'Thêm task' }).getByLabel('Tên task').fill(taskName);
    await detail.getByRole('button', { name: 'Tạo task' }).click();

    const task = detail.locator('.project-task').filter({ hasText: taskName });
    await expect(task).toBeVisible();
    await task.getByRole('button', { name: 'Sửa task' }).click();
    const editRow = detail.getByRole('dialog', { name: 'Sửa task' });
    await editRow.getByRole('textbox', { name: 'Tên task' }).fill(editedTaskName);
    await editRow.getByRole('button', { name: 'Lưu' }).click();

    const editedTask = detail.locator('.project-task').filter({ hasText: editedTaskName });
    await editedTask.getByRole('button', { name: 'Đánh dấu hoàn thành' }).click();
    await expect(editedTask.getByText('Hoàn thành')).toBeVisible();
    await editedTask.getByRole('button', { name: 'Đánh dấu chưa hoàn thành' }).click();

    // Tìm kiếm không dấu với đ -> d ("da sua")
    await detail.getByRole('button', { name: 'Tìm dự án hoặc task' }).click();
    await detail.getByRole('combobox', { name: 'Tìm tên dự án hoặc task' }).fill(`Task da sua ${stamp}`);
    await detail.locator('.global-search-result').filter({ hasText: editedTaskName }).click();
    await expect(detail.locator('.task-search-highlight')).toBeVisible();

    const visibleTask = detail.locator('.project-task').filter({ hasText: editedTaskName });
    detail.once('dialog', (dialog) => dialog.accept());
    await visibleTask.getByRole('button', { name: /Xóa task/ }).click();
    await expect(visibleTask).toHaveCount(0);

    await detail.getByRole('link', { name: 'Quay lại danh sách' }).click();
    await expect(page).toHaveURL(/\/projects$/);
    page.once('dialog', (dialog) => dialog.accept());
    await project.locator('button.project-delete').click();
    await expect(project).toHaveCount(0);
  });

  test('dự án nâng cao, task milestone 0 ngày, phụ thuộc và timeline', async ({ page }) => {
    const projectName = `Dự án Nâng Cao ${stamp}`;
    await page.getByRole('button', { name: 'Dự án', exact: true }).click();
    await page.getByRole('button', { name: 'Tạo dự án' }).first().click();
    await page.getByPlaceholder('Tên dự án').fill(projectName);
    await page.locator('form.create-project').getByRole('button', { name: 'Tạo dự án' }).click();

    const project = page.locator('.project-card').filter({ hasText: projectName });
    await expect(project).toBeVisible();

    // Sửa thông tin nâng cao của dự án
    await project.getByRole('button', { name: `Sửa dự án ${projectName}` }).click();
    const editForm = page.locator('form.project-edit-panel');
    await editForm.getByLabel('Nhãn / Tag').fill('AI / HCI');
    await editForm.getByLabel('Ghim dự án lên đầu').check();
    await editForm.getByRole('button', { name: 'Lưu dự án' }).click();
    await expect(project.getByText('📌 AI / HCI')).toBeVisible();

    const detail = await openProjectPage(page, projectName);
    await detail.getByRole('button', { name: 'Thêm task' }).click();
    let form = detail.getByRole('dialog', { name: 'Thêm task' });
    await form.getByLabel('Tên task').fill('Mốc khởi động');
    await expect(form.getByLabel('Tổng số bước')).toHaveCount(0);
    await form.getByLabel('Là cột mốc').check();
    await form.getByRole('button', { name: 'Tạo task' }).click();
    await expect(detail.locator('.project-task').getByText('Cột mốc')).toBeVisible();

    await detail.getByRole('button', { name: 'Thêm task' }).click();
    form = detail.getByRole('dialog', { name: 'Thêm task' });
    await form.getByLabel('Tên task').fill('Chuẩn bị trình bày');
    await form.getByText('Phụ thuộc task cùng dự án').click();
    await form.getByLabel('Mốc khởi động').check();
    await form.getByRole('button', { name: 'Tạo task' }).click();
    const dependent = detail.locator('.project-task').filter({ hasText: 'Chuẩn bị trình bày' });
    await expect(dependent.getByText('1 phụ thuộc')).toBeVisible();
    await detail.locator('.project-task').filter({ hasText: 'Mốc khởi động' }).getByRole('button', { name: 'Sửa task' }).click();
    const editTask = detail.getByRole('dialog', { name: 'Sửa task' });
    await editTask.getByText('Phụ thuộc task cùng dự án').click();
    await expect(editTask.getByLabel('Chuẩn bị trình bày (tạo vòng lặp)')).toBeDisabled();
    await editTask.getByRole('button', { name: 'Hủy', exact: true }).click();

    // Xem Timeline và kiểm tra cột mốc 0 ngày không bị biến thành 1 ngày
    await detail.getByRole('button', { name: 'Xem Timeline' }).click();
    await expect(detail.locator('.timeline-milestone-zero')).toBeVisible();
    await expect(detail.getByText('N0 (0d ◆)')).toBeVisible();
  });

  test('tab Hạn task gom mọi dự án, ưu tiên hạn gần và mở đúng task', async ({ page, request }) => {
    const token = (await page.evaluate(() => localStorage.getItem('lifeos_token')))!;
    const createProject = (title: string) => apiJson<{ id: string }>(request, '/projects', token, {
      method: 'POST', expectedStatus: 201, data: { title },
    });
    const first = await createProject('Dự án Báo cáo');
    const second = await createProject('Dự án Thuyết trình');
    const createTask = (projectId: string, title: string, dueDate: string | null, isDone = false) =>
      apiJson<{ id: string }>(request, `/projects/${projectId}/tasks`, token, {
        method: 'POST', expectedStatus: 201, data: { title, dueDate, isDone },
      });
    await createTask(first.id, 'Chưa có hạn nộp', null);
    await createTask(first.id, 'Sửa bản nháp quá hạn', dateInDays(-2));
    const upcoming = await createTask(second.id, 'Nộp slide gần hạn', dateInDays(2));
    await createTask(second.id, 'Tổng kết đã xong', dateInDays(-4), true);
    await createTask(second.id, 'Chuẩn bị đợt sau', dateInDays(14));

    await page.goto(`${WEB_URL}/projects`);
    const navigation = page.getByRole('navigation', { name: 'Mục dự án' });
    const deadlines = navigation.getByRole('button', { name: 'Hạn task', exact: true });
    await deadlines.click();
    await expect(page).toHaveURL(/\/projects\?view=deadlines$/);
    await expect(deadlines).toHaveAttribute('aria-pressed', 'true');
    const rows = page.locator('.planning-list > li');
    await expect(rows.locator('.planning-open')).toHaveText([
      'Sửa bản nháp quá hạn', 'Nộp slide gần hạn', 'Chuẩn bị đợt sau', 'Chưa có hạn nộp', 'Tổng kết đã xong',
    ]);
    await expect(rows.nth(0).getByText('Quá hạn', { exact: true })).toBeVisible();
    await expect(rows.nth(1)).toContainText('Dự án Thuyết trình');
    await expect(rows.nth(1).getByText('Sắp đến hạn', { exact: true })).toBeVisible();
    await page.getByLabel('Lọc task', { exact: true }).selectOption('soon');
    await expect(rows).toHaveCount(1);
    await page.getByLabel('Dự án', { exact: true }).selectOption(first.id);
    await expect(page.getByText('Không có công việc trong bộ lọc này.')).toBeVisible();
    await page.getByLabel('Dự án', { exact: true }).selectOption('');
    await page.getByRole('button', { name: 'Nộp slide gần hạn' }).click();
    await expect(page).toHaveURL(new RegExp(`task=${upcoming.id}`));
    await expect(page.locator(`#task-${upcoming.id}.task-search-highlight`)).toBeVisible();
    await page.getByRole('link', { name: 'Quay lại danh sách' }).click();
    await page.reload();
    await expect(deadlines).toHaveAttribute('aria-pressed', 'true');
    await expect(rows).toHaveCount(5);
  });

  test('bật/tắt nhắc hạn task', async ({ page }) => {
    await page.getByRole('button', { name: 'Dự án', exact: true }).click();
    await page.getByRole('button', { name: 'Tắt nhắc hạn task' }).click();
    await expect(page.getByRole('button', { name: 'Bật nhắc hạn task' })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Dự án', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Bật nhắc hạn task' })).toBeVisible();
  });

  test('tải và tải xuống tài liệu từ task, gom vào dự án và lưu thời gian thực tế', async ({ page, request }) => {
    const token = (await page.evaluate(() => localStorage.getItem('lifeos_token')))!;
    const projectName = `Dự án hồ sơ ${stamp}`;
    const project = await apiJson<{ id: string }>(request, '/projects', token, {
      method: 'POST', expectedStatus: 201, data: { title: projectName },
    });
    const path = `/projects/${project.id}`;
    const task = await apiJson<{ id: string }>(request, `${path}/tasks`, token, {
      method: 'POST', expectedStatus: 201, data: { title: 'Viết báo cáo' },
    });
    await page.reload();
    await page.getByRole('button', { name: 'Dự án', exact: true }).click();
    const detail = await openProjectPage(page, projectName);
    const tabs = detail.getByRole('navigation', { name: 'Mục trong dự án' });
    await detail.getByRole('button', { name: 'Tài liệu của Viết báo cáo' }).click();
    const uploader = detail.getByRole('dialog', { name: 'Tài liệu của Viết báo cáo' });
    const fileName = 'Biên bản nhóm.txt';
    const content = Buffer.from('Dữ liệu tài liệu tiếng Việt');
    await expect(uploader.getByRole('button', { name: 'Tải tài liệu lên' })).toBeEnabled();
    await uploader.getByLabel('Chọn tài liệu').setInputFiles({ name: fileName, mimeType: 'text/plain', buffer: content });
    await expect(uploader.getByText(fileName, { exact: true })).toBeVisible();
    await uploader.getByRole('button', { name: 'Đóng', exact: true }).click();
    await tabs.getByRole('button', { name: 'Tài liệu', exact: true }).click();
    await expect(detail.getByRole('heading', { name: 'Tài liệu dự án' })).toBeVisible();
    await expect(detail.getByRole('button', { name: 'Viết báo cáo', exact: true })).toBeVisible();
    const [download] = await Promise.all([
      detail.waitForEvent('download'), detail.getByRole('button', { name: `Tải xuống ${fileName}` }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(fileName);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const bytes of stream!) chunks.push(bytes);
    expect(Buffer.concat(chunks).equals(content)).toBe(true);

    const [file] = await apiJson<{ id: string; taskId: string }[]>(request, `${path}/files`, token);
    expect(file.taskId).toBe(task.id);
    const other = await registerApiUser(request, `files-other-${stamp}@example.test`, 'Another User');
    await apiJson(request, `${path}/files/${file.id}`, other.token, { expectedStatus: 404 });
    const otherProject = await apiJson<{ id: string }>(request, '/projects', token, {
      method: 'POST', expectedStatus: 201, data: { title: 'Dự án khác' },
    });
    const wrongUpload = await request.post(`${API_URL}/api/projects/${otherProject.id}/tasks/${task.id}/files?name=wrong.txt`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, data: content,
    });
    expect(wrongUpload.status()).toBe(404);

    await tabs.getByRole('button', { name: 'Bấm giờ', exact: true }).click();
    await detail.getByRole('button', { name: 'Bắt đầu bấm giờ' }).click();
    await expect(detail.getByRole('button', { name: 'Dừng và lưu phiên' })).toBeEnabled();
    const timer = await apiJson<{ sessions: { id: string }[] }>(request, `${path}/timer`, token);
    const repeatedStart = await apiJson<{ id: string }>(request, `${path}/timer/start`, token, { method: 'POST' });
    expect(repeatedStart.id).toBe(timer.sessions[0].id);
    await detail.reload();
    await tabs.getByRole('button', { name: 'Bấm giờ', exact: true }).click();
    await expect(detail.getByRole('button', { name: 'Dừng và lưu phiên' })).toBeEnabled();
    await expect(detail.locator('.project-watch > strong')).not.toHaveText('00:00:00');
    await detail.getByRole('button', { name: 'Dừng và lưu phiên' }).click();
    await expect(detail.getByRole('region', { name: 'Lịch sử bấm giờ' })).toBeVisible();
    const saved = await apiJson<{ seconds: number; sessions: { id: string; stoppedAt: string }[] }>(request, `${path}/timer`, token);
    expect(saved.sessions).toHaveLength(1);
    expect(saved.sessions[0].stoppedAt).toBeTruthy();
    expect(saved.seconds).toBeGreaterThan(0);

    await tabs.getByRole('button', { name: 'Tài liệu', exact: true }).click();
    await expect(detail.getByText(fileName, { exact: true })).toBeVisible();
    await apiJson(request, `${path}/tasks/${task.id}`, token, { method: 'DELETE', expectedStatus: 204 });
    expect(await apiJson(request, `${path}/files`, token)).toEqual([]);
  });

  test('bấm giờ từng task, chuyển phiên và cộng thời gian vào lịch sử dự án', async ({ page, request }) => {
    const token = (await page.evaluate(() => localStorage.getItem('lifeos_token')))!;
    const project = await apiJson<{ id: string }>(request, '/projects', token, {
      method: 'POST', expectedStatus: 201, data: { title: `Dự án bấm giờ ${stamp}` },
    });
    const path = `/projects/${project.id}`;
    const first = await apiJson<{ id: string }>(request, `${path}/tasks`, token, {
      method: 'POST', expectedStatus: 201, data: { title: 'Viết bản nháp' },
    });
    const second = await apiJson<{ id: string }>(request, `${path}/tasks`, token, {
      method: 'POST', expectedStatus: 201, data: { title: 'Đọc lại báo cáo' },
    });
    type Timer = { active: { taskId: string } | null; seconds: number; taskSeconds: Record<string, number>;
      sessions: { taskId: string | null; taskTitle: string; stoppedAt: string | null }[] };
    const timer = () => apiJson<Timer>(request, `${path}/timer`, token);

    await page.goto(`${WEB_URL}/projects?project=${project.id}`);
    const firstRow = page.locator(`#task-${first.id}`);
    const secondRow = page.locator(`#task-${second.id}`);
    await firstRow.getByRole('button', { name: 'Bấm giờ cho Viết bản nháp' }).click();
    const firstDialog = page.getByRole('dialog', { name: 'Bấm giờ · Viết bản nháp' });
    await firstDialog.getByRole('button', { name: 'Bắt đầu bấm giờ' }).click();
    await expect(firstDialog.locator('.project-watch > strong')).not.toHaveText('00:00:00');
    await firstDialog.getByRole('button', { name: 'Đóng', exact: true }).click();
    await expect(firstRow.getByText('Đang bấm giờ')).toBeVisible();
    expect((await timer()).active?.taskId).toBe(first.id);

    await secondRow.getByRole('button', { name: 'Bấm giờ cho Đọc lại báo cáo' }).click();
    const secondDialog = page.getByRole('dialog', { name: 'Bấm giờ · Đọc lại báo cáo' });
    await expect(secondDialog.getByText('Đang bấm giờ cho Viết bản nháp')).toBeVisible();
    await secondDialog.getByRole('button', { name: 'Lưu phiên trước và chuyển sang task này' }).click();
    await expect(secondDialog.getByRole('button', { name: 'Dừng và lưu phiên' })).toBeEnabled();
    const switched = await timer();
    expect(switched.active?.taskId).toBe(second.id);
    expect(switched.taskSeconds[first.id]).toBeGreaterThan(0);
    expect(switched.sessions.find((session) => session.taskId === first.id)?.stoppedAt).toBeTruthy();

    await page.reload();
    await expect(secondRow.getByText('Đang bấm giờ')).toBeVisible();
    await secondRow.getByRole('button', { name: 'Bấm giờ cho Đọc lại báo cáo' }).click();
    await expect(secondDialog.locator('.project-watch > strong')).not.toHaveText('00:00:00');
    await secondDialog.getByRole('button', { name: 'Dừng và lưu phiên' }).click();
    await expect(secondDialog.getByRole('region', { name: 'Lịch sử bấm giờ' })).toBeVisible();
    await secondDialog.getByRole('button', { name: 'Đóng', exact: true }).click();
    await expect(secondRow.getByTitle('Tổng thời gian task đã lưu')).toContainText(/\d{2,}:\d{2}:\d{2}/);
    const saved = await timer();
    expect(saved.active).toBeNull();
    expect(saved.taskSeconds[second.id]).toBeGreaterThan(0);
    expect(saved.seconds).toBe(saved.taskSeconds[first.id] + saved.taskSeconds[second.id]);
    await page.getByRole('navigation', { name: 'Mục trong dự án' }).getByRole('button', { name: 'Bấm giờ', exact: true }).click();
    const history = page.getByRole('region', { name: 'Lịch sử bấm giờ' });
    await expect(history.getByText('Viết bản nháp', { exact: true })).toBeVisible();
    await expect(history.getByText('Đọc lại báo cáo', { exact: true })).toBeVisible();

    await apiJson(request, `${path}/timer/start`, token, { method: 'POST', data: { taskId: first.id } });
    await apiJson(request, `${path}/tasks/${first.id}`, token, { method: 'DELETE', expectedStatus: 204 });
    const afterDelete = await timer();
    expect(afterDelete.active).toBeNull();
    expect(afterDelete.sessions.some((session) => session.taskId === null && session.taskTitle === 'Viết bản nháp' && session.stoppedAt)).toBe(true);
    expect(afterDelete.seconds).toBeGreaterThanOrEqual(saved.seconds);
  });

  test('thêm môn và lịch học, sửa/xóa buổi học, xem thời khóa biểu', async ({ page }) => {
    const courseName = `Môn ${stamp}`;
    await page.getByRole('button', { name: 'Học tập', exact: true }).click();
    await addCourseInUi(page, courseName);
    const course = page.getByRole('link', { name: new RegExp(courseName) });
    await course.click();
    await page.getByRole('button', { name: 'Lịch học', exact: true }).click();
    await page.getByRole('button', { name: 'Thêm buổi học' }).click();
    await page.getByLabel('Bắt đầu', { exact: true }).fill('09:00');
    await page.getByLabel('Kết thúc', { exact: true }).fill('10:30');
    await page.getByLabel('Tiết bắt đầu').fill('1');
    await page.getByLabel('Tiết kết thúc').fill('3');
    await page.getByLabel('Địa điểm').fill('Cơ sở QA');
    await page.getByLabel('Phòng học').fill('A101');
    await page.getByRole('button', { name: 'Thêm lịch' }).click();
    await expect(page.getByText('Cơ sở QA')).toBeVisible();
    await page.getByRole('dialog', { name: 'Lịch học' }).getByRole('button', { name: 'Đóng', exact: true }).click();
    await page.getByRole('button', { name: 'Lịch trình', exact: true }).click();
    await expect(page.locator('.calendar-entry[data-kind="course"]').filter({ hasText: courseName })).toBeVisible();
    await page.locator('.calendar-entry[data-kind="course"]').filter({ hasText: courseName }).getByRole('button').click();
    await page.getByRole('button', { name: 'Sửa lịch học' }).click();
    await page.getByLabel('Phòng học').fill('A102');
    await page.getByRole('button', { name: 'Lưu lịch' }).click();
    await expect(page.locator('.session-location').filter({ hasText: 'A102' })).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Xóa lịch học' }).click();
    await expect(page.getByText('Chưa có lịch lên lớp.')).toBeVisible();
  });

  test('hoàn thành môn học giải phóng khung giờ trên Lịch trình và giữ lịch của môn', async ({ page, request }) => {
    const token = (await page.evaluate(() => localStorage.getItem('lifeos_token')))!;
    const name = 'Môn sắp hoàn thành';
    const course = await apiJson<{ id: string }>(request, '/study/courses', token, {
      method: 'POST', expectedStatus: 201, data: { name, aimStudyHours: 36 },
    });
    const session = await apiJson<{ id: string }>(request, '/study/course-sessions', token, {
      method: 'POST', expectedStatus: 201,
      data: { courseId: course.id, weekday: 1, startTime: '09:00', endTime: '10:00', periodStart: 1, periodEnd: 2 },
    });
    const task = await apiJson<{ id: string }>(request, '/tasks', token, {
      method: 'POST', expectedStatus: 201, data: { title: 'Đọc tài liệu' },
    });
    const date = nextMonday();
    const calendarUrl = `${WEB_URL}/calendar?week=${date}`;
    const blocks = [{ taskId: task.id, date, start: 540, end: 600 }];
    const classEntry = page.locator('.calendar-entry[data-kind="course"]').filter({ hasText: name });
    await page.goto(calendarUrl);
    await expect(classEntry).toBeVisible();
    await apiJson(request, '/calendar/task-blocks', token, { method: 'POST', expectedStatus: 409, data: { blocks } });

    await page.goto(`${WEB_URL}/study?tab=assignments&course=${course.id}`);
    await page.getByRole('button', { name: 'Sửa môn', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Chỉnh sửa môn học' });
    const status = editor.getByRole('combobox', { name: 'Trạng thái môn', exact: true });
    await expect(status.locator('option')).toHaveText(['Đang học', 'Hoàn thành']);
    await expect(editor.getByLabel(/Giờ đã học|Mục tiêu giờ học/)).toHaveCount(0);
    await status.selectOption({ label: 'Hoàn thành' });
    await editor.getByRole('button', { name: 'Lưu thay đổi' }).click();
    await expect(page.locator('.course-workspace-title')).toContainText('Hoàn thành');
    await expect(page.locator('.course-overview-metrics')).not.toContainText('giờ mục tiêu');
    await page.getByRole('link', { name: 'Quay lại danh sách' }).click();
    await page.getByLabel('Lọc trạng thái môn').selectOption({ label: 'Hoàn thành' });
    await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible();

    await apiJson(request, '/calendar/task-blocks', token, { method: 'POST', expectedStatus: 201, data: { blocks } });
    await page.goto(calendarUrl);
    await expect(page.locator('.calendar-entry[data-kind="task"]').filter({ hasText: 'Đọc tài liệu' })).toBeVisible();
    await expect(classEntry).toHaveCount(0);
    const sessions = await apiJson<{ id: string }[]>(request, '/study/course-sessions', token);
    expect(sessions.some((item) => item.id === session.id)).toBe(true);
  });

  test('trang môn học có bài tập, tài liệu, giờ làm, kỳ thi và ghi chú theo từng môn', async ({ page, request }) => {
    const token = (await page.evaluate(() => localStorage.getItem('lifeos_token')))!;
    const create = <T,>(resource: string, data: object) => apiJson<T>(request, `/study/${resource}`, token, {
      method: 'POST', data, expectedStatus: 201,
    });
    const course = await create<{ id: string }>('courses', { name: 'Môn Thiết kế giao diện', attendance: 88, studyHours: 4 });
    const other = await create<{ id: string }>('courses', { name: 'Môn Cơ sở dữ liệu' });
    const first = await create<{ id: string }>('assignments', { title: 'Khảo sát người dùng', courseId: course.id, deadline: dateInDays(2) });
    const external = await create<{ id: string }>('assignments', { title: 'Truy vấn dữ liệu', courseId: other.id, deadline: dateInDays(3) });
    await create('exams', { title: 'Thi SQL', courseId: other.id, date: dateInDays(12), type: 'Final' });
    await create('notes', { title: 'Ghi chú SQL', courseId: other.id, date: dateInDays(0) });
    await create('study-logs', { courseId: course.id, date: dateInDays(0), durationMinutes: 150 });

    await page.goto(`${WEB_URL}/study`);
    await page.getByRole('link', { name: /Môn Thiết kế giao diện/ }).click();
    await expect(page.getByRole('heading', { name: 'Môn Thiết kế giao diện', exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`course=${course.id}`));
    expect(page.context().pages()).toHaveLength(1);
    const metrics = page.locator('.course-overview-metrics');
    const absences = metrics.getByRole('spinbutton', { name: 'Số buổi nghỉ', exact: true });
    await expect(absences).toHaveAttribute('placeholder', 'Chưa ghi');
    await expect(absences).toHaveValue('');
    await expect(metrics.getByText('2 giờ 30 phút', { exact: true })).toBeVisible();
    await expect(metrics.getByText('Nhật ký học', { exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Thông tin', exact: true })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Bấm giờ', exact: true })).toHaveCount(0);
    await absences.fill('2');
    await absences.press('Enter');
    await expect.poll(async () => {
      const courses = await apiJson<{ id: string; absences: number | null }[]>(request, '/study/courses', token);
      return courses.find((item) => item.id === course.id)?.absences;
    }).toBe(2);
    const selectTab = (name: string) => page.getByRole('tab', { name, exact: true }).click();
    await expect(page.getByText('Truy vấn dữ liệu', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Thêm bài tập', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'Thêm bài tập' });
    await form.getByLabel('Tên bài tập').fill('Dựng prototype');
    await form.getByLabel('Ngày nộp').fill(dateInDays(5));
    await form.getByText('Phụ thuộc bài tập cùng môn', { exact: true }).click();
    await form.getByLabel('Khảo sát người dùng').check();
    await expect(form.getByText('Truy vấn dữ liệu')).toHaveCount(0);
    await form.getByRole('button', { name: 'Thêm bài tập' }).click();
    const row = page.locator('.assignment-panel .project-task').filter({ hasText: 'Dựng prototype' });
    await expect(row.getByText('1 phụ thuộc')).toBeVisible();
    const assignments = await apiJson<{ id: string; courseId: string; title: string; dependencies: string[] }[]>(request, '/study/assignments', token);
    const assignment = assignments.find((item) => item.title === 'Dựng prototype')!;
    expect(assignment.courseId).toBe(course.id);
    expect(assignment.dependencies).toEqual([first.id]);
    await apiJson(request, `/study/assignments/${first.id}`, token, { method: 'PATCH', expectedStatus: 400, data: { dependencies: [assignment.id] } });
    await apiJson(request, `/study/assignments/${first.id}`, token, { method: 'PATCH', expectedStatus: 400, data: { dependencies: [external.id] } });

    await row.getByRole('button', { name: 'Tài liệu của Dựng prototype' }).click();
    const files = page.getByRole('dialog', { name: 'Tài liệu của Dựng prototype' });
    await expect(files.getByRole('button', { name: 'Tải tài liệu lên' })).toBeEnabled();
    await files.getByLabel('Chọn tài liệu').setInputFiles({ name: 'Bản nháp.txt', mimeType: 'text/plain', buffer: Buffer.from('Thử nghiệm môn học') });
    await expect(files.getByText('Bản nháp.txt')).toBeVisible();
    await files.getByRole('button', { name: 'Đóng', exact: true }).click();
    await selectTab('Tài liệu');
    await expect(page.getByRole('heading', { name: 'Tài liệu môn học' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dựng prototype', exact: true })).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent('download'), page.getByRole('button', { name: 'Tải xuống Bản nháp.txt' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('Bản nháp.txt');
    expect(await download.failure()).toBeNull();
    expect(await apiJson(request, `/study/courses/${other.id}/files`, token)).toEqual([]);

    await page.getByRole('button', { name: 'Dựng prototype', exact: true }).click();
    await row.getByRole('button', { name: 'Bấm giờ cho Dựng prototype' }).click();
    const clock = page.getByRole('dialog', { name: 'Bấm giờ · Dựng prototype' });
    await clock.getByRole('button', { name: 'Bắt đầu bấm giờ' }).click();
    await expect(clock.locator('.project-watch > strong')).not.toHaveText('00:00:00');
    await clock.getByRole('button', { name: 'Dừng và lưu phiên' }).click();
    await expect(clock.getByRole('region', { name: 'Lịch sử bấm giờ' })).toBeVisible();
    await clock.getByRole('button', { name: 'Đóng', exact: true }).click();
    const state = await apiJson<{ seconds: number }>(request, `/study/courses/${course.id}/timer`, token);
    expect(state.seconds).toBeGreaterThan(0);
    await expect(metrics.getByText(`2 giờ 30 phút ${state.seconds} giây`, { exact: true })).toBeVisible();
    await expect(metrics.getByText('Nhật ký học · Bấm giờ', { exact: true })).toBeVisible();
    const courses = await apiJson<{ id: string; trackedSeconds: number }[]>(request, '/study/courses', token);
    expect(courses.find((item) => item.id === course.id)?.trackedSeconds).toBe(state.seconds);
    await apiJson(request, `/study/courses/${course.id}/timer/start`, token, { method: 'POST', expectedStatus: 400 });

    await selectTab('Kỳ thi');
    await expect(page.getByText('Thi SQL', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Thêm kỳ thi', exact: true }).click();
    const exam = page.getByRole('dialog', { name: 'Thêm kỳ thi' });
    await exam.getByLabel('Tên kỳ thi').fill('Thi nguyên mẫu');
    await exam.getByRole('button', { name: 'Thêm kỳ thi' }).click();
    await expect(page.getByText('Thi nguyên mẫu', { exact: true })).toBeVisible();
    await selectTab('Ghi chú');
    await expect(page.getByText('Ghi chú SQL', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Thêm ghi chú', exact: true }).click();
    const note = page.getByRole('dialog', { name: 'Thêm ghi chú' });
    await note.getByLabel('Tiêu đề ghi chú').fill('Kết quả phỏng vấn');
    await note.getByLabel(/Nội dung ghi chú/).fill('Sinh viên muốn nhiều bộ lọc.');
    await note.getByRole('button', { name: 'Thêm ghi chú' }).click();
    await expect(page.getByText('Kết quả phỏng vấn', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Kết quả phỏng vấn', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Quay lại danh sách' }).click();
    await expect(page).toHaveURL(/\/study$/);
    await expect(page.getByRole('link', { name: /Môn Cơ sở dữ liệu/ })).toBeVisible();
  });

  test('tạo, sửa, hoàn tất/khôi phục và xóa bài tập', async ({ page }) => {
    const courseName = `Môn ${stamp}`;
    const assignmentName = `Bài tập ${stamp}`;
    const editedName = `Bài tập sửa ${stamp}`;
    await page.getByRole('button', { name: 'Học tập', exact: true }).click();
    await addCourseInUi(page, courseName);

    await page.getByRole('tab', { name: /^Bài tập/ }).click();
    await page.getByRole('button', { name: 'Thêm bài tập' }).first().click();
    await page.getByLabel('Tên bài tập').fill(assignmentName);
    await page.getByLabel('Ngày nộp').fill(dateInDays(7));
    await page.getByLabel('Môn học').selectOption({ label: courseName });
    await page
      .locator('form.study-editor')
      .filter({ has: page.getByLabel('Tên bài tập') })
      .getByRole('button', { name: 'Thêm bài tập' })
      .click();

    const row = page.locator('.assignment-panel .project-task').filter({ hasText: assignmentName });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: `Sửa bài tập ${assignmentName}` }).click();
    await page.getByLabel('Tên bài tập').fill(editedName);
    await page
      .locator('form.study-editor')
      .filter({ has: page.getByLabel('Tên bài tập') })
      .getByRole('button', { name: 'Lưu thay đổi' })
      .click();

    const edited = page.locator('.assignment-panel .project-task').filter({ hasText: editedName });
    await edited.getByRole('button', { name: 'Đánh dấu hoàn thành' }).click();
    await expect(edited.getByText('Hoàn thành')).toBeVisible();
    await edited.getByRole('button', { name: 'Đánh dấu chưa hoàn thành' }).click();
    page.once('dialog', (dialog) => dialog.accept());
    await edited.getByRole('button', { name: `Xóa bài tập ${editedName}` }).click();
    await expect(edited).toHaveCount(0);
  });

  test('CRUD kỳ thi, ghi chú (an toàn script) và lịch cá nhân (kiểm tra trùng giờ & thứ tự giờ)', async ({
    page,
  }) => {
    const courseName = `Môn P1 ${stamp}`;
    await page.getByRole('button', { name: 'Học tập', exact: true }).click();
    await addCourseInUi(page, courseName);

    // 1. Kỳ thi
    await page.getByRole('tab', { name: /^Kỳ thi/ }).click();
    await page.getByRole('button', { name: 'Thêm kỳ thi' }).first().click();
    const examForm = page.locator('form.study-editor').filter({ has: page.getByLabel('Tên kỳ thi') });
    await examForm.getByLabel('Tên kỳ thi').fill(`Thi giữa kỳ ${stamp}`);
    await examForm.getByLabel('Môn học').selectOption({ label: courseName });
    await examForm.getByLabel('Trọng số điểm (%)').fill('35');
    await examForm.getByLabel('Tiến độ ôn tập (%)').fill('20');
    await examForm.getByRole('button', { name: 'Thêm kỳ thi' }).click();

    const examCard = page.locator('.exam-card').filter({ hasText: `Thi giữa kỳ ${stamp}` });
    await expect(examCard).toBeVisible();
    await examCard.getByRole('button', { name: '+15% ôn tập' }).click();
    await expect(examCard.getByText('35%').first()).toBeVisible();

    // 2. Ghi chú (kèm kiểm tra nội dung chứa thẻ HTML/script được hiển thị dạng văn bản an toàn)
    await page.getByRole('tab', { name: /^Ghi chú/ }).click();
    await page.getByRole('button', { name: 'Thêm ghi chú' }).first().click();
    const noteForm = page.locator('form.study-editor').filter({ has: page.getByLabel('Tiêu đề ghi chú') });
    await noteForm.getByLabel('Tiêu đề ghi chú').fill(`Ghi chú ${stamp}`);
    await noteForm.getByLabel('Tags (ngăn cách bằng dấu phẩy)').fill('DSA, OnThi');
    await noteForm.getByLabel(/Nội dung ghi chú/).fill('Công thức <script>window.__xss=1</script> an toàn');
    await noteForm.getByRole('button', { name: 'Thêm ghi chú' }).click();

    const noteCard = page.locator('.note-card').filter({ hasText: `Ghi chú ${stamp}` });
    await expect(noteCard).toBeVisible();
    await expect(noteCard.getByText('<script>window.__xss=1</script>')).toBeVisible();

    // 3. Lịch cá nhân: kiểm tra chặn giờ kết thúc < bắt đầu và cảnh báo trùng giờ
    await page.getByRole('button', { name: 'Lịch trình', exact: true }).click();
    await page.getByRole('button', { name: 'Thêm sự kiện' }).first().click();
    const schedForm = page.getByRole('dialog', { name: 'Thêm sự kiện cá nhân' });
    await schedForm.getByLabel('Tên sự kiện').fill(`Họp nhóm ${stamp}`);
    await schedForm.getByLabel('Khung giờ (HH:MM - HH:MM)').fill('10:00 - 09:00');
    await schedForm.getByRole('button', { name: 'Thêm vào lịch' }).click();
    await expect(schedForm.getByRole('alert')).toContainText('Khung giờ không hợp lệ');

    await schedForm.getByLabel('Khung giờ (HH:MM - HH:MM)').fill('08:00 - 09:30');
    await schedForm.getByRole('button', { name: 'Thêm vào lịch' }).click();
    await expect(page.locator('.calendar-entry[data-kind="personal"]').filter({ hasText: `Họp nhóm ${stamp}` })).toBeVisible();

    // Mở lại form thêm sự kiện trùng khung giờ để kiểm tra cảnh báo trùng lịch
    await page.getByRole('button', { name: 'Thêm sự kiện' }).first().click();
    const schedForm2 = page.getByRole('dialog', { name: 'Thêm sự kiện cá nhân' });
    await schedForm2.getByLabel('Khung giờ (HH:MM - HH:MM)').fill('08:30 - 10:00');
    await expect(schedForm2.locator('.schedule-conflict-banner')).toContainText('Cảnh báo trùng lịch');
    await schedForm2.getByRole('button', { name: 'Hủy' }).click();
  });

  test('nhật ký học cho nhập thời gian học mà không cần bấm giờ', async ({ page }) => {
    await page.getByRole('button', { name: 'Học tập', exact: true }).click();
    await page.getByRole('tab', { name: 'Nhật ký học' }).click();
    await page.getByRole('button', { name: 'Ghi thời gian học' }).first().click();
    const form = page.getByRole('dialog', { name: 'Ghi thời gian học' });
    await form.getByLabel('Ghi chú').fill('Phiên học kiểm thử');
    await form.getByLabel('Số phút đã học').fill('45');
    await expect(form.getByRole('button', { name: 'Bắt đầu bấm giờ' })).toHaveCount(0);
    await form.getByRole('button', { name: 'Lưu thời gian' }).click();
    await expect(page.getByText('Phiên học kiểm thử')).toBeVisible();
  });

  test('sửa hồ sơ, đổi mật khẩu và điều hướng trên mobile (390px & 320px)', async ({ page }) => {
    await page.getByRole('button', { name: 'Cá nhân' }).click();
    await page.getByRole('button', { name: 'Chỉnh sửa hồ sơ' }).click();
    await page.getByLabel('Nơi ở').fill('TP. Hồ Chí Minh');
    await page.getByLabel('Giới thiệu').fill('Tài khoản kiểm thử LifeOS');
    await page.getByRole('button', { name: 'Lưu hồ sơ' }).click();
    await expect(page.getByText('TP. Hồ Chí Minh')).toBeVisible();

    // Kiểm tra form đổi mật khẩu với mật khẩu hiện tại sai rồi đổi đúng
    await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
    await page.getByPlaceholder('Nhập mật khẩu hiện tại').fill('WrongPass123!');
    await page.getByPlaceholder('Ít nhất 8 ký tự').fill('NewLifeOS-123!');
    await page.getByPlaceholder('Nhập lại mật khẩu mới').fill('NewLifeOS-123!');
    await page.getByRole('button', { name: 'Cập nhật mật khẩu' }).click();
    await expect(page.locator('#password-form-error')).toContainText('Mật khẩu hiện tại không chính xác');

    await page.getByPlaceholder('Nhập mật khẩu hiện tại').fill(password);
    await page.getByRole('button', { name: 'Cập nhật mật khẩu' }).click();
    await expect(page.locator('.password-success-banner')).toContainText('Đã đổi mật khẩu thành công');

    await expect(page.getByRole('button', { name: 'Gieo hạt giống' })).toHaveCount(0);

    await page.setViewportSize({ width: 320, height: 640 });
    await page.getByRole('button', { name: 'Mở menu' }).click();
    await expect(page.locator('.sidebar')).toHaveClass(/sidebar-open/);
    await page.getByRole('button', { name: 'Dự án', exact: true }).click();
    await expect(page.locator('.sidebar')).not.toHaveClass(/sidebar-open/);

    // Kiểm tra responsive không tràn ngang ở 320px, 390px, 768px, 1024px và 1280px
    for (const width of [320, 390, 768, 1024, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow, `Không tràn ngang ở viewport ${width}px`).toBe(false);
    }

    // Kiểm tra Offline banner và tự phục hồi khi Online
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.locator('.offline-banner')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.locator('.offline-banner')).toHaveCount(0);
  });

  test('điều hướng URL, Back/Forward, hộp thoại Escape focus trap và retry khi lưu lỗi', async ({ page }) => {
    // 1. Hộp thoại Trợ giúp đóng bằng Escape và trả focus về nút Trợ giúp
    const helpBtn = page.getByRole('button', { name: 'Trợ giúp' });
    await helpBtn.click();
    await expect(page.getByRole('dialog', { name: 'Sử dụng LifeOS' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Sử dụng LifeOS' })).toHaveCount(0);
    await expect(helpBtn).toBeFocused();

    // 2. Điều hướng URL và Back/Forward
    await page.getByRole('button', { name: 'Dự án', exact: true }).click();
    await expect(page).toHaveURL(/\/projects/);
    await page.getByRole('button', { name: 'Học tập', exact: true }).click();
    await expect(page).toHaveURL(/\/study/);
    await page.getByRole('tab', { name: /Kỳ thi/ }).click();
    await expect(page).toHaveURL(/tab=exams/);

    await page.goBack();
    await expect(page).toHaveURL(/\/study$/);
    await expect(page.getByRole('tab', { name: /^Môn học/ })).toHaveAttribute('aria-selected', 'true');
    await page.goBack();
    await expect(page).toHaveURL(/\/projects/);
    await page.goForward();
    await expect(page).toHaveURL(/\/study/);

    // 3. Kiểm tra giữ bản nháp khi API lưu lỗi và bấm Thử lưu lại trên Toast
    await page.getByRole('button', { name: 'Dự án', exact: true }).click();
    await page.getByRole('button', { name: 'Tạo dự án' }).first().click();
    await page.getByPlaceholder('Tên dự án').fill(`Dự án Retry ${stamp}`);

    let shouldFailOnce = true;
    await page.route('**/api/projects', async (route) => {
      if (route.request().method() === 'POST' && shouldFailOnce) {
        shouldFailOnce = false;
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Lỗi mạng tạm thời khi tạo dự án.' } }),
        });
        return;
      }
      await route.continue();
    });

    await page.locator('form.create-project').getByRole('button', { name: 'Tạo dự án' }).click();
    // Form vẫn mở và giữ nguyên dữ liệu đã nhập
    await expect(page.getByPlaceholder('Tên dự án')).toHaveValue(`Dự án Retry ${stamp}`);
    // Bấm nút Thử lưu lại trên Toast để lưu lại đúng thao tác vừa thất bại
    await page.locator('.toast-retry-btn').click();
    await expect(page.locator('.project-card').filter({ hasText: `Dự án Retry ${stamp}` })).toBeVisible();
  });

  test('lọc học kỳ giờ học trên UI, tìm kiếm bàn phím, mutation thành công nhưng refresh lỗi và hết hạn token', async ({
    page,
    request,
  }) => {
    // 1. Tạo môn HK1 với 2 giờ đã học
    await page.getByRole('button', { name: 'Học tập', exact: true }).click();
    await page.getByRole('button', { name: 'Thêm môn học' }).click();
    const courseForm = page.locator('form.study-editor').filter({ has: page.getByLabel('Tên môn học') });
    await courseForm.getByLabel('Tên môn học').fill(`Môn Giải Thuật ${stamp}`);
    await courseForm.getByLabel('Học kỳ').fill('HK1-2026');
    await courseForm.getByRole('button', { name: 'Thêm môn' }).click();
    await expect(page.getByRole('link', { name: new RegExp(`Môn Giải Thuật ${stamp}`) })).toBeVisible();
    const token = (await page.evaluate(() => localStorage.getItem('lifeos_token')))!;
    const courses = await apiJson<{ id: string; name: string }[]>(request, '/study/courses', token);
    const courseId = courses.find((course) => course.name === `Môn Giải Thuật ${stamp}`)!.id;
    await apiJson(request, '/study/study-logs', token, {
      method: 'POST', expectedStatus: 201, data: { courseId, date: dateInDays(0), durationMinutes: 120 },
    });
    await page.reload();

    await expect(page.locator('.study-stat-card').filter({ hasText: 'Giờ học tích lũy' })).toContainText('2h');

    // Khi lọc theo học kỳ HK1-2026, thẻ thống kê chuyển sang "Giờ học (phạm vi lọc)" = 2h
    await page.getByLabel('Lọc theo học kỳ').selectOption('HK1-2026');
    await expect(page.locator('.study-stat-card').filter({ hasText: 'Giờ học (phạm vi lọc)' })).toContainText('2h');
    await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();

    // 2. Tìm kiếm bằng bàn phím (ArrowDown + Enter) để mở môn vừa tạo
    await page.getByRole('button', { name: 'Tìm dự án hoặc task' }).click();
    const searchInput = page.getByRole('combobox', { name: 'Tìm tên dự án hoặc task' });
    await searchInput.fill(`Giai Thuat ${stamp}`);
    await expect(page.locator('.global-search-result').first()).toBeVisible();
    await searchInput.press('Enter');
    await expect(page).toHaveURL(/course=/);

    // 3. Deep link với ID dự án không tồn tại -> cảnh báo và tự làm sạch URL
    await page.goto(`${WEB_URL}/projects?project=non-existent-id-999`);
    await expect(page.locator('.toast')).toContainText('Không tìm thấy dự án');

    // 4. Mutation thành công nhưng refresh lỗi -> form đóng lại, không tạo bản ghi trùng
    let failNextGetProjects = false;
    await page.route('**/api/projects', async (route) => {
      if (route.request().method() === 'POST') {
        failNextGetProjects = true;
        await route.continue();
        return;
      }
      if (route.request().method() === 'GET' && failNextGetProjects) {
        failNextGetProjects = false;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Không thể tải danh sách mới.' } }),
        });
        return;
      }
      await route.continue();
    });

    await page.getByRole('button', { name: 'Tạo dự án' }).first().click();
    await page.getByPlaceholder('Tên dự án').fill(`Dự án Refresh Lỗi ${stamp}`);
    await page.locator('form.create-project').getByRole('button', { name: 'Tạo dự án' }).click();
    // Form đã đóng dù refresh lỗi, hiện cảnh báo Tải lại danh sách
    await expect(page.locator('form.create-project')).toHaveCount(0);
    await expect(page.locator('.toast-warning')).toContainText('chưa tải lại được danh sách');

    // 5. Token hết hạn (401) -> tự động đưa về màn hình đăng nhập
    await page.evaluate(() => localStorage.setItem('lifeos_token', 'expired-invalid-token'));
    await page.getByRole('button', { name: 'Tổng quan' }).click();
    await page.getByRole('button', { name: 'Cập nhật' }).click();
    await expect(page.getByRole('heading', { name: 'Chào mừng trở lại' })).toBeVisible();
  });

  test('liên kết phân tích GPA cũ mở danh sách môn và điểm từng môn vẫn xem được', async ({ page, request }) => {
    const token = (await page.evaluate(() => localStorage.getItem('lifeos_token')))!;
    await apiJson(request, '/study/courses', token, {
      method: 'POST', expectedStatus: 201,
      data: { name: 'Giải thuật A4', credits: 3, semester: 'HK1', gradeComponents: [{ name: 'Cuối kỳ', score10: 8.5, weight: 100 }] },
    });
    await page.goto(`${WEB_URL}/study?tab=gpa`);
    await expect(page.getByRole('tab', { name: /^Môn học/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'Phân tích GPA', exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: /Giải thuật A4/ }).click();
    await expect(page.locator('.course-overview-metrics')).toContainText('8,5/10');
  });

  test('nhập đầu điểm và số buổi nghỉ trực tiếp, tính điểm tổng theo tỷ trọng', async ({ page, request }) => {
    const token = (await page.evaluate(() => localStorage.getItem('lifeos_token')))!;
    const course = await apiJson<{ id: string; score10: number | null; grade: string }>(request, '/study/courses', token, {
      method: 'POST', expectedStatus: 201, data: { name: 'Môn có đầu điểm', score10: 7, grade: 'B' },
    });
    expect(course.score10).toBeNull();
    expect(course.grade).toBe('N/A');
    await page.goto(`${WEB_URL}/study?tab=assignments&course=${course.id}`);
    const metrics = page.locator('.course-overview-metrics');
    await expect(metrics).toContainText('Chưa có đầu điểm');
    const absences = metrics.getByRole('spinbutton', { name: 'Số buổi nghỉ', exact: true });
    const toggle = metrics.getByRole('button', { name: /^Đầu điểm/ });
    const count = page.getByRole('spinbutton', { name: 'Số đầu điểm', exact: true });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(count).toBeHidden();
    await toggle.click();
    await absences.fill('3');
    await count.fill('2');
    await page.getByLabel('Tên đầu điểm 1').fill('Giữa kỳ');
    await page.getByLabel('Tên đầu điểm 2').fill('Cuối kỳ');
    await page.getByLabel('Điểm 1', { exact: true }).fill('8');
    await page.getByLabel('Tỷ trọng đầu điểm 1').fill('40');
    await page.getByLabel('Tỷ trọng đầu điểm 2').fill('50');
    const save = page.getByRole('button', { name: 'Lưu điểm', exact: true });
    await save.click();
    await expect(page.getByRole('alert').filter({ hasText: 'Tổng tỷ trọng các đầu điểm phải bằng 100%' })).toBeVisible();
    await expect(metrics).toContainText('Chưa đủ điểm');
    await page.getByLabel('Tỷ trọng đầu điểm 2').fill('60');
    await save.click();
    await expect(page.getByRole('form', { name: 'Đầu điểm môn học' }).getByRole('status')).toHaveText('Đã lưu');
    await page.reload();
    await expect(absences).toHaveValue('3');
    await toggle.click();
    await expect(count).toHaveValue('2');
    await expect(page.getByLabel('Tên đầu điểm 2')).toHaveValue('Cuối kỳ');
    await expect(page.getByLabel('Điểm 2', { exact: true })).toHaveValue('');
    await page.getByLabel('Điểm 2', { exact: true }).fill('9');
    await expect(metrics).toContainText('8,6/10');
    await expect(metrics.getByText('A', { exact: true })).toBeVisible();
    await expect(metrics.getByText('Chưa lưu', { exact: true })).toBeVisible();
    await save.click();
    await expect(metrics.getByText('Chưa lưu', { exact: true })).toHaveCount(0);
    const apiCourse = await apiJson<{ score10: number }>(request, `/study/courses/${course.id}`, token, {
      method: 'PATCH', data: { score10: 1, grade: 'F' },
    });
    expect(apiCourse.score10).toBe(8.6);
    await page.reload();
    await expect(metrics).toContainText('8,6/10');
    await toggle.click();
    await expect(page.getByLabel('Tỷ trọng đầu điểm 1')).toHaveValue('40');
    await count.fill('0');
    await save.click();
    await expect(save).toHaveCount(0);
    await page.reload();
    await expect(metrics).toContainText('Chưa có đầu điểm');
  });

  test('ước lượng điểm cuối kỳ tối thiểu theo điểm mục tiêu và tỷ trọng đang nhập', async ({ page, request }) => {
    const token = (await page.evaluate(() => localStorage.getItem('lifeos_token')))!;
    const components = [
      { name: 'Giữa kỳ', score10: 7.5, weight: 20 },
      { name: 'Dự án', score10: 8.25, weight: 35 },
      { name: 'Thi cuối kì', score10: null, weight: 45 },
    ];
    const course = await apiJson<{ id: string }>(request, '/study/courses', token, {
      method: 'POST', expectedStatus: 201, data: { name: 'Môn có mục tiêu điểm', gradeComponents: components },
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB_URL}/study?tab=assignments&course=${course.id}`);
    const estimator = page.getByRole('region', { name: 'Ước lượng điểm cuối kỳ' });
    const target = estimator.getByRole('spinbutton', { name: 'Điểm mục tiêu' });
    const result = estimator.getByRole('status');
    await expect(estimator.getByRole('combobox')).toHaveCount(0);
    await target.fill('8.5');
    await expect(result).toHaveText('Điểm cuối kỳ cần ít nhất 9,14/10.');

    await target.fill('9');
    await expect(result).toContainText('kể cả khi cuối kỳ được 10/10');
    await target.fill('4');
    await expect(result).toContainText('ngay cả khi cuối kỳ được 0/10');
    await target.fill('11');
    await expect(result).toHaveText('Nhập điểm mục tiêu từ 0 đến 10.');

    await target.fill('8.5');
    await page.getByRole('button', { name: 'Đầu điểm (3)', exact: true }).click();
    await page.getByLabel('Tỷ trọng đầu điểm 3').fill('40');
    await expect(result).toContainText('tổng bằng 100%');
    await page.getByLabel('Tỷ trọng đầu điểm 3').fill('45');
    await page.getByLabel('Điểm 2', { exact: true }).fill('');
    await expect(result).toContainText('Nhập điểm cho các đầu điểm còn lại');
    await page.getByLabel('Điểm 2', { exact: true }).fill('8.25');
    await page.getByLabel('Tên đầu điểm 3').fill('Bài kiểm tra');
    await expect(result).toHaveText('Đặt tên đầu điểm là “Cuối kỳ” để tính.');
    await page.getByLabel('Tên đầu điểm 3').fill('Thi CK');
    await page.getByLabel('Điểm 3', { exact: true }).fill('9.5');
    await expect(result).toHaveText('Điểm cuối kỳ cần ít nhất 9,14/10.');
    await page.getByLabel('Tên đầu điểm 2').fill('Final');
    await expect(result).toHaveText('Chỉ đặt tên “Cuối kỳ” cho một đầu điểm.');

    const courses = await apiJson<{ id: string; gradeComponents: typeof components }[]>(request, '/study/courses', token);
    expect(courses.find((item) => item.id === course.id)?.gradeComponents).toEqual(components);
  });

  test('giờ trống trừ lịch bận, phản hồi được lưu và công việc hiện thời điểm hoàn thành', async ({ page, request }) => {
    const token = (await page.evaluate(() => localStorage.getItem('lifeos_token')))!;
    const tomorrow = dateInDays(1);
    const weekday = ((new Date(`${tomorrow}T12:00:00`).getDay() + 6) % 7) + 1;
    const course = await apiJson<{ id: string }>(request, '/study/courses', token, {
      method: 'POST', expectedStatus: 201, data: { name: 'Cơ sở dữ liệu A4', credits: 3, aimStudyHours: 1 },
    });
    await apiJson(request, '/study/course-sessions', token, {
      method: 'POST', expectedStatus: 201,
      data: { courseId: course.id, weekday, startTime: '10:00', endTime: '11:00', periodStart: 1, periodEnd: 2 },
    });
    await apiJson(request, '/study/schedule', token, {
      method: 'POST', expectedStatus: 201, data: { title: 'Họp nhóm', date: tomorrow, time: '11:30 - 12:00' },
    });
    const project = await apiJson<{ id: string }>(request, '/projects', token, {
      method: 'POST', expectedStatus: 201, data: { title: 'Tiến độ A4' },
    });
    await apiJson(request, `/projects/${project.id}/tasks`, token, {
      method: 'POST', expectedStatus: 201, data: { title: 'Nộp báo cáo A4', status: 'done', dueDate: tomorrow },
    });

    await page.reload();
    await page.getByRole('button', { name: 'Học tập', exact: true }).click();
    await page.getByRole('tab', { name: 'Gợi ý học', exact: true }).click();
    await page.getByRole('button', { name: 'Xem giờ trống', exact: true }).click();
    await page.getByRole('button', { name: 'Chỉnh khung giờ' }).click();
    const labels = ['Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy', 'Chủ nhật'];
    for (const [index, label] of labels.entries()) {
      if (index + 1 !== weekday) await page.getByRole('checkbox', { name: `Có thể học ${label}` }).uncheck();
    }
    await page.getByLabel(`Bắt đầu ${labels[weekday - 1]}`).fill('09:00');
    await page.getByLabel(`Kết thúc ${labels[weekday - 1]}`).fill('12:00');
    await page.getByRole('button', { name: 'Lưu khung giờ' }).click();
    await expect(page.getByText('09:00–10:00', { exact: true })).toBeVisible();
    await expect(page.getByText('11:00–11:30', { exact: true })).toBeVisible();
    await page.getByRole('dialog', { name: 'Khung giờ rảnh' }).getByRole('button', { name: 'Đóng', exact: true }).click();
    await page.getByRole('button', { name: 'Học tập', exact: true }).click();
    await page.getByRole('tab', { name: 'Gợi ý học', exact: true }).click();
    await expect(page.getByLabel('Khung giờ gợi ý')).toContainText('09:00–10:00');
    await page.getByRole('button', { name: 'Học ít hơn' }).click();
    await expect(page.getByRole('button', { name: 'Học ít hơn' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Khung giờ gợi ý')).toContainText('09:00–09:30');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Học ít hơn' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Công việc', exact: true }).click();
    await page.getByRole('button', { name: 'Việc dự án', exact: true }).click();
    await expect(page.getByText(/Xong lúc/)).toBeVisible();
    await page.getByRole('button', { name: 'Nộp báo cáo A4' }).click();
    await expect(page).toHaveURL(/\/projects\?project=.*&task=/);
    await expect(page.locator('.project-task').filter({ hasText: 'Nộp báo cáo A4' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('button', { name: 'Việc dự án', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('việc cá nhân và hạn mọi task theo nhiều tuần, mở đúng việc và lưu phiên cá nhân', async ({ page, request }) => {
    const token = (await page.evaluate(() => localStorage.getItem('lifeos_token')))!;
    const due = dateInDays(17);
    const project = await apiJson<{ id: string }>(request, '/projects', token, {
      method: 'POST', expectedStatus: 201, data: { title: 'Dự án hạn tuần xa' },
    });
    await apiJson(request, `/projects/${project.id}/tasks`, token, {
      method: 'POST', expectedStatus: 201, data: { title: 'Nộp bản thiết kế', dueDate: due },
    });
    await apiJson(request, `/projects/${project.id}/tasks`, token, {
      method: 'POST', expectedStatus: 201, data: { title: 'Việc đã hoàn thành', dueDate: due, status: 'done' },
    });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Kế hoạch', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Công việc', exact: true }).click();
    await page.getByRole('button', { name: 'Thêm công việc' }).click();
    await page.getByLabel('Tên công việc').fill('Đi lấy đồ');
    await page.getByLabel('Hạn chót (tùy chọn)').fill(due);
    await page.getByRole('button', { name: 'Thêm công việc' }).click();
    await expect(page.getByText('Đi lấy đồ', { exact: true })).toBeVisible();
    const [personal] = await apiJson<{ id: string }[]>(request, '/tasks', token);
    const other = await registerApiUser(request, `work-other-${stamp}@example.test`, 'Other Work');
    expect(await apiJson(request, '/tasks', other.token)).toEqual([]);
    await apiJson(request, `/tasks/${personal.id}`, other.token, {
      method: 'PATCH', expectedStatus: 404, data: { isDone: true },
    });

    await page.getByRole('button', { name: 'Lịch trình', exact: true }).click();
    await page.getByRole('button', { name: 'Xem 4 tuần' }).click();
    const day = page.locator(`[data-week-date="${due}"]`);
    await expect(day).toContainText('3 hạn');
    await page.getByRole('button', { name: '4 tuần sau' }).click();
    await expect(day).toHaveCount(0);
    await page.getByRole('button', { name: '4 tuần trước' }).click();
    await day.click();
    const deadlines = page.locator(`[data-deadlines="${due}"]`);
    await expect(deadlines.getByRole('button', { name: 'Hạn: Đi lấy đồ' })).toBeVisible();
    await expect(deadlines.getByRole('button', { name: 'Hạn: Nộp bản thiết kế' })).toBeVisible();
    await deadlines.getByRole('button', { name: 'Xem 3 hạn', exact: false }).click();
    await expect(page.getByRole('dialog').getByText('Việc đã hoàn thành', { exact: true })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Đóng', exact: true }).click();

    await page.getByRole('button', { name: 'Xếp giờ cho Đi lấy đồ' }).click();
    const editor = page.getByRole('dialog', { name: 'Đi lấy đồ' });
    await editor.getByLabel('Ngày làm việc').fill(due);
    await editor.getByLabel('Giờ bắt đầu').fill('09:00');
    await editor.getByRole('button', { name: 'Lưu phiên' }).click();
    const booked = page.locator(`[data-calendar-date="${due}"] .calendar-entry[data-kind="task"]`);
    await expect(booked).toContainText('Đi lấy đồ');
    await page.reload();
    await expect(booked).toContainText('Đi lấy đồ');
    await deadlines.getByRole('button', { name: 'Hạn: Đi lấy đồ' }).click();
    await expect(page).toHaveURL(/\/work\?task=/);
    await expect(page.getByLabel('Tên công việc')).toHaveValue('Đi lấy đồ');
    await page.goBack();
    await expect(booked).toContainText('Đi lấy đồ');
    await page.getByRole('button', { name: 'Hôm nay', exact: true }).click();
    await expect(booked).toHaveCount(0);
    await page.getByLabel('Chọn ngày để mở tuần').fill(due);
    await expect(booked).toContainText('Đi lấy đồ');
  });

  test('thời khóa biểu kéo thả hai chiều, tránh lịch học và lưu bản gợi ý đã chỉnh', async ({ page, request }) => {
    const token = (await page.evaluate(() => localStorage.getItem('lifeos_token')))!;
    const date = nextMonday();
    const course = await apiJson<{ id: string }>(request, '/study/courses', token, {
      method: 'POST', expectedStatus: 201, data: { name: 'Lớp lịch kiểm thử' },
    });
    await apiJson(request, '/study/course-sessions', token, {
      method: 'POST', expectedStatus: 201,
      data: { courseId: course.id, weekday: 1, startTime: '09:00', endTime: '10:00', periodStart: 1, periodEnd: 2 },
    });
    await apiJson(request, '/study/schedule', token, {
      method: 'POST', expectedStatus: 201, data: { title: 'Họp cá nhân', date, time: '10:30 - 11:00' },
    });
    await apiJson(request, '/planning/availability', token, {
      method: 'PUT', expectedStatus: 204, data: { windows: [{ weekday: 1, start: '09:00', end: '12:00' }] },
    });
    const project = await apiJson<{ id: string }>(request, '/projects', token, {
      method: 'POST', expectedStatus: 201, data: { title: 'Dự án lịch' },
    });
    const name = 'Viết báo cáo tuần';
    const task = await apiJson<{ id: string }>(request, `/projects/${project.id}/tasks`, token, {
      method: 'POST', expectedStatus: 201, data: { title: name, dueDate: date, estimate: '1h' },
    });
    const taskBlocks = '/calendar/task-blocks';
    await apiJson(request, taskBlocks, token, {
      method: 'POST', expectedStatus: 409, data: { blocks: [
        { taskId: task.id, date, start: 660, end: 720 },
        { taskId: task.id, date, start: 540, end: 600 },
      ] },
    });
    expect(await apiJson(request, taskBlocks, token)).toEqual([]);

    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(`${WEB_URL}/study?tab=schedule`);
    await expect(page.getByRole('heading', { name: 'Lịch trình' })).toBeVisible();
    await page.getByRole('button', { name: 'Tuần sau' }).click();
    const column = page.locator(`[data-calendar-date="${date}"]`);
    const queue = page.getByRole('complementary', { name: 'Hàng đợi công việc' });
    const board = page.getByRole('region', { name: 'Lịch theo tuần' });
    const collapse = queue.getByRole('button', { name: 'Thu gọn hàng đợi' });
    const expand = queue.getByRole('button', { name: 'Mở hàng đợi' });
    const grabFromQueue = queue.getByRole('button', { name: `Kéo ${name} vào lịch` });
    const scheduled = column.locator('.calendar-entry[data-kind="task"]').filter({ hasText: name });
    await expect(column.getByRole('button', { name: /Lớp lịch kiểm thử/ })).toBeVisible();
    await expect(grabFromQueue).toBeVisible();
    const widthWithQueue = (await board.boundingBox())!.width;
    await collapse.click();
    await expect(expand).toHaveAttribute('aria-expanded', 'false');
    await expect(grabFromQueue).toBeHidden();
    expect((await board.boundingBox())!.width).toBeGreaterThan(widthWithQueue);
    await expect.poll(() => board.evaluate((element) => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(960);
    await page.reload();
    await expect(expand).toBeVisible();
    await expand.click();
    await expect(collapse).toHaveAttribute('aria-expanded', 'true');
    await expect(grabFromQueue).toBeVisible();
    const point = async (minute: number) => {
      await page.locator('.calendar-viewport').evaluate((element) => { element.scrollLeft = 0; });
      const box = (await column.boundingBox())!;
      return { x: box.x + box.width / 2, y: box.y + minute - 420 + 3 };
    };
    const queuePoint = async () => {
      const box = (await queue.getByRole('heading', { name: /^Hàng đợi/ }).boundingBox())!;
      return { x: box.x + 20, y: box.y + 9 };
    };
    await mouseDrag(page, grabFromQueue, await point(540));
    await expect(page.locator('.calendar-error')).toContainText('Trùng giờ');
    await expect(scheduled).toHaveCount(0);
    await mouseDrag(page, grabFromQueue, await point(660));
    await expect(scheduled).toContainText('11:00–12:00');
    await expect(grabFromQueue).toHaveCount(0);

    const scheduledGrip = scheduled.getByRole('button', { name: /^Kéo phiên/ });
    const gripBox = (await scheduledGrip.boundingBox())!;
    const blockBox = (await scheduled.boundingBox())!;
    const moveTo = await point(720);
    moveTo.y += gripBox.y + gripBox.height / 2 - blockBox.y - 3;
    await mouseDrag(page, scheduledGrip, moveTo);
    await expect(scheduled).toContainText('12:00–13:00');
    await collapse.click();
    await mouseDrag(page, scheduled.getByRole('button', { name: /^Kéo phiên/ }), await queuePoint());
    await expect(scheduled).toHaveCount(0);
    await expect(queue.getByRole('heading')).toHaveText('Hàng đợi 1');
    await expand.click();
    await expect(grabFromQueue).toBeVisible();

    await page.getByRole('button', { name: 'Gợi ý xếp lịch' }).click();
    const drafts = column.locator('.calendar-entry[data-kind="suggestion"]');
    await expect(drafts).toHaveCount(2);
    await expect(drafts.first()).toContainText('10:00–10:30');
    await expect(drafts.last()).toContainText('11:00–11:30');
    expect(await apiJson(request, taskBlocks, token)).toEqual([]);
    await mouseDrag(page, drafts.first().getByRole('button', { name: /^Kéo phiên/ }), await queuePoint());
    await expect(drafts).toHaveCount(1);
    await expect(grabFromQueue).toBeVisible();
    await page.getByRole('button', { name: 'Lưu lịch gợi ý' }).click();
    await expect(scheduled).toContainText('11:00–11:30');
    await page.reload();
    await expect(scheduled).toContainText('11:00–11:30');
  });

  test('Cài đặt lưu và gỡ khóa GroqCloud theo tài khoản mà không trả lại khóa', async ({ page, request }) => {
    const token = (await page.evaluate(() => localStorage.getItem('lifeos_token')))!;
    const path = '/assistant/settings';
    const initial = await apiJson<{ canSaveKey: boolean; hasPersonalKey: boolean }>(request, path, token);
    test.skip(!initial.canSaveKey, 'Backend cần ASSISTANT_SETTINGS_KEY để kiểm thử lưu khóa.');
    await page.getByRole('button', { name: 'Cài đặt', exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
    const provider = page.getByRole('combobox', { name: 'Nhà cung cấp' });
    const input = page.getByLabel('API key', { exact: true });
    const key = `fixture-groq-key-${stamp}`;
    await provider.selectOption('groq');
    await expect(page.getByLabel('Model', { exact: true })).toHaveValue('qwen/qwen3.8-27b');
    await input.fill(key);
    await page.getByRole('button', { name: 'Lưu kết nối' }).click();
    await expect(page.getByText('Đã lưu khóa AI.', { exact: true })).toBeVisible();
    await expect(input).toHaveValue('');
    await page.reload();
    await expect(provider).toHaveValue('groq');
    await expect(input).toHaveValue('');
    const saved = await apiJson<{ configured: boolean; hasPersonalKey: boolean; provider: string }>(request, path, token);
    expect(saved).toMatchObject({ configured: true, hasPersonalKey: true, provider: 'groq', model: 'qwen/qwen3.8-27b' });
    expect(JSON.stringify(saved)).not.toContain(key);
    await page.getByRole('button', { name: 'Mở trợ lý LifeOS' }).click();
    const assistant = page.getByRole('dialog', { name: 'Trợ lý LifeOS' });
    await expect(assistant.getByText(/gửi tới GroqCloud/)).toBeVisible();
    await expect(assistant.getByLabel('Chọn tệp cho trợ lý')).toHaveAttribute('accept', 'image/png,image/jpeg,.txt,.md,.csv,.json');
    await assistant.getByRole('button', { name: 'Đóng trợ lý' }).click();
    const other = await registerApiUser(request, `ai-other-${stamp}@example.test`, 'Tài khoản thử khác');
    expect(await apiJson(request, path, other.token)).toMatchObject({ hasPersonalKey: false });
    await page.getByRole('button', { name: 'Gỡ khóa' }).click();
    await expect(page.getByText('Đã gỡ khóa AI cá nhân.', { exact: true })).toBeVisible();
    expect(await apiJson(request, path, token)).toMatchObject({ hasPersonalKey: false });
  });

  test('slide đề cương xem trước tỷ trọng và tệp từ chat lưu đúng môn', async ({ page, request }) => {
    // This scenario exercises PDF-capable providers, independently of the server default.
    await page.route('**/api/assistant/status', (route) => route.fulfill({ json: { configured: true, provider: 'gemini' } }));
    const token = (await page.evaluate(() => localStorage.getItem('lifeos_token')))!;
    const initialGrades = [{ name: 'Giữa kỳ', score10: 8, weight: 100 }];
    const course = await apiJson<{ id: string }>(request, '/study/courses', token, {
      method: 'POST', expectedStatus: 201, data: { name: 'Mạng máy tính thử AI', gradeComponents: initialGrades },
    });
    const document = { name: 'Đề cương.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7') };
    await page.route('**/api/assistant/grade-extraction?*', async (route) => {
      expect(new URL(route.request().url()).searchParams.get('courseId')).toBe(course.id);
      expect(route.request().postDataBuffer()).toEqual(document.buffer);
      await route.fulfill({ json: { components: [
        { name: 'Giữa kỳ', weight: 40, page: 2, excerpt: 'Thi giữa kỳ 40%' },
        { name: 'Cuối kỳ', weight: 50, page: 2, excerpt: 'Thi cuối kỳ' },
      ], note: 'Cần kiểm tra tỷ trọng cuối kỳ.' } });
    });
    await page.goto(`${WEB_URL}/study?tab=assignments&course=${course.id}`);
    await page.getByRole('button', { name: 'Đầu điểm (1)' }).click();
    await page.getByRole('button', { name: 'Lấy tỷ trọng từ slide' }).click();
    const slide = page.getByRole('dialog', { name: 'Lấy tỷ trọng từ slide' });
    await slide.getByLabel('Chọn PDF hoặc ảnh slide').setInputFiles(document);
    await slide.getByRole('button', { name: 'Đọc slide' }).click();
    await expect(slide.getByText('Trang 2 · Thi giữa kỳ 40%')).toBeVisible();
    const use = slide.getByRole('button', { name: 'Đưa vào bảng điểm' });
    await expect(use).toBeDisabled();
    await slide.getByLabel('Tỷ trọng từ slide 2').fill('60');
    await use.click();
    const editing = page.getByRole('form', { name: 'Đầu điểm môn học' });
    await expect(editing.getByLabel('Điểm 1', { exact: true })).toHaveValue('8');
    await expect(editing.getByLabel('Điểm 2', { exact: true })).toHaveValue('');
    const courses = await apiJson<{ id: string; gradeComponents: unknown }[]>(request, '/study/courses', token);
    expect(courses.find((item) => item.id === course.id)?.gradeComponents).toEqual(initialGrades);
    await editing.getByRole('button', { name: 'Lưu điểm' }).click();
    await expect(editing.getByRole('status')).toHaveText('Đã lưu');

    await page.route('**/api/assistant/status', (route) => route.fulfill({ json: { configured: true, provider: 'gemini' } }));
    await page.route('**/api/assistant/chat', async (route) => {
      expect(route.request().postDataJSON()).toMatchObject({ scope: { kind: 'course', id: course.id },
        file: { name: document.name, mimeType: document.mimeType, data: document.buffer.toString('base64') } });
      await route.fulfill({ json: { reply: 'Slide có hai đầu điểm.', changes: [] } });
    });
    await page.getByRole('button', { name: 'Mở trợ lý LifeOS' }).click();
    const assistant = page.getByRole('dialog', { name: 'Trợ lý LifeOS' });
    await expect(assistant.getByText('Mạng máy tính thử AI')).toBeVisible();
    await assistant.getByLabel('Chọn tệp cho trợ lý').setInputFiles(document);
    await assistant.getByRole('button', { name: 'Gửi yêu cầu' }).click();
    await expect(assistant.getByText('Slide có hai đầu điểm.')).toBeVisible();
    await assistant.getByRole('button', { name: 'Lưu vào Tài liệu', exact: true }).click();
    await expect(assistant.getByRole('button', { name: 'Đã lưu vào Tài liệu' })).toBeVisible();
    await assistant.getByRole('button', { name: 'Đóng trợ lý' }).click();
    await page.getByRole('tab', { name: 'Tài liệu' }).click();
    await expect(page.getByRole('button', { name: 'Tải xuống Đề cương.pdf' })).toBeVisible();
  });

  test('trợ lý hiện bản xem trước, áp dụng thay đổi và làm mới dữ liệu công việc', async ({ page, request }) => {
    const title = 'Lấy sách do trợ lý tạo';
    const token = (await page.evaluate(() => localStorage.getItem('lifeos_token')))!;
    const change = { id: 'fake-draft', operation: 'create', resource: 'Việc cá nhân và lịch đi làm', resourceKey: 'tasks',
      target: title, details: { title, category: 'personal' } };
    await page.route('**/assistant/status', (route) => route.fulfill({ json: { configured: true } }));
    await page.route('**/assistant/chat', async (route) => {
      expect(route.request().postDataJSON().messages.at(-1).content).toBe('Thêm việc lấy sách');
      await route.fulfill({ json: { reply: 'Bạn có thể xem đề xuất bên dưới.', changes: [change] } });
    });
    let writes = 0;
    await page.route('**/assistant/changes/fake-draft/apply', async (route) => {
      writes += 1;
      await apiJson(request, '/tasks', token, { method: 'POST', expectedStatus: 201, data: change.details });
      await route.fulfill({ status: 204 });
    });
    await page.getByRole('button', { name: 'Công việc', exact: true }).click();
    await page.getByRole('button', { name: 'Việc cá nhân', exact: true }).click();
    await page.getByRole('button', { name: 'Mở trợ lý LifeOS' }).click();
    const assistant = page.getByRole('dialog', { name: 'Trợ lý LifeOS' });
    await assistant.getByLabel('Yêu cầu của bạn').fill('Thêm việc lấy sách');
    await assistant.getByRole('button', { name: 'Gửi yêu cầu' }).click();
    const draft = assistant.getByRole('region', { name: 'Đề xuất thay đổi' });
    await expect(draft).toContainText(title);
    expect(writes).toBe(0);
    await draft.getByRole('button', { name: 'Áp dụng' }).click();
    await expect(assistant.getByRole('log')).toContainText('Đã thực hiện');
    await expect(draft).toHaveCount(0);
    expect(writes).toBe(1);
    await assistant.getByRole('button', { name: 'Đóng trợ lý' }).click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  });

  test('việc làm lặp hằng tuần, việc cá nhân chỉ hiện một lần và gợi ý tránh trùng lịch', async ({ page, request }) => {
    const token = (await page.evaluate(() => localStorage.getItem('lifeos_token')))!;
    const date = nextMonday();
    const nextDate = new Date(Date.parse(`${date}T12:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
    await apiJson(request, '/planning/availability', token, {
      method: 'PUT', expectedStatus: 204, data: { windows: [{ weekday: 1, start: '09:00', end: '12:00' }] },
    });
    const flexible = await apiJson<{ id: string }>(request, '/tasks', token, {
      method: 'POST', expectedStatus: 201, data: { title: 'Mua đồ dùng', dueDate: date, estimate: '60m' },
    });
    await apiJson(request, '/tasks', token, {
      method: 'POST', expectedStatus: 201, data: { title: 'Dự sinh nhật', fixedSlot: { date, start: 720, end: 780 } },
    });
    await apiJson(request, '/tasks', token, {
      method: 'POST', expectedStatus: 201, data: { title: 'Lấy đồ', fixedSlot: { date: nextDate, start: 840, end: 900 } },
    });
    await apiJson(request, '/tasks', token, {
      method: 'POST', expectedStatus: 409,
      data: { title: 'Ca trùng việc cá nhân tuần sau', category: 'employment', fixedSlot: { date, start: 840, end: 900 } },
    });
    await page.reload();
    await page.getByRole('button', { name: 'Công việc', exact: true }).click();
    await page.getByRole('button', { name: 'Việc làm', exact: true }).click();
    await page.getByRole('button', { name: 'Thêm công việc' }).click();
    await page.getByLabel('Tên công việc').fill('Đi dạy gia sư');
    await expect(page.getByLabel('Nhóm công việc')).toHaveValue('employment');
    await page.getByLabel('Ngày bắt đầu').fill(date);
    await page.getByLabel('Giờ bắt đầu').fill('09:45');
    await page.getByLabel('Giờ kết thúc').fill('10:30');
    await page.getByRole('button', { name: 'Thêm công việc' }).click();
    await expect(page.getByText(/Hằng tuần.*09:45–10:30/)).toBeVisible();
    await expect(page.getByText('Mua đồ dùng', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Việc cá nhân', exact: true }).click();
    await expect(page.getByText('Mua đồ dùng', { exact: true })).toBeVisible();
    await expect(page.getByText('Đi dạy gia sư', { exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Lịch trình', exact: true }).click();
    await page.getByLabel('Chọn ngày để mở tuần').fill(date);
    const column = page.locator(`[data-calendar-date="${date}"]`);
    const fixed = column.locator('.calendar-entry[data-kind="fixed-task"]').filter({ hasText: 'Đi dạy gia sư' });
    await expect(fixed).toContainText('Đi dạy gia sư');
    await expect(fixed.locator('small').last()).toHaveText('Việc làm · Hằng tuần');
    const clipped = await fixed.evaluate((entry) => {
      const detail = entry.querySelector('small:last-child');
      return detail ? detail.getBoundingClientRect().bottom - entry.getBoundingClientRect().bottom : Infinity;
    });
    expect(clipped).toBeLessThanOrEqual(0);
    await expect(column.getByRole('button', { name: /Dự sinh nhật/ })).toBeVisible();
    await expect(fixed.getByRole('button', { name: /^Kéo/ })).toHaveCount(0);
    const queue = page.getByRole('complementary', { name: 'Hàng đợi công việc' });
    await expect(queue.getByText('Đi dạy gia sư', { exact: true })).toHaveCount(0);
    await expect(queue.getByRole('button', { name: 'Xếp giờ cho Mua đồ dùng' })).toBeVisible();

    await apiJson(request, '/calendar/task-blocks', token, {
      method: 'POST', expectedStatus: 409, data: { blocks: [{ taskId: flexible.id, date: nextDate, start: 600, end: 630 }] },
    });
    await page.getByRole('button', { name: 'Gợi ý xếp lịch' }).click();
    const suggested = column.locator('.calendar-entry[data-kind="suggestion"]');
    await expect(suggested).toHaveCount(2);
    await expect(suggested.first()).toContainText('09:00–09:45');
    await expect(suggested.last()).toContainText('10:30–10:45');
    await expect(suggested.last().locator('small')).toHaveCount(0);
    await page.getByRole('button', { name: 'Tuần sau' }).click();
    const nextColumn = page.locator(`[data-calendar-date="${nextDate}"]`);
    const nextShift = nextColumn.getByRole('button', { name: /Đi dạy gia sư.*09:45–10:30.*Hằng tuần/ });
    await expect(nextColumn.getByRole('button', { name: /Dự sinh nhật/ })).toHaveCount(0);
    await nextShift.click();
    await expect(page).toHaveURL(/\/work\?view=employment&task=/);
    await expect(page.getByLabel('Nhóm công việc')).toHaveValue('employment');
    await expect(page.getByLabel('Ngày bắt đầu')).toHaveValue(date);
    await expect(page.getByLabel('Giờ bắt đầu')).toHaveValue('09:45');
    await page.getByRole('button', { name: 'Hủy', exact: true }).click();
    await page.getByRole('button', { name: 'Tạm dừng Đi dạy gia sư' }).click();
    await expect(page.getByRole('button', { name: 'Tiếp tục Đi dạy gia sư' })).toBeVisible();
    await page.getByRole('button', { name: 'Lịch trình', exact: true }).click();
    await page.getByLabel('Chọn ngày để mở tuần').fill(nextDate);
    await expect(nextColumn.getByRole('button', { name: /Lấy đồ/ })).toBeVisible();
    await expect(nextShift).toHaveCount(0);
    await page.getByRole('button', { name: 'Công việc', exact: true }).click();
    await page.getByRole('button', { name: 'Việc làm', exact: true }).click();
    await page.getByRole('button', { name: 'Tiếp tục Đi dạy gia sư' }).click();
    await expect(page.getByRole('button', { name: 'Tạm dừng Đi dạy gia sư' })).toBeVisible();
    await page.getByRole('button', { name: 'Lịch trình', exact: true }).click();
    await page.getByLabel('Chọn ngày để mở tuần').fill(nextDate);
    await page.getByRole('button', { name: 'Xem 4 tuần' }).click();
    await expect(page.locator(`[data-week-date="${nextDate}"]`)).toContainText('2 hẹn');
  });

  test('kéo công việc vào thời khóa biểu bằng cử chỉ chạm trên mobile', async ({ page, browser, request }) => {
    const token = (await page.evaluate(() => localStorage.getItem('lifeos_token')))!;
    const date = nextMonday();
    const project = await apiJson<{ id: string }>(request, '/projects', token, {
      method: 'POST', expectedStatus: 201, data: { title: 'Dự án mobile' },
    });
    await apiJson(request, `/projects/${project.id}/tasks`, token, {
      method: 'POST', expectedStatus: 201, data: { title: 'Soạn slide demo', estimate: '30m' },
    });
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
      storageState: await page.context().storageState(),
    });
    try {
      const screen = await mobile.newPage();
      await screen.goto(`${WEB_URL}/calendar`);
      await screen.getByRole('button', { name: 'Tuần sau' }).click();
      const grip = screen.getByRole('button', { name: 'Kéo Soạn slide demo vào lịch' });
      await expect(grip).toBeVisible();
      await screen.getByRole('button', { name: 'Thu gọn hàng đợi' }).tap();
      await expect(grip).toBeHidden();
      const viewport = screen.locator('.calendar-viewport');
      await expect.poll(() => viewport.evaluate((element) => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(844);
      await viewport.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      await expect.poll(() => viewport.evaluate((element) => {
        const lastHour = element.querySelector('.calendar-time-rail span:last-child');
        return lastHour ? lastHour.getBoundingClientRect().bottom - element.getBoundingClientRect().bottom : Infinity;
      })).toBeLessThanOrEqual(1);
      await screen.getByRole('button', { name: 'Mở hàng đợi' }).tap();
      await expect(grip).toBeVisible();
      await viewport.evaluate((element) => { element.scrollTop = 35; });
      await expect.poll(() => screen.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
      const origin = (await grip.boundingBox())!;
      const column = screen.locator(`[data-calendar-date="${date}"]`);
      const box = (await column.boundingBox())!;
      const from = { x: origin.x + origin.width / 2, y: origin.y + origin.height / 2 };
      const to = { x: box.x + 40, y: box.y + 123 };
      const cdp = await mobile.newCDPSession(screen);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
      for (let i = 1; i <= 10; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
          { x: from.x + (to.x - from.x) * i / 10, y: from.y + (to.y - from.y) * i / 10 },
        ] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const saved = column.locator('.calendar-entry[data-kind="task"]');
      await expect(saved).toContainText('Soạn slide demo');
      const handle = (await saved.getByRole('button', { name: 'Kéo phiên Soạn slide demo' }).boundingBox())!;
      const back = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [back] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: back.x + 12, y: back.y }] });
      const drop = screen.locator('.calendar-mobile-drop');
      await expect(drop).toBeVisible();
      const dropArea = (await drop.boundingBox())!;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: dropArea.x + dropArea.width / 2, y: dropArea.y + dropArea.height / 2 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(saved).toHaveCount(0);
      await expect(grip).toBeVisible();
    } finally {
      await mobile.close();
    }
  });
});

test.describe('API LifeOS', () => {
  test('health, đăng ký, đăng nhập sai, đổi mật khẩu thu hồi phiên khác và xác thực phiên', async ({ request }) => {
    const stamp = makeStamp();
    const email = `api-auth-${stamp}@example.test`;
    const health = await request.get(`${API_URL}/health`);
    expect(health.status()).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'ok', database: 'postgres' });
    expect((await request.get(`${API_URL}/api/profile`)).status()).toBe(401);

    const session1 = await registerApiUser(request, email, `API Auth ${stamp}`);
    const session2 = await apiJson<{ token: string }>(request, '/auth/login', undefined, {
      method: 'POST',
      data: { email, password },
    });

    const wrongLogin = await request.post(`${API_URL}/api/auth/login`, {
      data: { email, password: 'wrong-password' },
    });
    expect(wrongLogin.status()).toBe(401);

    // Đổi mật khẩu bằng session1 -> session1 vẫn hợp lệ, session2 bị thu hồi
    const newPassword = 'LifeOS-NewPass-456!';
    await apiJson(request, '/profile/password', session1.token, {
      method: 'PUT',
      expectedStatus: 204,
      data: { currentPassword: password, newPassword },
    });
    await expect(apiJson(request, '/auth/me', session1.token)).resolves.toMatchObject({ user: { email } });
    const session2Check = await request.get(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${session2.token}` },
    });
    expect(session2Check.status()).toBe(401);

    await apiJson(request, '/auth/logout', session1.token, { method: 'POST', expectedStatus: 204 });
    const revoked = await request.get(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${session1.token}` },
    });
    expect(revoked.status()).toBe(401);
  });

  test('CRUD dự án/task, giữ durationDays=0, chặn vòng lặp phụ thuộc và ngăn truy cập chéo tài khoản', async ({
    request,
  }) => {
    const stamp = makeStamp();
    const userA = await registerApiUser(request, `api-project-a-${stamp}@example.test`, `API A ${stamp}`);
    const userB = await registerApiUser(request, `api-project-b-${stamp}@example.test`, `API B ${stamp}`);
    const project = await apiJson<{ id: string }>(request, '/projects', userA.token, {
      method: 'POST',
      expectedStatus: 201,
      data: { title: `API project ${stamp}`, description: 'CRUD test' },
    });
    const taskA = await apiJson<{ id: string; durationDays: number }>(
      request,
      `/projects/${project.id}/tasks`,
      userA.token,
      {
        method: 'POST',
        expectedStatus: 201,
        data: {
          title: `Milestone 0d ${stamp}`,
          priority: 'High',
          durationDays: 0,
          baselineDuration: 0,
          isMilestone: true,
        },
      },
    );
    expect(taskA.durationDays).toBe(0);

    const taskB = await apiJson<{ id: string }>(request, `/projects/${project.id}/tasks`, userA.token, {
      method: 'POST',
      expectedStatus: 201,
      data: { title: `Task B ${stamp}`, priority: 'Medium', dependencies: [taskA.id] },
    });
    const taskPath = `/projects/${project.id}/tasks/${taskB.id}`;
    const completed = await apiJson<{ completedAt: string }>(request, taskPath, userA.token, {
      method: 'PATCH', data: { status: 'done' },
    });
    expect(Number.isFinite(Date.parse(completed.completedAt))).toBe(true);
    const edited = await apiJson<{ completedAt: string }>(request, taskPath, userA.token, {
      method: 'PATCH', data: { title: 'Giữ thời điểm hoàn thành', isDone: true },
    });
    expect(edited.completedAt).toBe(completed.completedAt);
    const reopened = await apiJson<{ completedAt: string | null }>(request, taskPath, userA.token, {
      method: 'PATCH', data: { status: 'todo' },
    });
    expect(reopened.completedAt).toBeNull();

    // Thử tạo vòng lặp phụ thuộc: taskA phụ thuộc vào taskB (trong khi taskB đã phụ thuộc vào taskA) -> 400
    const cyclicRes = await request.patch(`${API_URL}/api/projects/${project.id}/tasks/${taskA.id}`, {
      headers: { Authorization: `Bearer ${userA.token}` },
      data: { dependencies: [taskB.id] },
    });
    expect(cyclicRes.status()).toBe(400);

    await expect(apiJson(request, `/projects/${project.id}`, userB.token)).rejects.toThrow();
    const invalidProject = await request.post(`${API_URL}/api/projects`, {
      headers: { Authorization: `Bearer ${userA.token}` },
      data: { title: '   ' },
    });
    expect(invalidProject.status()).toBe(400);

    // Xóa taskA -> taskB tự động được dọn sạch tham chiếu dependency tới taskA
    await apiJson(request, `/projects/${project.id}/tasks/${taskA.id}`, userA.token, {
      method: 'DELETE',
      expectedStatus: 204,
    });
    const remainingTasks = await apiJson<Array<{ id: string; dependencies: string[] }>>(
      request,
      `/projects/${project.id}/tasks`,
      userA.token,
    );
    expect(remainingTasks.find((t) => t.id === taskB.id)?.dependencies).toEqual([]);

    await apiJson(request, `/projects/${project.id}/tasks/${taskB.id}`, userA.token, {
      method: 'DELETE',
      expectedStatus: 204,
    });
    await apiJson(request, `/projects/${project.id}`, userA.token, { method: 'DELETE', expectedStatus: 204 });
  });

  test('CRUD tài nguyên học tập, giờ học từ nhật ký theo học kỳ, quyền môn học và trạng thái cá nhân', async ({
    request,
  }) => {
    const stamp = makeStamp();
    const userA = await registerApiUser(request, `api-study-a-${stamp}@example.test`, `API Study ${stamp}`);
    const userB = await registerApiUser(request, `api-study-b-${stamp}@example.test`, `API Other ${stamp}`);
    const course = await apiJson<{ id: string }>(request, '/study/courses', userA.token, {
      method: 'POST',
      expectedStatus: 201,
      data: {
        name: `API course ${stamp}`,
        code: 'API-1',
        semester: 'HK1',
        studyHours: 2,
        aimStudyHours: 10,
        status: 'Active',
      },
    });
    const courseHk2 = await apiJson<{ id: string }>(request, '/study/courses', userA.token, {
      method: 'POST',
      expectedStatus: 201,
      data: {
        name: `API course HK2 ${stamp}`,
        code: 'API-2',
        semester: 'HK2',
        studyHours: 4,
        aimStudyHours: 20,
        status: 'Active',
      },
    });

    const resources: Array<{ path: string; body: Record<string, unknown>; patch: Record<string, unknown> }> = [
      {
        path: '/study/assignments',
        body: {
          title: `Assignment ${stamp}`,
          courseId: course.id,
          deadline: dateInDays(5),
          priority: 'Medium',
          status: 'Not Started',
        },
        patch: { status: 'In Progress' },
      },
      {
        path: '/study/exams',
        body: { title: `Exam ${stamp}`, courseId: course.id, date: dateInDays(8), type: 'Midterm', weight: 30, prepProgress: 0 },
        patch: { title: `Exam edited ${stamp}` },
      },
      {
        path: '/study/notes',
        body: { title: `Note ${stamp}`, courseId: course.id, content: 'Test note', date: dateInDays(0), tags: ['qa'] },
        patch: { title: `Note edited ${stamp}` },
      },
      {
        path: '/study/schedule',
        body: { title: `Schedule ${stamp}`, time: '09:00', date: dateInDays(1), color: '#567' },
        patch: { title: `Schedule edited ${stamp}` },
      },
      {
        path: '/study/course-sessions',
        body: {
          courseId: course.id,
          weekday: 1,
          startTime: '09:00',
          endTime: '10:00',
          periodStart: 1,
          periodEnd: 2,
          location: 'QA',
          room: 'A1',
        },
        patch: { room: 'A2' },
      },
      {
        path: '/study/study-logs',
        body: { courseId: course.id, date: dateInDays(0), durationMinutes: 180, note: '3h log > 2h base' },
        patch: { note: 'Updated API study log' },
      },
      {
        path: '/study/study-logs',
        body: { courseId: null, date: dateInDays(0), durationMinutes: 60, note: '1h general study log' },
        patch: { note: 'General log' },
      },
    ];
    const created: Array<{ path: string; id: string }> = [];
    for (const resource of resources) {
      const item = await apiJson<{ id: string }>(request, resource.path, userA.token, {
        method: 'POST',
        expectedStatus: 201,
        data: resource.body,
      });
      created.push({ path: resource.path, id: item.id });
      await apiJson(request, resource.path, userA.token);
      await apiJson(request, `${resource.path}/${item.id}`, userA.token, { method: 'PATCH', data: resource.patch });
    }

    // Kiểm tra quy tắc giờ học trên /study/summary:
    // - Môn HK1 có 3h trong nhật ký học
    // - Môn HK2 chỉ có số giờ nhập tay cũ và chưa ghi nhật ký
    // - Log tự học chung (courseId=null): 1h
    // -> Không lọc học kỳ: 3 + 0 + 1 = 4h, assignments = 1
    const allSummary = await apiJson<{ totalStudyHours: number; assignments: number }>(
      request,
      '/study/summary',
      userA.token,
    );
    expect(allSummary.totalStudyHours).toBe(4);
    expect(allSummary.assignments).toBe(1);

    // -> Lọc HK1: chỉ tính môn HK1 = 3h (không cộng tự học chung), assignments = 1
    const hk1Summary = await apiJson<{ totalStudyHours: number; assignments: number }>(
      request,
      '/study/summary?semester=HK1',
      userA.token,
    );
    expect(hk1Summary.totalStudyHours).toBe(3);
    expect(hk1Summary.assignments).toBe(1);

    // -> Lọc HK2: 0h, assignments = 0
    const hk2Summary = await apiJson<{ totalStudyHours: number; assignments: number }>(
      request,
      '/study/summary?semester=HK2',
      userA.token,
    );
    expect(hk2Summary.totalStudyHours).toBe(0);
    expect(hk2Summary.assignments).toBe(0);

    const foreignCourse = await request.post(`${API_URL}/api/study/assignments`, {
      headers: { Authorization: `Bearer ${userB.token}` },
      data: {
        title: 'Foreign course assignment',
        courseId: course.id,
        deadline: dateInDays(2),
        priority: 'Low',
        status: 'Not Started',
      },
    });
    expect([400, 403, 404]).toContain(foreignCourse.status());

    const invalidSession = await request.post(`${API_URL}/api/study/course-sessions`, {
      headers: { Authorization: `Bearer ${userA.token}` },
      data: { courseId: course.id, weekday: 1, startTime: '10:00', endTime: '09:00', periodStart: 1, periodEnd: 2 },
    });
    expect(invalidSession.status()).toBe(400);

    await apiJson(request, '/profile', userA.token, {
      method: 'PATCH',
      data: { fullName: `API Updated ${stamp}`, location: 'QA City', bio: 'API profile test' },
    });
    const personal = await apiJson<{ streak: number }>(request, '/personal/state', userA.token);
    expect(personal.streak).toBe(1);

    for (const item of created.reverse()) {
      await apiJson(request, `${item.path}/${item.id}`, userA.token, { method: 'DELETE', expectedStatus: 204 });
    }
    await apiJson(request, `/study/courses/${course.id}`, userA.token, { method: 'DELETE', expectedStatus: 204 });
    await apiJson(request, `/study/courses/${courseHk2.id}`, userA.token, { method: 'DELETE', expectedStatus: 204 });
  });
});
