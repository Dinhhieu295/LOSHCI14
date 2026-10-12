/**
 * LifeOS E2E/API tests.
 * Run the app first, then: npx playwright test test/lifeos.spec.ts --reporter=list
 * Optional URLs: LIFEOS_WEB_URL, LIFEOS_API_URL.
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const WEB_URL = process.env.LIFEOS_WEB_URL ?? 'http://127.0.0.1:5173';
const API_URL = process.env.LIFEOS_API_URL ?? 'http://127.0.0.1:4000';
const password = 'LifeOS-Test-123!';
const makeStamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function dateInDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

async function apiJson<T>(request: APIRequestContext, path: string, token?: string, options: {
  method?: string; data?: unknown; expectedStatus?: number;
} = {}): Promise<T> {
  const response = await request.fetch(`${API_URL}/api${path}`, {
    method: options.method ?? 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    data: options.data,
  });
  const expectedStatus = options.expectedStatus ?? 200;
  expect(response.status(), `${options.method ?? 'GET'} ${path}`).toBe(expectedStatus);
  if (response.status() === 204) return undefined as T;
  return await response.json() as T;
}

async function registerApiUser(request: APIRequestContext, email: string, fullName: string) {
  return apiJson<{ user: { id: string; email: string }; token: string }>(request, '/auth/register', undefined, {
    method: 'POST', expectedStatus: 201, data: { email, password, fullName },
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
  await page.locator('form.study-editor').filter({ has: page.getByLabel('Tên môn học') })
    .getByRole('button', { name: 'Thêm môn' }).click();
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

  test('tạo, sửa, hoàn thành, tìm kiếm và xóa dự án cùng task', async ({ page }) => {
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
    await project.getByRole('button', { name: 'Quản lý task' }).click();
    await project.getByPlaceholder('Ví dụ: Hoàn thiện bản thiết kế').fill(taskName);
    await project.getByRole('button', { name: 'Thêm task' }).click();

    const task = project.locator('.project-task').filter({ hasText: taskName });
    await expect(task).toBeVisible();
    await task.getByRole('button', { name: 'Sửa task' }).click();
    const editRow = project.locator('.project-task').last();
    await editRow.getByRole('textbox', { name: 'Tên task' }).fill(editedTaskName);
    await editRow.getByRole('button', { name: 'Lưu' }).click();

    const editedTask = project.locator('.project-task').filter({ hasText: editedTaskName });
    await editedTask.getByRole('button', { name: 'Đánh dấu hoàn thành' }).click();
    await expect(editedTask.getByText('Hoàn thành')).toBeVisible();
    await editedTask.getByRole('button', { name: 'Đánh dấu chưa hoàn thành' }).click();

    await page.getByRole('button', { name: 'Tìm dự án hoặc task' }).click();
    await page.getByRole('textbox', { name: 'Tìm tên dự án hoặc task' }).fill(editedTaskName);
    await page.locator('.global-search-result').filter({ hasText: editedTaskName }).click();
    await expect(page.locator('.task-search-highlight')).toBeVisible();

    const visibleTask = project.locator('.project-task').filter({ hasText: editedTaskName });
    await visibleTask.getByRole('button', { name: /Xóa task/ }).click();
    await expect(visibleTask).toHaveCount(0);
    page.once('dialog', dialog => dialog.accept());
    await project.locator('button.project-delete').click();
    await expect(project).toHaveCount(0);
  });

  test('bật/tắt nhắc hạn task', async ({ page }) => {
    await page.getByRole('button', { name: 'Dự án', exact: true }).click();
    await page.getByRole('button', { name: 'Tắt nhắc hạn task' }).click();
    await expect(page.getByRole('button', { name: 'Bật nhắc hạn task' })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Dự án', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Bật nhắc hạn task' })).toBeVisible();
  });

  test('thêm môn và lịch học, sửa/xóa buổi học, xem thời khóa biểu', async ({ page }) => {
    const courseName = `Môn ${stamp}`;
    await page.getByRole('button', { name: 'Học tập', exact: true }).click();
    await addCourseInUi(page, courseName);
    const course = page.getByRole('button', { name: new RegExp(courseName) });
    await course.click();
    await page.getByRole('button', { name: 'Thêm buổi học' }).click();
    await page.getByLabel('Bắt đầu', { exact: true }).fill('09:00');
    await page.getByLabel('Kết thúc', { exact: true }).fill('10:30');
    await page.getByLabel('Tiết bắt đầu').fill('1');
    await page.getByLabel('Tiết kết thúc').fill('3');
    await page.getByLabel('Địa điểm').fill('Cơ sở QA');
    await page.getByLabel('Phòng học').fill('A101');
    await page.getByRole('button', { name: 'Thêm lịch' }).click();
    await expect(page.getByText('Cơ sở QA')).toBeVisible();
    await page.getByRole('button', { name: 'Xem đầy đủ' }).click();
    await expect(page.locator('.weekly-timetable')).toBeVisible();

    await page.getByRole('button', { name: 'Sửa lịch học' }).click();
    await page.getByLabel('Phòng học').fill('A102');
    await page.getByRole('button', { name: 'Lưu lịch' }).click();
    await expect(page.locator('.session-location').filter({ hasText: 'A102' })).toBeVisible();
    await page.getByRole('button', { name: 'Xóa lịch học' }).click();
    await expect(page.getByText('Chưa có lịch lên lớp.')).toBeVisible();
  });

  test('tạo, sửa, hoàn tất/khôi phục và xóa bài tập', async ({ page }) => {
    const courseName = `Môn ${stamp}`;
    const assignmentName = `Bài tập ${stamp}`;
    const editedName = `Bài tập sửa ${stamp}`;
    await page.getByRole('button', { name: 'Học tập', exact: true }).click();
    await addCourseInUi(page, courseName);

    await page.getByRole('button', { name: 'Thêm bài tập' }).first().click();
    await page.getByLabel('Tên bài tập').fill(assignmentName);
    await page.getByLabel('Ngày nộp').fill(dateInDays(7));
    await page.getByLabel('Môn học').selectOption({ label: courseName });
    await page.locator('form.study-editor').filter({ has: page.getByLabel('Tên bài tập') })
      .getByRole('button', { name: 'Thêm bài tập' }).click();

    const row = page.locator('.assignment-panel .project-task').filter({ hasText: assignmentName });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: `Sửa bài tập ${assignmentName}` }).click();
    await page.getByLabel('Tên bài tập').fill(editedName);
    await page.locator('form.study-editor').filter({ has: page.getByLabel('Tên bài tập') })
      .getByRole('button', { name: 'Lưu thay đổi' }).click();

    const edited = page.locator('.assignment-panel .project-task').filter({ hasText: editedName });
    await edited.getByRole('button', { name: 'Đánh dấu hoàn thành' }).click();
    await expect(edited.getByText('Hoàn thành')).toBeVisible();
    await edited.getByRole('button', { name: 'Đánh dấu chưa hoàn thành' }).click();
    page.once('dialog', dialog => dialog.accept());
    await edited.getByRole('button', { name: `Xóa bài tập ${editedName}` }).click();
    await expect(edited).toHaveCount(0);
  });

  test('bấm giờ tự học, tạm dừng/tiếp tục và lưu study log', async ({ page }) => {
    await page.getByRole('button', { name: 'Học tập', exact: true }).click();
    await page.clock.install();
    await page.getByRole('button', { name: 'Ghi thời gian học' }).first().click();
    await page.getByLabel('Ghi chú').fill('Phiên học kiểm thử');
    await page.getByRole('button', { name: 'Bắt đầu bấm giờ' }).click();
    await page.clock.fastForward(16_000);
    await page.getByRole('button', { name: 'Tạm dừng' }).click();
    await page.getByRole('button', { name: 'Tiếp tục' }).click();
    await page.clock.fastForward(20_000);
    await page.getByRole('button', { name: 'Kết thúc & lưu' }).click();
    await expect(page.getByText('Phiên học kiểm thử')).toBeVisible();
  });

  test('sửa hồ sơ, chi hạt giống và điều hướng trên mobile', async ({ page }) => {
    await page.getByRole('button', { name: 'Cá nhân' }).click();
    await page.getByRole('button', { name: 'Chỉnh sửa hồ sơ' }).click();
    await page.getByLabel('Nơi ở').fill('TP. Hồ Chí Minh');
    await page.getByLabel('Giới thiệu').fill('Tài khoản kiểm thử LifeOS');
    await page.getByRole('button', { name: 'Lưu hồ sơ' }).click();
    await expect(page.getByText('TP. Hồ Chí Minh')).toBeVisible();
    await page.getByLabel('Số hạt giống').fill('1');
    await page.getByRole('button', { name: 'Gieo hạt giống' }).click();
    await expect(page.getByText(/Đã sử dụng hạt giống/)).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Mở menu' }).click();
    await expect(page.locator('.sidebar')).toHaveClass(/sidebar-open/);
    await page.getByRole('button', { name: 'Dự án', exact: true }).click();
    await expect(page.locator('.sidebar')).not.toHaveClass(/sidebar-open/);
  });
});

test.describe('API LifeOS', () => {
  test('health, đăng ký, đăng nhập sai, xác thực và thu hồi phiên', async ({ request }) => {
    const stamp = makeStamp();
    const email = `api-auth-${stamp}@example.test`;
    const health = await request.get(`${API_URL}/health`);
    expect(health.status()).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'ok', database: 'postgres' });
    expect((await request.get(`${API_URL}/api/profile`)).status()).toBe(401);

    const account = await registerApiUser(request, email, `API Auth ${stamp}`);
    const wrongLogin = await request.post(`${API_URL}/api/auth/login`, { data: { email, password: 'wrong-password' } });
    expect(wrongLogin.status()).toBe(401);
    await expect(apiJson(request, '/auth/me', account.token)).resolves.toMatchObject({ user: { email } });
    await apiJson(request, '/auth/logout', account.token, { method: 'POST', expectedStatus: 204 });
    const revoked = await request.get(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${account.token}` } });
    expect(revoked.status()).toBe(401);
  });

  test('CRUD dự án/task, validation và ngăn truy cập chéo tài khoản', async ({ request }) => {
    const stamp = makeStamp();
    const userA = await registerApiUser(request, `api-project-a-${stamp}@example.test`, `API A ${stamp}`);
    const userB = await registerApiUser(request, `api-project-b-${stamp}@example.test`, `API B ${stamp}`);
    const project = await apiJson<{ id: string }>(request, '/projects', userA.token, {
      method: 'POST', expectedStatus: 201, data: { title: `API project ${stamp}`, description: 'CRUD test' },
    });
    const task = await apiJson<{ id: string }>(request, `/projects/${project.id}/tasks`, userA.token, {
      method: 'POST', expectedStatus: 201, data: { title: `API task ${stamp}`, priority: 'High' },
    });
    await apiJson(request, `/projects/${project.id}/tasks/${task.id}`, userA.token, {
      method: 'PATCH', data: { title: `API task edited ${stamp}`, isDone: true, status: 'done' },
    });
    await expect(apiJson(request, `/projects/${project.id}`, userB.token)).rejects.toThrow();
    const invalidProject = await request.post(`${API_URL}/api/projects`, {
      headers: { Authorization: `Bearer ${userA.token}` }, data: { title: '   ' },
    });
    expect(invalidProject.status()).toBe(400);
    await apiJson(request, `/projects/${project.id}/tasks/${task.id}`, userA.token, { method: 'DELETE', expectedStatus: 204 });
    await apiJson(request, `/projects/${project.id}`, userA.token, { method: 'DELETE', expectedStatus: 204 });
  });

  test('CRUD tài nguyên học tập, quyền môn học, hồ sơ và trạng thái cá nhân', async ({ request }) => {
    const stamp = makeStamp();
    const userA = await registerApiUser(request, `api-study-a-${stamp}@example.test`, `API Study ${stamp}`);
    const userB = await registerApiUser(request, `api-study-b-${stamp}@example.test`, `API Other ${stamp}`);
    const course = await apiJson<{ id: string }>(request, '/study/courses', userA.token, {
      method: 'POST', expectedStatus: 201, data: { name: `API course ${stamp}`, code: 'API-1', semester: 'QA', status: 'Active' },
    });
    const resources: Array<{ path: string; body: Record<string, unknown>; patch: Record<string, unknown> }> = [
      { path: '/study/assignments', body: { title: `Assignment ${stamp}`, courseId: course.id, deadline: dateInDays(5), priority: 'Medium', status: 'Not Started' }, patch: { status: 'In Progress' } },
      { path: '/study/exams', body: { title: `Exam ${stamp}`, courseId: course.id, date: dateInDays(8), type: 'Midterm', weight: 30, prepProgress: 0 }, patch: { title: `Exam edited ${stamp}` } },
      { path: '/study/notes', body: { title: `Note ${stamp}`, courseId: course.id, content: 'Test note', date: dateInDays(0), tags: ['qa'] }, patch: { title: `Note edited ${stamp}` } },
      { path: '/study/schedule', body: { title: `Schedule ${stamp}`, time: '09:00', date: dateInDays(1), color: '#567' }, patch: { title: `Schedule edited ${stamp}` } },
      { path: '/study/course-sessions', body: { courseId: course.id, weekday: 1, startTime: '09:00', endTime: '10:00', periodStart: 1, periodEnd: 2, location: 'QA', room: 'A1' }, patch: { room: 'A2' } },
      { path: '/study/study-logs', body: { courseId: course.id, date: dateInDays(0), durationMinutes: 30, note: 'API study log' }, patch: { note: 'Updated API study log' } },
    ];
    const created: Array<{ path: string; id: string }> = [];
    for (const resource of resources) {
      const item = await apiJson<{ id: string }>(request, resource.path, userA.token, {
        method: 'POST', expectedStatus: 201, data: resource.body,
      });
      created.push({ path: resource.path, id: item.id });
      await apiJson(request, resource.path, userA.token);
      await apiJson(request, `${resource.path}/${item.id}`, userA.token, { method: 'PATCH', data: resource.patch });
    }

    const foreignCourse = await request.post(`${API_URL}/api/study/assignments`, {
      headers: { Authorization: `Bearer ${userB.token}` },
      data: { title: 'Foreign course assignment', courseId: course.id, deadline: dateInDays(2), priority: 'Low', status: 'Not Started' },
    });
    expect([400, 403, 404]).toContain(foreignCourse.status());
    const invalidSession = await request.post(`${API_URL}/api/study/course-sessions`, {
      headers: { Authorization: `Bearer ${userA.token}` },
      data: { courseId: course.id, weekday: 1, startTime: '10:00', endTime: '09:00', periodStart: 1, periodEnd: 2 },
    });
    expect(invalidSession.status()).toBe(400);

    await apiJson(request, '/profile', userA.token, {
      method: 'PATCH', data: { fullName: `API Updated ${stamp}`, location: 'QA City', bio: 'API profile test' },
    });
    await apiJson(request, '/personal/state', userA.token, {
      method: 'PUT', expectedStatus: 204, data: { growthXP: 5, streak: 2 },
    });
    const balance = (await apiJson<{ coins: number }>(request, '/personal/state', userA.token)).coins;
    const spent = await apiJson<{ coins: number }>(request, '/personal/coins/spend', userA.token, {
      method: 'POST', data: { amount: 1 },
    });
    expect(spent.coins).toBe(balance - 1);
    const summary = await apiJson<{ activeCourses: number; assignments: number }>(request, '/study/summary', userA.token);
    expect(summary.activeCourses).toBeGreaterThanOrEqual(1);
    expect(summary.assignments).toBeGreaterThanOrEqual(1);

    for (const item of created.reverse()) {
      await apiJson(request, `${item.path}/${item.id}`, userA.token, { method: 'DELETE', expectedStatus: 204 });
    }
    await apiJson(request, `/study/courses/${course.id}`, userA.token, { method: 'DELETE', expectedStatus: 204 });
  });
});
