import { expect, test } from '@playwright/test';

const WEB_URL = process.env.LIFEOS_WEB_URL ?? 'http://127.0.0.1:5173';
const API_URL = process.env.LIFEOS_API_URL ?? 'http://127.0.0.1:4000';
const password = 'LifeOS-Test-123!';
const makeStamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function dateInDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

test.describe('Kiểm thử chi tiết bổ sung theo KICH-BAN-KIEM-THU.md', () => {
  test('AUTH-02: Kiểm tra dữ liệu đăng ký sai trên UI', async ({ page }) => {
    await page.goto(WEB_URL);
    await page.getByRole('button', { name: 'Đăng ký ngay' }).click();

    // 1. Thử email sai định dạng
    await page.getByLabel('Họ và tên').fill('Tester');
    await page.getByLabel('Email').fill('not-an-email');
    await page.locator('input[autocomplete="new-password"]').first().fill('12345678');
    await page.locator('input[autocomplete="new-password"]').nth(1).fill('12345678');
    await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
    const isInvalid = await page.getByLabel('Email').evaluate((el: HTMLInputElement) => !el.checkValidity());
    expect(isInvalid).toBe(true);

    // 2. Mật khẩu dưới 8 ký tự
    await page.getByLabel('Email').fill('valid@example.com');
    await page.locator('input[autocomplete="new-password"]').first().fill('123');
    await page.locator('input[autocomplete="new-password"]').nth(1).fill('123');
    await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
    const isPwdInvalid = await page.locator('input[autocomplete="new-password"]').first().evaluate((el: HTMLInputElement) => !el.checkValidity());
    expect(isPwdInvalid).toBe(true);

    // 3. Xác nhận mật khẩu không khớp
    await page.locator('input[autocomplete="new-password"]').first().fill('LifeOS-123!');
    await page.locator('input[autocomplete="new-password"]').nth(1).fill('Different-123!');
    await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
    await expect(page.getByText('Mật khẩu nhập lại chưa khớp.').first()).toBeVisible();
  });

  test('AUTH-05: Hiện/ẩn mật khẩu', async ({ page }) => {
    await page.goto(WEB_URL);
    const pwdInput = page.locator('input[autocomplete="current-password"]');
    await pwdInput.fill('SecretPassword123');
    expect(await pwdInput.getAttribute('type')).toBe('password');

    // Bấm nút hiện mật khẩu
    await page.getByRole('button', { name: 'Hiện mật khẩu' }).click();
    expect(await pwdInput.getAttribute('type')).toBe('text');
    expect(await pwdInput.inputValue()).toBe('SecretPassword123');

    // Bấm lại để ẩn mật khẩu
    await page.getByRole('button', { name: 'Ẩn mật khẩu' }).click();
    expect(await pwdInput.getAttribute('type')).toBe('password');
    expect(await pwdInput.inputValue()).toBe('SecretPassword123');
  });

  test('DASH-02 & SEARCH-03: Tổng quan rỗng và tìm kiếm không kết quả', async ({ page }) => {
    const stamp = makeStamp();
    const email = `empty-${stamp}@example.test`;
    const name = `EmptyUser ${stamp}`;

    await page.goto(WEB_URL);
    await page.getByRole('button', { name: 'Đăng ký ngay' }).click();
    await page.getByLabel('Họ và tên').fill(name);
    await page.getByLabel('Email').fill(email);
    await page.locator('input[autocomplete="new-password"]').first().fill(password);
    await page.locator('input[autocomplete="new-password"]').nth(1).fill(password);
    await page.getByRole('button', { name: 'Tạo tài khoản' }).click();

    // DASH-02: Tổng quan rỗng
    await expect(page.getByText('Chưa có dự án nào')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tạo dự án' })).toBeVisible();

    // SEARCH-03: Không có kết quả tìm kiếm
    await page.getByRole('button', { name: 'Tìm dự án hoặc task' }).click();
    const searchInput = page.getByRole('combobox', { name: 'Tìm tên dự án hoặc task' });
    await searchInput.fill('ChuoiKhongTonTaiXYZ123');
    await expect(page.getByText('Không tìm thấy dự án, task hoặc học liệu phù hợp.')).toBeVisible();
  });

  test('REM-02 & REM-03: Task đến hạn ngày mai', async ({ page }) => {
    const stamp = makeStamp();
    const email = `rem-${stamp}@example.test`;
    const name = `RemUser ${stamp}`;

    await page.goto(WEB_URL);
    await page.getByRole('button', { name: 'Đăng ký ngay' }).click();
    await page.getByLabel('Họ và tên').fill(name);
    await page.getByLabel('Email').fill(email);
    await page.locator('input[autocomplete="new-password"]').first().fill(password);
    await page.locator('input[autocomplete="new-password"]').nth(1).fill(password);
    await page.getByRole('button', { name: 'Tạo tài khoản' }).click();

    // Tạo dự án & task đến hạn ngày mai
    await page.getByRole('button', { name: 'Dự án', exact: true }).click();
    await page.getByRole('button', { name: 'Tạo dự án' }).first().click();
    await page.getByPlaceholder('Tên dự án').fill(`Dự án Remind ${stamp}`);
    await page.locator('form.create-project').getByRole('button', { name: 'Tạo dự án' }).click();

    await page.getByRole('link', { name: `Dự án Remind ${stamp}`, exact: true }).click();
    await page.getByRole('button', { name: 'Thêm task' }).click();
    const form = page.getByRole('dialog', { name: 'Thêm task' });
    await form.getByLabel('Tên task').fill('Task Hạn Ngày Mai');
    await form.getByLabel('Ngày nộp').fill(dateInDays(1));
    await form.getByRole('button', { name: 'Tạo task' }).click();
    await expect(form).toHaveCount(0);
    await page.addInitScript(() => {
      Object.keys(localStorage).filter((key) => key.startsWith('lifeos:deadline-reminder:'))
        .forEach((key) => localStorage.removeItem(key));
    });

    // Reload trang để kích hoạt effect nhắc hạn
    await page.reload();
    // Verify toast nhắc hạn xuất hiện
    await expect(page.locator('.toast').filter({ hasText: /Nhắc hạn/ })).toBeVisible();
  });

  test('PROFILE-02 & PROFILE-03: Hủy sửa hồ sơ và kiểm tra validation API', async ({ page, request }) => {
    const stamp = makeStamp();
    const email = `prof-${stamp}@example.test`;
    const name = `ProfUser ${stamp}`;

    await page.goto(WEB_URL);
    await page.getByRole('button', { name: 'Đăng ký ngay' }).click();
    await page.getByLabel('Họ và tên').fill(name);
    await page.getByLabel('Email').fill(email);
    await page.locator('input[autocomplete="new-password"]').first().fill(password);
    await page.locator('input[autocomplete="new-password"]').nth(1).fill(password);
    await page.getByRole('button', { name: 'Tạo tài khoản' }).click();

    // PROFILE-02: Hủy sửa hồ sơ
    await page.getByRole('button', { name: 'Cá nhân' }).click();
    await page.getByRole('button', { name: 'Chỉnh sửa hồ sơ' }).click();
    await page.getByLabel('Nơi ở').fill('Nơi ở tạm thời');
    await page.getByRole('button', { name: 'Hủy' }).click();
    await expect(page.getByText('Nơi ở tạm thời')).toHaveCount(0);

    // PROFILE-03: Kiểm tra API từ chối profile sai
    const token = await page.evaluate(() => localStorage.getItem('lifeos_token'));
    const badProfileRes = await request.patch(`${API_URL}/api/profile`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { fullName: '   ', avatarUrl: 'invalid-url-format' },
    });
    expect(badProfileRes.status()).toBe(400);
  });
});
