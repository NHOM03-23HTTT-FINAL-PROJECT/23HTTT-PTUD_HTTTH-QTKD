// Run only with the explicitly disposable local API/database and synthetic accounts.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { QTKD_CUSTOMER_TEST_DISPOSABLE: disposable, QTKD_UI_MANAGER: manager, QTKD_UI_STAFF: staff,
  QTKD_UI_OTHER: other, QTKD_UI_REVIEW_CODE: ownCode, QTKD_UI_SUSPENDED_CODE: suspendedCode,
  QTKD_PLAYWRIGHT_PACKAGE: pkg, QTKD_BROWSER_PATH: browserPath } = process.env;
if (disposable !== 'true' || !manager || !staff || !other || !ownCode || !suspendedCode || !pkg || !browserPath)
  throw new Error('Disposable host and synthetic accounts are required');
const { chromium } = createRequire(import.meta.url)(pkg);
const browser = await chromium.launch({ headless: true, executablePath: browserPath });
const base = 'http://localhost:5173';
async function login(username, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(base);
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill('Customer.Test@2026');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.includes('dang-nhap'));
  return { context, page };
}
async function openCustomer(page, code) {
  const response = page.waitForResponse((r) => r.url().includes(`/customers/${code}/status-permissions`) && r.status() === 200);
  await page.goto(`${base}/khach-hang/${code}`); await response;
}
async function grantOnPage(page, action) {
  await page.getByLabel('Nhân viên').selectOption({ label: `Thử nghiệm staff (${staff})` });
  await page.getByLabel('Thao tác được giao').selectOption(action);
  await page.getByLabel('Ghi chú').fill('Giao quyền để kiểm thử');
  await page.getByRole('button', { name: 'Giao quyền', exact: true }).click();
  await page.getByText('Đã giao quyền. Quyền chỉ áp dụng cho khách hàng nhân viên đang phụ trách.').waitFor();
}
try {
  const lead = await login(manager);
  await lead.page.goto(`${base}/khach-hang`);
  await lead.page.getByRole('link', { name: 'Ủy quyền trạng thái' }).click();
  await lead.page.getByRole('heading', { name: 'Ủy quyền trạng thái khách hàng' }).waitFor();
  await grantOnPage(lead.page, 'suspend');
  const grantRow = lead.page.locator('.delegation-item').filter({ hasText: staff }).filter({ hasText: 'Tạm ngưng khách hàng' }).filter({ hasText: 'Còn hiệu lực' });
  await grantRow.waitFor();

  const employee = await login(staff);
  await openCustomer(employee.page, ownCode);
  await employee.page.getByRole('button', { name: 'Thao tác khác' }).click();
  await employee.page.getByRole('menuitem', { name: /Tạm ngưng khách hàng/ }).waitFor();
  assert.equal(await employee.page.getByRole('menuitem', { name: /Kích hoạt lại khách hàng/ }).count(), 0);
  await employee.page.goto(`${base}/khach-hang/${ownCode}/kich-hoat-lai`);
  await employee.page.getByText('Bạn không có quyền kích hoạt lại khách hàng này').waitFor();
  await openCustomer(employee.page, 'KH-000001');
  assert.equal(await employee.page.getByRole('button', { name: 'Thao tác khác' }).count(), 0);
  await employee.page.goto(`${base}/khach-hang/KH-000001/tam-ngung`);
  await employee.page.getByText('Bạn không có quyền tạm ngưng khách hàng này').waitFor();

  const colleague = await login(other);
  await colleague.page.goto(`${base}/khach-hang/${ownCode}/tam-ngung`);
  await colleague.page.getByText('Bạn không có quyền tạm ngưng khách hàng này').waitFor();
  await colleague.context.close();

  // The same management flow must work without horizontal overflow on a phone viewport.
  const mobileLead = await login(manager, { width: 390, height: 844 });
  await mobileLead.page.goto(`${base}/khach-hang/uy-quyen`);
  const mobileRow = mobileLead.page.locator('.delegation-item').filter({ hasText: staff }).filter({ hasText: 'Tạm ngưng khách hàng' }).filter({ hasText: 'Còn hiệu lực' });
  await mobileRow.getByRole('button', { name: 'Thu hồi', exact: true }).click();
  await mobileLead.page.getByRole('alertdialog').getByRole('button', { name: 'Thu hồi quyền', exact: true }).click();
  await mobileLead.page.getByText('Đã thu hồi quyền.').waitFor();
  const overflow = await mobileLead.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert.equal(overflow, false, 'Delegation page must fit a phone viewport');

  await openCustomer(employee.page, ownCode);
  await employee.page.getByRole('button', { name: 'Thao tác khác' }).click();
  assert.equal(await employee.page.getByRole('menuitem', { name: /Tạm ngưng khách hàng/ }).count(), 0);
  await employee.page.goto(`${base}/khach-hang/${ownCode}/tam-ngung`);
  await employee.page.getByText('Bạn không có quyền tạm ngưng khách hàng này').waitFor();

  await grantOnPage(mobileLead.page, 'reactivate');
  await openCustomer(employee.page, suspendedCode);
  await employee.page.getByRole('button', { name: 'Thao tác khác' }).click();
  await employee.page.getByRole('menuitem', { name: /Kích hoạt lại khách hàng/ }).waitFor();
  assert.equal(await employee.page.getByRole('menuitem', { name: /Tạm ngưng khách hàng/ }).count(), 0);
  await employee.page.getByRole('menuitem', { name: /Kích hoạt lại khách hàng/ }).click();
  await employee.page.getByText('Chưa đủ dữ liệu xác minh', { exact: true }).waitFor();
  assert(await employee.page.getByRole('button', { name: 'Xác nhận kích hoạt lại' }).isDisabled());
  await employee.context.close(); await lead.context.close(); await mobileLead.context.close();
  console.log('Individual grant, ownership, direct navigation, revocation and phone layout passed. Real review data remains incomplete.');
} finally { await browser.close(); }
