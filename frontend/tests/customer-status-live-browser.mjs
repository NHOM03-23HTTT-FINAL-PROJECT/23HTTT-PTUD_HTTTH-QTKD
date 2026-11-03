// Full browser flow against the explicitly disposable test host and injected review source.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { QTKD_CUSTOMER_TEST_DISPOSABLE: disposable, QTKD_UI_MANAGER: manager, QTKD_UI_CUSTOMER_CODE: code,
  QTKD_PLAYWRIGHT_PACKAGE: pkg, QTKD_BROWSER_PATH: browserPath, QTKD_UI_SCREENSHOT: screenshot } = process.env;
if (disposable !== 'true' || !manager || !code || !pkg || !browserPath) throw new Error('Disposable host and synthetic test credentials are required');
const { chromium } = createRequire(import.meta.url)(pkg);
const browser = await chromium.launch({ headless: true, executablePath: browserPath });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:5173/');
  await page.locator('input[name="username"]').fill(manager);
  await page.locator('input[name="password"]').fill('Customer.Test@2026');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(u => !u.pathname.includes('dang-nhap'));
  await page.goto(`http://localhost:5173/khach-hang/${code}`);
  await page.getByRole('button', { name: 'Thao tác khác' }).click();
  await page.getByText('Tạm ngưng khách hàng', { exact: true }).click();
  await page.getByLabel('Nhóm lý do').selectOption('CONG_NO');
  await page.getByPlaceholder('Mô tả cụ thể lý do, kỳ công nợ, sự việc…').fill('Kiểm thử xử lý công nợ');
  await page.getByRole('button', { name: 'Tiếp tục rà soát' }).click();
  await page.getByText('Hợp đồng thử', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Xác nhận tạm ngưng', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByText('Yêu cầu thông báo được ghi nhận', { exact: false }).waitFor();
  await dialog.getByRole('button', { name: 'Xác nhận tạm ngưng', exact: true }).click();
  await page.getByText('Đã tạm ngưng khách hàng', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Thao tác khác' }).click();
  await page.getByText('Kích hoạt lại khách hàng', { exact: true }).click();
  await page.getByText('Căn cứ đã xác minh: Xác nhận Kế toán thử nghiệm').waitFor();
  await page.getByPlaceholder('Nhập lý do kích hoạt lại').fill('Công nợ đã được xác nhận xử lý');
  await page.getByRole('button', { name: 'Xác nhận kích hoạt lại', exact: true }).click();
  await page.getByText('Đã kích hoạt lại khách hàng', { exact: true }).waitFor();
  assert(await page.getByText('Hoạt động', { exact: true }).first().isVisible());
  if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });
  console.log('Suspension and reactivation completed through the UI with a controlled test review source.');
} finally { await browser.close(); }
