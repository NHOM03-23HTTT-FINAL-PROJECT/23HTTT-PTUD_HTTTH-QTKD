// Use only with the disposable local API/database prepared for customer tests.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomInt } from 'node:crypto';

if (process.env.QTKD_CUSTOMER_TEST_DISPOSABLE !== 'true') throw new Error('Disposable test environment required');
const { QTKD_UI_STAFF: staff, QTKD_UI_OTHER: other, QTKD_UI_MANAGER: manager, QTKD_UI_SUSPENDED_CODE: suspendedCode, QTKD_PLAYWRIGHT_PACKAGE: packagePath, QTKD_BROWSER_PATH: browserPath } = process.env;
if (!staff || !other || !manager || !suspendedCode || !packagePath || !browserPath) throw new Error('Synthetic test accounts, suspended customer, Playwright and browser paths are required');
const require = createRequire(import.meta.url);
const { chromium } = require(packagePath);
const browser = await chromium.launch({ headless: true, executablePath: browserPath });
const url = 'http://localhost:5173';
const password = 'Customer.Test@2026';
async function login(user, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('input[name="username"]').fill(user);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(u => !u.pathname.includes('dang-nhap'));
  return { page, context };
}
try {
  const { page, context } = await login(staff);
  await page.getByText('Bảng điều khiển chưa có dữ liệu thực tế').waitFor();
  assert.equal(await page.locator('.sidebar__badge, .topbar__unread').count(), 0);
  assert((await page.getByRole('link', { name: 'Tạo khách hàng', exact: true }).count()) > 0);
  await page.goto(`${url}/khach-hang/tao-moi`);
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await page.getByText('Chưa thể lưu hồ sơ').waitFor();
  const tax = '0' + String(randomInt(1000000000)).padStart(9, '0');
  const name = `Công ty Giao diện Ánh Dương ${tax}`;
  const originalContact = 'Nguyễn Văn Liên Hệ Ban Đầu Cũ';
  const updatedContact = 'Nguyễn Văn Liên Hệ Ban Đầu Mới';
  await page.getByPlaceholder('Tên đầy đủ theo đăng ký kinh doanh').fill(name);
  await page.getByPlaceholder('Nhập 10 hoặc 13 chữ số').fill(tax);
  await page.getByPlaceholder('Số nhà, đường, phường/xã, tỉnh/thành phố').fill('Địa chỉ kiểm thử');
  await page.getByPlaceholder('Họ và tên người đại diện').fill('Nguyễn Văn Thử');
  await page.getByPlaceholder('Họ và tên người liên hệ').fill(originalContact);
  await page.getByPlaceholder('VD: 0901234567 hoặc +84901234567').fill('0901234567');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await page.waitForURL(/\/khach-hang\/KH-\d+$/);
  await page.getByText('Tạo khách hàng thành công').waitFor();
  const customerPath = new URL(page.url()).pathname;
  assert.match(customerPath, /\/KH-\d{6,}$/);
  await page.getByText('Chưa kết nối dữ liệu của nhóm hồ sơ này.', { exact: true }).first().waitFor();
  await page.getByRole('tab', { name: 'Hợp đồng', exact: true }).click();
  await page.getByText('Chưa kết nối danh sách hợp đồng', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Thử lại', exact: true }).count(), 0);
  await page.getByRole('tab', { name: 'Bảng giá', exact: true }).click();
  await page.getByText('Chưa kết nối bảng giá', { exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Tổng quan', exact: true }).click();
  await page.getByRole('link', { name: 'Chỉnh sửa thông tin', exact: true }).click();
  await page.getByPlaceholder('Họ và tên người liên hệ').fill(updatedContact);
  await page.getByPlaceholder('Nhập lý do hoặc căn cứ thay đổi').fill('Cập nhật đầu mối liên hệ');
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await page.getByText('Đã cập nhật thông tin khách hàng').waitFor();
  await page.getByRole('tab', { name: 'Lịch sử', exact: true }).click();
  await page.getByText(`${originalContact} → ${updatedContact}`, { exact: false }).waitFor();
  await page.goto(`${url}/khach-hang/tao-moi`);
  await page.getByPlaceholder('Tên đầy đủ theo đăng ký kinh doanh').fill('Khách thử trùng mã số thuế');
  await page.getByPlaceholder('Nhập 10 hoặc 13 chữ số').fill(tax);
  await page.getByPlaceholder('Số nhà, đường, phường/xã, tỉnh/thành phố').fill('Địa chỉ kiểm thử');
  await page.getByPlaceholder('Họ và tên người đại diện').fill('Nguyễn Văn Thử');
  await page.getByPlaceholder('VD: 0901234567 hoặc +84901234567').fill('0901234567');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await page.getByText('Khách hàng đã tồn tại – không tạo hồ sơ mới').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Mở hồ sơ hiện có' }).count(), 0);
  await page.goto(`${url}/khach-hang`);
  await page.getByPlaceholder('Tìm theo mã khách hàng, tên hoặc mã số thuế').fill('giao dien anh duong');
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await page.getByText(name, { exact: true }).waitFor();
  if (process.env.QTKD_UI_CONTRACT_PICKER === 'true') {
    await page.goto(`${url}/hop-dong/tao-moi`);
    const picker = page.locator('#contract-customer');
    await picker.waitFor();
    await picker.fill(tax);
    await page.getByRole('button', { name: new RegExp(name) }).click();
    assert((await picker.inputValue()).includes(name));
    await picker.focus();
    await picker.fill('không có khách phù hợp');
    await page.getByText('Không tìm thấy khách hàng đang Hoạt động.').waitFor();
    await picker.press('Escape');
    assert.equal(await picker.inputValue(), '', 'Editing the search must clear the previously selected customer');
    await picker.fill(tax);
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await picker.focus();
    await page.getByRole('heading', { name: 'Tạo hợp đồng', exact: true }).click();
    assert.equal(await page.locator('.contract-customer-options').count(), 0, 'Customer choices should close when focus leaves');
    assert((await picker.inputValue()).includes(name));
    await page.getByRole('radio', { name: /Lập dự thảo mới/ }).click();
    await page.getByPlaceholder('Nhập tên hợp đồng').fill('Hợp đồng kiểm thử khách hàng');
    await page.getByPlaceholder('Chọn hoặc nhập loại hợp đồng').fill('Dịch vụ logistics');
    await page.locator('input[type="date"]').nth(0).fill('2026-11-04');
    await page.locator('input[type="date"]').nth(1).fill('2027-11-04');
    await page.getByPlaceholder('0', { exact: true }).fill('1000');
    await page.getByPlaceholder('VD: Chuyển khoản trong 30 ngày').fill('30 ngày');
    await page.getByRole('button', { name: '+ Thêm hạng mục dịch vụ', exact: true }).click();
    await page.locator('.contract-editor textarea').fill('Nội dung hợp đồng thử nghiệm');
    await page.getByRole('button', { name: 'Lưu nháp', exact: true }).click();
    await page.waitForURL(/\/hop-dong\/HD-[^/]+$/);
    await page.getByText(name, { exact: true }).first().waitFor();
  }
  await page.goto(`${url}/khach-hang/KH-000001`);
  await page.getByRole('heading', { name: 'Khách cũ thử nghiệm' }).waitFor();
  assert((await page.locator('body').innerText()).includes('Chưa có thông tin'));
  await context.close();

  if (process.env.QTKD_UI_CONTRACT_PICKER === 'true') {
    const mobile = await login(staff, { width: 390, height: 844 });
    await mobile.page.goto(url + customerPath);
    await mobile.page.getByText('Chưa kết nối dữ liệu của nhóm hồ sơ này.', { exact: true }).first().waitFor();
    const profileWidth = await mobile.page.evaluate(() => {
      const workspace = document.querySelector('.app-shell__workspace');
      return { page: document.documentElement.scrollWidth, viewport: innerWidth, content: workspace.scrollWidth, available: workspace.clientWidth };
    });
    assert(profileWidth.page <= profileWidth.viewport + 1 && profileWidth.content <= profileWidth.available + 1,
      `Mobile profile overflows horizontally: ${JSON.stringify(profileWidth)}`);
    if (process.env.QTKD_UI_MOBILE_SCREENSHOT) await mobile.page.screenshot({ path: process.env.QTKD_UI_MOBILE_SCREENSHOT, fullPage: true });
    await mobile.page.getByRole('button', { name: 'Mở menu điều hướng' }).click();
    const navigation = mobile.page.getByRole('navigation', { name: 'Điều hướng chính' });
    await navigation.waitFor({ state: 'visible' });
    await mobile.page.keyboard.press('Escape');
    const toggle = mobile.page.getByRole('button', { name: 'Mở menu điều hướng' });
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert(await toggle.evaluate((element) => document.activeElement === element));
    await toggle.click();
    await navigation.getByRole('link', { name: 'Danh sách khách hàng', exact: true }).click();
    await mobile.page.waitForURL(/\/khach-hang$/);
    assert.equal(await mobile.page.getByRole('button', { name: 'Mở menu điều hướng' }).getAttribute('aria-expanded'), 'false');
    await mobile.page.goto(`${url}/hop-dong/tao-moi`);
    const picker = mobile.page.locator('#contract-customer');
    await picker.fill(tax);
    await mobile.page.getByRole('button', { name: new RegExp(name) }).click();
    assert((await picker.inputValue()).includes(name));
    assert(await mobile.page.getByText('Dùng mẫu tham khảo', { exact: true }).isVisible());
    const dimensions = await mobile.page.evaluate(() => {
      const workspace = document.querySelector('.app-shell__workspace');
      return { viewport: innerWidth, page: document.documentElement.scrollWidth, content: workspace.scrollWidth, available: workspace.clientWidth };
    });
    assert(dimensions.page <= dimensions.viewport + 1 && dimensions.content <= dimensions.available + 1,
      `Mobile form overflows horizontally: ${JSON.stringify(dimensions)}`);
    await mobile.context.close();
  }

  const colleague = await login(other);
  await colleague.page.goto(url + customerPath);
  await colleague.page.getByRole('heading', { name }).waitFor();
  assert.equal(await colleague.page.getByRole('link', { name: 'Chỉnh sửa thông tin', exact: true }).count(), 0);
  assert.equal(await colleague.page.getByRole('link', { name: 'Quản lý người liên hệ', exact: true }).count(), 0);
  await colleague.page.goto(url + customerPath + '/chinh-sua');
  await colleague.page.getByText('Bạn chỉ được sửa khách hàng mình phụ trách.').waitFor();
  await colleague.context.close();

  const lead = await login(manager);
  await lead.page.getByText('Bảng điều khiển chưa có dữ liệu thực tế').waitFor();
  assert.equal(await lead.page.getByRole('link', { name: 'Tạo khách hàng', exact: true }).count(), 0);
  await lead.page.goto(url + customerPath);
  await lead.page.getByRole('button', { name: 'Thao tác khác' }).click();
  await lead.page.getByText('Tạm ngưng khách hàng', { exact: true }).click();
  await lead.page.getByLabel('Nhóm lý do').selectOption('CONG_NO');
  await lead.page.getByPlaceholder('Mô tả cụ thể lý do, kỳ công nợ, sự việc…').fill('Kiểm tra công nợ');
  await lead.page.getByRole('button', { name: 'Tiếp tục rà soát' }).click();
  await lead.page.getByText('Không tải được danh sách', { exact: false }).waitFor();
  assert((await lead.page.locator('body').innerText()).includes('Khách hàng vẫn giữ nguyên trạng thái'));
  assert(await lead.page.getByRole('button', { name: 'Xác nhận tạm ngưng' }).isDisabled());
  if (process.env.QTKD_UI_SCREENSHOT) await lead.page.screenshot({ path: process.env.QTKD_UI_SCREENSHOT, fullPage: true });
  if (process.env.QTKD_UI_REVIEW_CODE) {
    await lead.page.goto(`${url}/khach-hang/${encodeURIComponent(process.env.QTKD_UI_REVIEW_CODE)}/tam-ngung`);
    await lead.page.getByLabel('Nhóm lý do').selectOption('CONG_NO');
    await lead.page.getByPlaceholder('Mô tả cụ thể lý do, kỳ công nợ, sự việc…').fill('Kiểm tra hồ sơ liên quan');
    await lead.page.getByRole('button', { name: 'Tiếp tục rà soát' }).click();
    await lead.page.getByText('Hợp đồng của người phụ trách', { exact: true }).waitFor();
    await lead.page.getByText('Hợp đồng ngoài quyền nhân viên', { exact: true }).waitFor();
    assert(await lead.page.getByRole('button', { name: 'Xác nhận tạm ngưng' }).isDisabled());
    assert((await lead.page.locator('.impact-card').boundingBox()).height > 200);
  }
  await lead.page.goto(`${url}/khach-hang/${encodeURIComponent(suspendedCode)}`);
  await lead.page.getByText('Lý do thử nghiệm', { exact: true }).waitFor();
  await lead.page.goto(`${url}/khach-hang/${encodeURIComponent(suspendedCode)}/kich-hoat-lai`);
  await lead.page.getByText('Chưa đủ dữ liệu xác minh', { exact: true }).waitFor();
  assert(await lead.page.getByRole('button', { name: 'Xác nhận kích hoạt lại' }).isDisabled());
  assert((await lead.page.locator('body').innerText()).includes('Khách hàng vẫn Tạm ngưng'));
  await lead.context.close();
  console.log('Customer browser checks passed against the disposable API/database.');
} finally { await browser.close(); }
