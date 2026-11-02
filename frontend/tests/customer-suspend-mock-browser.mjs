// UI regression for the review card using only the app's in-browser sample data.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { QTKD_PLAYWRIGHT_PACKAGE: pkg, QTKD_BROWSER_PATH: executablePath } = process.env;
if (!pkg || !executablePath) throw new Error('Playwright and browser paths are required');
const { chromium } = createRequire(import.meta.url)(pkg);
const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto('http://localhost:5174/');
    await page.locator('input[name="username"]').fill('hong.lt');
    await page.locator('input[name="password"]').fill('Abc@12345');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.waitForURL(u => !u.pathname.includes('dang-nhap'));
    await page.goto('http://localhost:5174/khach-hang/KH-000276/tam-ngung');
    await page.getByLabel('Nhóm lý do').selectOption(width === 1440 ? 'KHAC' : 'CONG_NO');
    await page.getByPlaceholder('Mô tả cụ thể lý do, kỳ công nợ, sự việc…').fill('Kiểm thử giao diện');
    await page.getByRole('button', { name: 'Tiếp tục rà soát' }).click();
    const card = page.locator('.impact-card');
    await card.waitFor();
    const box = await card.boundingBox();
    assert(box && box.height > 200, `Review card collapsed at viewport ${width}`);
    assert.equal(await card.locator('tbody tr').count(), 4);
    assert(await card.getByText('Lệnh nâng hạ LH-1029', { exact: false }).isVisible());
    if (width === 1440) {
      await page.getByRole('button', { name: 'Xác nhận tạm ngưng', exact: true }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Xác nhận tạm ngưng', exact: true }).click();
      await page.getByText('Đã tạm ngưng khách hàng', { exact: true }).waitFor();
      await page.goto('http://localhost:5174/khach-hang/KH-000276/kich-hoat-lai');
      await page.getByText('Chưa có xác nhận của Kế toán', { exact: true }).waitFor();
      assert.equal(await page.getByText(/Chưa có xác nhận của/).count(), 3);
      await page.getByRole('button', { name: 'Ghi nhận quyết định ngoại lệ' }).click();
      await page.getByPlaceholder('VD: QĐ-BGĐ-2026-018').fill('Văn bản chưa xác minh');
      await page.getByPlaceholder('VD: chấp thuận tiếp tục hợp tác, trả nợ theo lộ trình 3 tháng').fill('Nội dung thử');
      await page.getByRole('alertdialog').getByRole('button', { name: 'Ghi nhận', exact: true }).click();
      assert(await page.getByRole('button', { name: 'Xác nhận kích hoạt lại' }).isDisabled());
    }
    await page.close();
  }
  console.log('Suspension review card is visible at desktop and mobile widths (sample data).');
} finally { await browser.close(); }
