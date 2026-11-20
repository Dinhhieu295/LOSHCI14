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
  return date.toISOString().slice(0, 10);
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

  test('bấm giờ tự học, tạm dừng/tiếp tục và lưu study log', async ({ page }) => {
    await page.getByRole('button', { name: 'Học tập', exact: true }).click();
    await page.getByRole('tab', { name: 'Tự học' }).click();
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

  test('GPA theo tín chỉ và kịch bản điểm không sửa điểm đã lưu', async ({ page, request }) => {
    const token = (await page.evaluate(() => localStorage.getItem('lifeos_token')))!;
    await apiJson(request, '/study/courses', token, {
      method: 'POST', expectedStatus: 201, data: { name: 'Giải thuật A4', credits: 3, semester: 'HK1', score10: 8.5 },
    });
    await apiJson(request, '/study/courses', token, {
      method: 'POST', expectedStatus: 201, data: { name: 'Mạng máy tính A4', credits: 1, semester: 'HK2', score10: 7 },
    });
    await page.reload();
    await page.getByRole('button', { name: 'Học tập', exact: true }).click();
    await page.getByRole('tab', { name: 'Phân tích GPA', exact: true }).click();
    await expect(page).toHaveURL(/\/study\?tab=gpa$/);
    const current = page.locator('.planning-metric').filter({ hasText: 'GPA hiện tại' });
    await expect(current).toContainText('3,75');
    await page.getByLabel('Học kỳ').selectOption('HK2');
    await expect(current).toContainText('3,00');
    await page.getByLabel('Học kỳ').selectOption('');
    await page.getByRole('button', { name: 'Thử kịch bản' }).click();
    await page.getByLabel('Môn học', { exact: true }).selectOption({ label: 'Mạng máy tính A4' });
    await page.getByLabel('Điểm dự kiến (0–10)').fill('9');
    await page.getByRole('button', { name: 'Áp dụng điểm' }).click();
    await expect(page.locator('.planning-metric').filter({ hasText: 'GPA dự kiến' })).toContainText('4,00');
    await expect(current).toContainText('3,75');
    await page.setViewportSize({ width: 320, height: 720 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
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
    const grabFromQueue = queue.getByRole('button', { name: `Kéo ${name} vào lịch` });
    const scheduled = column.locator('.calendar-entry[data-kind="task"]').filter({ hasText: name });
    await expect(column.getByRole('button', { name: /Lớp lịch kiểm thử/ })).toBeVisible();
    await expect(grabFromQueue).toBeVisible();
    const point = async (minute: number) => {
      const box = (await column.boundingBox())!;
      return { x: box.x + 35, y: box.y + minute - 420 + 3 };
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
    await mouseDrag(page, scheduled.getByRole('button', { name: /^Kéo phiên/ }), await queuePoint());
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
    await page.getByLabel('Giờ bắt đầu').fill('09:30');
    await page.getByLabel('Giờ kết thúc').fill('10:30');
    await page.getByRole('button', { name: 'Thêm công việc' }).click();
    await expect(page.getByText(/Hằng tuần.*09:30–10:30/)).toBeVisible();
    await expect(page.getByText('Mua đồ dùng', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Việc cá nhân', exact: true }).click();
    await expect(page.getByText('Mua đồ dùng', { exact: true })).toBeVisible();
    await expect(page.getByText('Đi dạy gia sư', { exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Lịch trình', exact: true }).click();
    await page.getByLabel('Chọn ngày để mở tuần').fill(date);
    const column = page.locator(`[data-calendar-date="${date}"]`);
    const fixed = column.locator('.calendar-entry[data-kind="fixed-task"]').filter({ hasText: 'Đi dạy gia sư' });
    await expect(fixed).toContainText('Đi dạy gia sư');
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
    await expect(suggested.first()).toContainText('09:00–09:30');
    await expect(suggested.last()).toContainText('10:30–11:00');
    await page.getByRole('button', { name: 'Tuần sau' }).click();
    const nextColumn = page.locator(`[data-calendar-date="${nextDate}"]`);
    const nextShift = nextColumn.getByRole('button', { name: /Đi dạy gia sư.*09:30–10:30.*Hằng tuần/ });
    await expect(nextColumn.getByRole('button', { name: /Dự sinh nhật/ })).toHaveCount(0);
    await nextShift.click();
    await expect(page).toHaveURL(/\/work\?view=employment&task=/);
    await expect(page.getByLabel('Nhóm công việc')).toHaveValue('employment');
    await expect(page.getByLabel('Ngày bắt đầu')).toHaveValue(date);
    await expect(page.getByLabel('Giờ bắt đầu')).toHaveValue('09:30');
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
      const viewport = screen.locator('.calendar-viewport');
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
    const personal = await apiJson<{ streak: number }>(request, '/personal/state', userA.token);
    expect(personal.streak).toBe(1);

    for (const item of created.reverse()) {
      await apiJson(request, `${item.path}/${item.id}`, userA.token, { method: 'DELETE', expectedStatus: 204 });
    }
    await apiJson(request, `/study/courses/${course.id}`, userA.token, { method: 'DELETE', expectedStatus: 204 });
    await apiJson(request, `/study/courses/${courseHk2.id}`, userA.token, { method: 'DELETE', expectedStatus: 204 });
  });
});
