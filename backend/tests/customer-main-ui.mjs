// Exercises the unmodified main UI in mock mode. No Supabase, email or external writes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const { QTKD_PLAYWRIGHT_PACKAGE: pkg, QTKD_BROWSER_PATH: executablePath, QTKD_UI_ARTIFACTS: output } = process.env;
if (!pkg || !executablePath || !output) throw new Error('Explicit Playwright, browser and artifact paths are required');
const { chromium } = createRequire(import.meta.url)(pkg);
const browser = await chromium.launch({ headless: true, executablePath });
const base = process.env.QTKD_UI_BASE ?? 'http://localhost:5173';
const results = [];
await mkdir(output, { recursive: true });
async function check(name, page, body) {
  try { await body(); results.push({ name, outcome: 'passed' }); console.log('PASS ' + name); }
  catch (error) {
    results.push({ name, outcome: 'failed', detail: error.message.slice(0, 1200) });
    console.log('FAIL ' + name + ': ' + error.message.split('\n')[0]);
    await page.screenshot({ path: join(output, 'failure-' + results.length + '.png'), fullPage: true });
  }
}
async function login(page, name) {
  await page.goto(base + '/dang-nhap');
  await page.locator('input[name="username"]').fill(name);
  await page.locator('input[name="password"]').fill('Abc@12345');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(u => !u.pathname.includes('dang-nhap'));
}
async function draft(page, name, tax) {
  await page.getByLabel(/^Tên khách hàng/).fill(name);
  await page.getByLabel(/^Mã số thuế/).fill(tax);
  await page.getByLabel(/^Địa chỉ/).fill('Bến cảng thử nghiệm');
  await page.getByLabel(/^Người đại diện/).fill('Người thử nghiệm');
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await login(page, 'an.nv');
  const tax = '7' + String(Date.now()).slice(-9);
  const name = 'Khách UI ' + Date.now();
  let code;
  await check('create validation: empty fields and missing contact', page, async () => {
    await page.goto(base + '/khach-hang/tao-moi');
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await page.getByText('Chưa thể lưu hồ sơ', { exact: true }).waitFor();
    await draft(page, name, tax);
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await page.getByText('Nhập điện thoại hoặc email (ít nhất một).', { exact: true }).first().waitFor();
  });
  await check('create success and persisted detail', page, async () => {
    await page.getByLabel(/^Điện thoại/).fill('0901234567');
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await page.waitForURL(u => /^\/khach-hang\/KH-\d+$/.test(u.pathname));
    code = new URL(page.url()).pathname.split('/').at(-1);
    await page.getByRole('heading', { name, exact: true }).waitFor();
    await page.screenshot({ path: join(output, 'created-main.png'), fullPage: true });
  });
  if (code) {
    await check('edit immutable tax, save reason and history', page, async () => {
      await page.goto(base + '/khach-hang/' + code + '/chinh-sua');
      assert(await page.getByLabel(/^Mã số thuế/).evaluate(el => el.readOnly || el.disabled));
      await page.getByLabel(/^Tên khách hàng/).fill(name + ' cập nhật');
      await page.getByLabel('Lý do hoặc căn cứ').fill('Kiểm thử lịch sử giao diện');
      await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
      await page.waitForURL(u => u.pathname === '/khach-hang/' + code);
      await page.getByRole('tab', { name: /Lịch sử/ }).click();
      await page.getByText('Lý do: Kiểm thử lịch sử giao diện', { exact: true }).first().waitFor();
    });
    await check('tax duplicate is rejected in prototype', page, async () => {
      await page.goto(base + '/khach-hang/tao-moi');
      await draft(page, name + ' trùng', tax);
      await page.getByLabel(/^Điện thoại/).fill('0901234567');
      await page.getByRole('button', { name: 'Lưu', exact: true }).click();
      await page.getByText('Mã số thuế đã tồn tại trong danh mục khách hàng.', { exact: true }).first().waitFor();
      assert(new URL(page.url()).pathname.endsWith('tao-moi'));
    });
    await check('search by tax and empty result', page, async () => {
      await page.goto(base + '/khach-hang?q=' + tax + '&trang-thai=all');
      await page.getByRole('link', { name: code, exact: true }).waitFor();
      assert.equal(await page.getByRole('table').getByRole('row').count(), 2); // header + one matching customer
      await page.getByPlaceholder('Tìm theo mã khách hàng, tên hoặc mã số thuế').fill('not-found-' + Date.now());
      await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
      await page.getByText('Không tìm thấy khách hàng phù hợp', { exact: true }).waitFor();
    });
  }
  await check('profile record tabs load and switch', page, async () => {
    await page.goto(base + '/khach-hang/KH-000276');
    for (const label of ['Hợp đồng', 'Bảng giá', 'Bảng thanh toán', 'Lịch sử']) {
      const tab = page.getByRole('tab', { name: new RegExp('^' + label) });
      await tab.click(); assert.equal(await tab.getAttribute('aria-selected'), 'true');
    }
    await page.screenshot({ path: join(output, 'profile-main.png'), fullPage: true });
  });
  await check('frontend has no unhandled application errors', page, async () => assert.deepEqual(errors, []));
  await context.close();

  for (const width of [1440, 390]) {
    const c = await browser.newContext({ viewport: { width, height: 900 } });
    const p = await c.newPage(); p.setDefaultTimeout(12000); await login(p, 'hong.lt');
    if (width === 1440) await check('list pagination and status filter', p, async () => {
      await p.goto(base + '/khach-hang?trang-thai=all');
      await p.getByRole('button', { name: 'Trang 2', exact: true }).click();
      await p.waitForURL(u => u.searchParams.get('trang') === '2');
      await p.locator('button[aria-label="Trang 2"][aria-current="page"]').waitFor();
      assert.equal(await p.getByRole('button', { name: 'Trang 2', exact: true }).getAttribute('aria-current'), 'page');
      await p.getByRole('radio', { name: 'Tạm ngưng', exact: true }).click();
      await p.waitForURL(u => u.searchParams.get('trang-thai') === 'suspended');
      await p.getByRole('radio', { name: 'Tạm ngưng', checked: true, exact: true }).waitFor();
      assert.equal(await p.getByRole('radio', { name: 'Tạm ngưng', exact: true }).getAttribute('aria-checked'), 'true');
    });
    await check('suspension review renders at width ' + width + ' (mock only)', p, async () => {
      await p.goto(base + '/khach-hang/KH-000276/tam-ngung');
      await p.getByLabel('Nhóm lý do').selectOption('KHAC');
      await p.getByPlaceholder('Mô tả cụ thể lý do, kỳ công nợ, sự việc…').fill('Kiểm thử giao diện main');
      await p.getByRole('button', { name: 'Tiếp tục rà soát' }).click();
      const card = p.locator('.impact-card'); await card.waitFor();
      assert.equal(await card.locator('tbody tr').count(), 4);
      await p.screenshot({ path: join(output, 'suspension-main-' + width + '.png'), fullPage: true });
      const box = await card.boundingBox();
      assert(box && box.height > 200, 'Review card is collapsed: height=' + box?.height);
      assert(await card.getByText('Lệnh nâng hạ LH-1029 · Bến 2', { exact: true }).isVisible());
    });
    if (width === 1440) {
      await check('suspend confirmation still exists in main prototype', p, async () => {
        await p.getByRole('button', { name: 'Xác nhận tạm ngưng', exact: true }).click();
        await p.getByRole('alertdialog').getByRole('button', { name: 'Xác nhận tạm ngưng', exact: true }).click();
        await p.getByText('Đã tạm ngưng khách hàng', { exact: true }).waitFor();
      });
      await check('reactivation with verified sample conditions', p, async () => {
        await p.goto(base + '/khach-hang/KH-000233/kich-hoat-lai');
        await p.getByLabel('Lý do kích hoạt lại').fill('Đã xác nhận đủ điều kiện mẫu');
        await p.getByRole('group', { name: /^Căn cứ xác nhận đủ điều kiện/ }).locator('input[type="file"]').setInputFiles({
          name: 'sample-only.pdf', mimeType: 'application/pdf', buffer: Buffer.from('sample-ui-fixture'),
        });
        await p.getByRole('button', { name: 'Xác nhận kích hoạt lại', exact: true }).click();
        await p.getByText('Đã kích hoạt lại khách hàng', { exact: true }).waitFor();
      });
    } else {
      await check('phone content fits the viewport in main', p, async () => {
        const size = await p.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
        assert(size.document <= size.viewport + 1, 'Horizontal overflow: document=' + size.document + ', viewport=' + size.viewport);
      });
    }
    await c.close();
  }
} finally {
  await browser.close();
  await writeFile(join(output, 'report.json'), JSON.stringify({ frontend: 'origin/main unchanged', mode: 'mock', results }, null, 2));
}
console.log(JSON.stringify({ passed: results.filter(r => r.outcome === 'passed').length, failed: results.filter(r => r.outcome === 'failed').length }));
if (results.some(r => r.outcome === 'failed')) process.exitCode = 1;
