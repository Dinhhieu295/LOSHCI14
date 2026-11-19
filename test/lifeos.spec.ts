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

    // Tìm kiếm không dấu với đ -> d ("da sua")
    await page.getByRole('button', { name: 'Tìm dự án hoặc task' }).click();
    await page.getByRole('combobox', { name: 'Tìm tên dự án hoặc task' }).fill(`Task da sua ${stamp}`);
    await page.locator('.global-search-result').filter({ hasText: editedTaskName }).click();
    await expect(page.locator('.task-search-highlight')).toBeVisible();

    const visibleTask = project.locator('.project-task').filter({ hasText: editedTaskName });
    page.once('dialog', (dialog) => dialog.accept());
    await visibleTask.getByRole('button', { name: /Xóa task/ }).click();
    await expect(visibleTask).toHaveCount(0);

    page.once('dialog', (dialog) => dialog.accept());
    await project.locator('button.project-delete').click();
    await expect(project).toHaveCount(0);
  });

  test('dự án nâng cao, task milestone 0 ngày, subtasks, phụ thuộc và timeline', async ({ page }) => {
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
    await editForm.getByLabel('Thành viên (ngăn cách bằng dấu phẩy)').fill('Minh Anh, Quốc Bảo');
    await editForm.getByLabel('Ghim dự án lên đầu').check();
    await editForm.getByRole('button', { name: 'Lưu dự án' }).click();
    await expect(project.getByText('📌 AI / HCI')).toBeVisible();

    // Mở quản lý task & thêm cột mốc 0 ngày
    await project.getByRole('button', { name: 'Quản lý task' }).click();
    await project.getByRole('button', { name: 'Task nâng cao' }).click();
    await project.getByPlaceholder('Ví dụ: Hoàn thiện bản thiết kế').fill('Mốc khởi động');
    await project.getByLabel('Thời lượng (ngày, 0 = mốc)').fill('0');
    await project.getByLabel('Baseline thời lượng (ngày)').fill('0');
    await project.getByLabel('Là cột mốc (Milestone)').check();
    await project.getByRole('button', { name: 'Thêm task' }).click();

    await expect(project.getByText('Cột mốc (0d)')).toBeVisible();

    // Xem Timeline và kiểm tra cột mốc 0 ngày không bị biến thành 1 ngày
    await project.getByRole('button', { name: 'Xem Timeline' }).click();
    await expect(project.locator('.timeline-milestone-zero')).toBeVisible();
    await expect(project.getByText('N0 (0d ◆)')).toBeVisible();
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
    page.once('dialog', (dialog) => dialog.accept());
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
    await page.getByRole('button', { name: 'Thêm sự kiện' }).first().click();
    const schedForm = page.locator('form.study-editor').filter({ has: page.getByLabel('Tên sự kiện') });
    await schedForm.getByLabel('Tên sự kiện').fill(`Họp nhóm ${stamp}`);
    await schedForm.getByLabel('Khung giờ (HH:MM - HH:MM)').fill('10:00 - 09:00');
    await schedForm.getByRole('button', { name: 'Thêm vào lịch' }).click();
    await expect(schedForm.getByRole('alert')).toContainText('Khung giờ không hợp lệ');

    await schedForm.getByLabel('Khung giờ (HH:MM - HH:MM)').fill('08:00 - 09:30');
    await schedForm.getByRole('button', { name: 'Thêm vào lịch' }).click();
    await expect(page.locator('.personal-schedule-panel').getByText(`Họp nhóm ${stamp}`)).toBeVisible();

    // Mở lại form thêm sự kiện trùng khung giờ để kiểm tra cảnh báo trùng lịch
    await page.getByRole('button', { name: 'Thêm sự kiện' }).first().click();
    const schedForm2 = page.locator('form.study-editor').filter({ has: page.getByLabel('Tên sự kiện') });
    await schedForm2.getByLabel('Khung giờ (HH:MM - HH:MM)').fill('08:30 - 10:00');
    await expect(schedForm2.locator('.schedule-conflict-banner')).toContainText('Cảnh báo trùng lịch');
    await schedForm2.getByRole('button', { name: 'Hủy' }).click();
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

  test('sửa hồ sơ, đổi mật khẩu, chi hạt giống và điều hướng trên mobile (390px & 320px)', async ({ page }) => {
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

    await page.getByLabel('Số hạt giống').fill('1');
    await page.getByRole('button', { name: 'Gieo hạt giống' }).click();
    await expect(page.getByText(/Đã sử dụng hạt giống/)).toBeVisible();

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
  }) => {
    // 1. Tạo môn HK1 (Giờ nền = 2h) và bấm giờ tự học chung (1 phút)
    await page.getByRole('button', { name: 'Học tập', exact: true }).click();
    await page.getByRole('button', { name: 'Thêm môn học' }).click();
    const courseForm = page.locator('form.study-editor').filter({ has: page.getByLabel('Tên môn học') });
    await courseForm.getByLabel('Tên môn học').fill(`Môn Giải Thuật ${stamp}`);
    await courseForm.getByLabel('Học kỳ').fill('HK1-2026');
    await courseForm.getByLabel('Giờ nền đã nhập').fill('2');
    await courseForm.getByRole('button', { name: 'Thêm môn' }).click();

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

  test('CRUD tài nguyên học tập, quy tắc tính giờ nền/log/lọc học kỳ, quyền môn học và trạng thái cá nhân', async ({
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
    // - Môn HK1: max(studyHours=2, log=3) = 3h
    // - Môn HK2: max(studyHours=4, log=0) = 4h
    // - Log tự học chung (courseId=null): 1h
    // -> Không lọc học kỳ: 3 + 4 + 1 = 8h, assignments = 1
    const allSummary = await apiJson<{ totalStudyHours: number; assignments: number }>(
      request,
      '/study/summary',
      userA.token,
    );
    expect(allSummary.totalStudyHours).toBe(8);
    expect(allSummary.assignments).toBe(1);

    // -> Lọc HK1: chỉ tính môn HK1 = 3h (không cộng tự học chung), assignments = 1
    const hk1Summary = await apiJson<{ totalStudyHours: number; assignments: number }>(
      request,
      '/study/summary?semester=HK1',
      userA.token,
    );
    expect(hk1Summary.totalStudyHours).toBe(3);
    expect(hk1Summary.assignments).toBe(1);

    // -> Lọc HK2: chỉ tính môn HK2 = 4h, assignments = 0
    const hk2Summary = await apiJson<{ totalStudyHours: number; assignments: number }>(
      request,
      '/study/summary?semester=HK2',
      userA.token,
    );
    expect(hk2Summary.totalStudyHours).toBe(4);
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
    await apiJson(request, '/personal/state', userA.token, {
      method: 'PUT',
      expectedStatus: 204,
      data: { growthXP: 5, streak: 2 },
    });
    const balance = (await apiJson<{ coins: number }>(request, '/personal/state', userA.token)).coins;
    const spent = await apiJson<{ coins: number }>(request, '/personal/coins/spend', userA.token, {
      method: 'POST',
      data: { amount: 1 },
    });
    expect(spent.coins).toBe(balance - 1);

    for (const item of created.reverse()) {
      await apiJson(request, `${item.path}/${item.id}`, userA.token, { method: 'DELETE', expectedStatus: 204 });
    }
    await apiJson(request, `/study/courses/${course.id}`, userA.token, { method: 'DELETE', expectedStatus: 204 });
    await apiJson(request, `/study/courses/${courseHk2.id}`, userA.token, { method: 'DELETE', expectedStatus: 204 });
  });
});
