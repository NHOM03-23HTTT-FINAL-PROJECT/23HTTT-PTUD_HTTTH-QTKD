// Local customer UI -> production API -> isolated PostgreSQL. Never loads Supabase env.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const { QTKD_PLAYWRIGHT_PACKAGE: pkg, QTKD_BROWSER_PATH: executablePath, QTKD_UI_ARTIFACTS: output } = process.env;
const base = process.env.QTKD_UI_BASE ?? 'http://localhost:5174';
const port = Number(process.env.QTKD_CUSTOMER_TEST_PORT);
if (process.env.QTKD_CUSTOMER_TEST_DISPOSABLE !== 'true' || !pkg || !executablePath || !output ||
    new URL(base).hostname !== 'localhost' || !Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Explicit disposable local PostgreSQL and browser configuration required');
const { chromium } = createRequire(import.meta.url)(pkg);
const requireDb = createRequire(new URL('../../DB/package.json', import.meta.url));
const { Client } = requireDb('pg');
const bcrypt = requireDb('bcryptjs');
const db = new Client({ host: '127.0.0.1', port, database: 'qtkdtest', user: 'postgres', password: 'qtkd-test-only' });
const browser = await chromium.launch({ headless: true, executablePath });
const prefix = 'ui.' + randomUUID().slice(0, 8);
const password = 'Customer.Test@2026';
const results = []; const actors = {}; const contexts = []; const errors = [];
const tax = () => '7' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
await mkdir(output, { recursive: true });
async function check(name, page, body) {
  try { await body(); results.push({ name, passed: true }); console.log('PASS ' + name); }
  catch (error) {
    if (errors.length) console.log('Application errors: ' + JSON.stringify(errors));
    results.push({ name, passed: false, detail: error.message.slice(0, 1600) });
    await page?.screenshot({ path: join(output, 'failed-' + results.length + '.png'), fullPage: true });
    throw error;
  }
}
async function login(name) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); contexts.push(context);
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/dang-nhap');
  await page.locator('[name="username"]').fill(prefix + '.' + name);
  await page.locator('[name="password"]').fill(password);
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/auth/login' && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  const auth = await (await response).json();
  assert.equal(auth.user.id, actors[name].id, 'Browser API must use the explicit local database marker account');
  await page.waitForURL(u => !u.pathname.includes('dang-nhap'));
  return { page, context, token: auth.accessToken, id: auth.user.id };
}
async function fillDraft(page, name, taxCode) {
  await page.getByLabel(/^Tên khách hàng/).fill(name);
  await page.getByLabel(/^Mã số thuế/).fill(taxCode);
  await page.getByLabel(/^Địa chỉ/).fill('Địa chỉ được lưu qua API local');
  await page.getByLabel(/^Người đại diện/).fill('Người kiểm thử API');
  await page.getByLabel(/^Điện thoại/).fill('0901234567');
}
async function row(code) {
  return (await db.query('SELECT * FROM qtkd.customer WHERE customer_code=$1', [code])).rows[0];
}
async function seedCustomer(owner, status = 'Active') {
  const r = (await db.query(`INSERT INTO qtkd.customer(customer_name,tax_code,address,legal_representative,phone,account_manager_id,status)
    VALUES ($1,$2,'Local fixture','Người thử','0900000000',$3,$4::qtkd.active_status) RETURNING customer_code,customer_id`,
    ['Hồ sơ local ' + prefix, tax(), owner, status])).rows[0];
  if (status === 'Suspended') await db.query(`INSERT INTO qtkd.customer_status_decision(customer_id,decision_type,reason,confirmed_by,review_metadata)
    VALUES ($1,'Suspend','Lịch sử fixture local',$2,'{"reasonGroup":"CONG_NO","plan":[]}'::jsonb)`, [r.customer_id, actors.manager.id]);
  return r.customer_code;
}
async function mutation(actor, path, data) {
  const r = await actor.context.request.post(base + '/api/v1' + path, { data,
    headers: { Authorization: 'Bearer ' + actor.token, Origin: new URL(base).origin, 'X-QTKD-CSRF': '1' } });
  return { status: r.status(), data: await r.json() };
}
try {
  await db.connect();
  const hash = bcrypt.hashSync(password, 10);
  for (const [name,role,department] of [['staff','SalesStaff','KD'],['manager','SalesManager','KD'],['other','SalesStaff','KD'],['outside','OperationsStaff','KT']]) {
    const username = prefix + '.' + name;
    const r = await db.query(`INSERT INTO qtkd.user_account(username,company_email,password_hash,full_name,department_id,role,status,must_change_password)
      SELECT $1,$2,$3,$1,department_id,$4::qtkd.user_role,'Active',false FROM qtkd.department WHERE code=$5 RETURNING user_id`,
      [username,username+'@example.invalid',hash,role,department]);
    actors[name] = { id: r.rows[0].user_id };
  }
  const staff = await login('staff'); const lead = await login('manager');
  const page = staff.page; const manager = lead.page;
  const peer = await seedCustomer(actors.other.id);
  const hidden = await seedCustomer(actors.outside.id);
  const suspended = await seedCustomer(staff.id, 'Suspended');
  let code; const taxCode = tax(); const customerName = 'Khách tạo qua API ' + prefix;
  const writes = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/v1/customers') && ['POST','PATCH'].includes(request.method()))
      writes.push({ method: request.method(), path: new URL(request.url()).pathname, headers: request.headers(), body: request.postDataJSON() });
  });
  await check('API list loads local records and never prototype data', page, async () => {
    await page.goto(base + '/khach-hang?q=' + encodeURIComponent('Hồ sơ local ' + prefix));
    await page.getByRole('heading', { name: 'Danh sách khách hàng', exact: true }).waitFor();
    await page.getByRole('link', { name: peer, exact: true }).waitFor();
    assert.equal(await page.getByText('Vận tải Hoàng Long', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Chức năng chưa sẵn sàng', { exact: true }).count(), 0);
  });
  await check('create validation does not send invalid data', page, async () => {
    await page.goto(base + '/khach-hang/tao-moi');
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await page.getByText('Chưa thể lưu hồ sơ', { exact: true }).waitFor();
    assert.equal(writes.length, 0);
  });
  await check('create -> detail persists once in PostgreSQL with server owner and audit', page, async () => {
    await fillDraft(page, customerName, taxCode);
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await page.waitForURL(u => /^\/khach-hang\/KH-\d+$/.test(u.pathname));
    code = new URL(page.url()).pathname.split('/').at(-1);
    await page.getByRole('heading', { name: customerName, exact: true }).waitFor();
    const saved = await row(code);
    assert.equal(saved.tax_code, taxCode); assert.equal(saved.account_manager_id, staff.id); assert.equal(saved.status, 'Active');
    assert.equal(saved.version, 1);
    const request = writes.find(w => w.method === 'POST' && w.path.endsWith('/customers'));
    assert(request.headers['idempotency-key']); assert.equal(request.headers['x-qtkd-csrf'], '1');
    assert.deepEqual(Object.keys(request.body), ['draft']); assert.equal(request.body.userId, undefined);
    assert.equal(Number((await db.query("SELECT count(*) n FROM qtkd.audit_log WHERE entity_id=$1 AND action='CUSTOMER_CREATED'", [saved.customer_id])).rows[0].n), 1);
    await page.reload(); await page.getByRole('heading', { name: customerName, exact: true }).waitFor();
    await page.screenshot({ path: join(output, 'created-api.png'), fullPage: true });
  });
  await check('real search, empty result, status and pagination call the server', page, async () => {
    await page.goto(base + '/khach-hang?q=' + taxCode);
    await page.getByRole('link', { name: code, exact: true }).waitFor();
    assert.equal(await page.locator('.data-table__row:not(.data-table__row--head)').count(), 1);
    await page.getByPlaceholder('Tìm theo mã khách hàng, tên hoặc mã số thuế').fill('no-record-' + prefix);
    await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
    await page.getByText('Không tìm thấy khách hàng phù hợp', { exact: true }).waitFor();
    await page.goto(base + '/khach-hang?trang-thai=suspended');
    await page.getByRole('link', { name: suspended, exact: true }).waitFor();
    const paging = 'Paging ' + prefix;
    for (let i = 0; i < 10; i++) await db.query(
      "INSERT INTO qtkd.customer(customer_name,tax_code,address,legal_representative,phone,account_manager_id) VALUES ($1,$2,'Local paging','Người thử','0900000000',$3)",
      [paging + ' ' + i, tax(), staff.id]);
    await page.goto(base + '/khach-hang?q=' + encodeURIComponent(paging));
    await page.getByRole('button', { name: 'Trang 2', exact: true }).waitFor();
    assert.equal(await page.locator('.data-table__row:not(.data-table__row--head)').count(), 8);
    const next = page.waitForResponse(r => {
      const u = new URL(r.url()); return u.pathname === '/api/v1/customers' && u.searchParams.get('page') === '2';
    });
    await page.getByRole('button', { name: 'Trang 2', exact: true }).click();
    const result = await (await next).json(); assert.equal(result.total, 10); assert.equal(result.items.length, 2);
    await page.locator('button[aria-label="Trang 2"][aria-current="page"]').waitFor();
  });
  await check('duplicate tax is rejected by API and does not create another row', page, async () => {
    await page.goto(base + '/khach-hang/tao-moi'); await fillDraft(page, customerName + ' trùng', taxCode);
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await page.getByText('Khách hàng đã tồn tại – không tạo hồ sơ mới', { exact: true }).waitFor();
    assert.equal(Number((await db.query('SELECT count(*) n FROM qtkd.customer WHERE tax_code=$1', [taxCode])).rows[0].n), 1);
  });
  await check('edit persists version, reason and real history without changing tax', page, async () => {
    await page.goto(base + '/khach-hang/' + code + '/chinh-sua');
    assert(await page.getByLabel(/^Mã số thuế/).evaluate(el => el.readOnly || el.disabled));
    await page.getByLabel(/^Tên khách hàng/).fill(customerName + ' đã sửa');
    await page.getByLabel('Lý do hoặc căn cứ').fill('Cập nhật qua giao diện API');
    await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    await page.waitForURL(u => u.pathname === '/khach-hang/' + code);
    await page.getByRole('heading', { name: customerName + ' đã sửa', exact: true }).waitFor();
    assert.equal((await row(code)).version, 2); assert.equal((await row(code)).tax_code, taxCode);
    const patch = writes.find(w => w.method === 'PATCH');
    assert.equal(patch.body.baseVersion, 1); assert.equal(patch.body.draft.taxCode, undefined);
    await page.getByRole('tab', { name: 'Lịch sử', exact: true }).click();
    await page.getByText('Lý do: Cập nhật qua giao diện API', { exact: true }).waitFor();
  });
  await check('colleague can view but cannot edit; outside scope does not reveal data', page, async () => {
    await page.goto(base + '/khach-hang/' + peer);
    await page.getByRole('heading', { name: 'Hồ sơ local ' + prefix, exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Chỉnh sửa thông tin', exact: true }).count(), 0);
    await page.goto(base + '/khach-hang/' + peer + '/chinh-sua');
    await page.getByText('Không có quyền cập nhật', { exact: true }).waitFor();
    await page.goto(base + '/khach-hang/' + hidden);
    await page.getByRole('heading', { name: 'Không thể mở hồ sơ này', exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Hồ sơ local ' + prefix, exact: true }).count(), 0);
  });
  await check('two sessions detect conflict, reload latest and preserve independent edits', page, async () => {
    await page.goto(base + '/khach-hang/' + code + '/chinh-sua');
    await page.getByLabel(/^Tên khách hàng/).fill(customerName + ' đối chiếu');
    await page.getByLabel('Lý do hoặc căn cứ').fill('Giữ thay đổi của mình');
    await manager.goto(base + '/khach-hang/' + code + '/chinh-sua');
    await manager.getByLabel('Người liên hệ chính').fill('Liên hệ từ trưởng phòng');
    await manager.getByLabel('Lý do hoặc căn cứ').fill('Thay đổi song song');
    await manager.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    await manager.waitForURL(u => u.pathname === '/khach-hang/' + code);
    await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByText('Hồ sơ đã được người khác cập nhật', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Tải lại bản mới nhất và đối chiếu', exact: true }).click();
    assert.equal(await page.getByLabel(/^Tên khách hàng/).inputValue(), customerName + ' đối chiếu');
    assert.equal(await page.getByLabel('Người liên hệ chính').inputValue(), 'Liên hệ từ trưởng phòng');
    await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    await page.waitForURL(u => u.pathname === '/khach-hang/' + code);
    await page.getByRole('heading', { name: customerName + ' đối chiếu', exact: true }).waitFor();
    const saved = await row(code); assert.equal(saved.version, 4); assert.equal(saved.contact_name, 'Liên hệ từ trưởng phòng');
  });
  await check('related groups report actual unavailable/forbidden sources without mock records', page, async () => {
    await page.goto(base + '/khach-hang/' + code + '?tab=hop-dong');
    await page.getByText('Chưa kết nối danh sách hợp đồng', { exact: true }).waitFor();
    await page.getByRole('tab', { name: /^Bảng thanh toán/ }).click();
    await page.getByText('Chưa thể xem bảng thanh toán', { exact: true }).waitFor();
    assert.equal(await page.getByText('BTT-2026-015', { exact: true }).count(), 0);
  });
  await check('server failure shows retry and preserves authentication without mock fallback', page, async () => {
    const pattern = '**/api/v1/customers?*';
    await page.route(pattern, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"code":"DATABASE_UNAVAILABLE"}' }));
    await page.goto(base + '/khach-hang?q=' + taxCode);
    await page.getByText('Chưa truy xuất được danh sách khách hàng', { exact: true }).waitFor();
    assert(!page.url().includes('dang-nhap'));
    assert.equal(await page.locator('.data-table__row:not(.data-table__row--head)').count(), 0);
    await page.unroute(pattern);
    await page.getByRole('button', { name: /Thử lại/ }).click();
    await page.getByRole('link', { name: code, exact: true }).waitFor();
  });
  await check('lost create response retries the same key and creates one real customer', page, async () => {
    const lostTax = tax(); const lostName = 'Khách retry ' + prefix; const keys = []; let sends = 0;
    const pattern = '**/api/v1/customers';
    await page.route(pattern, async route => {
      if (route.request().method() !== 'POST') return route.continue();
      keys.push(route.request().headers()['idempotency-key']);
      if (++sends === 1) { const response = await route.fetch(); assert.equal(response.status(), 200); await route.abort('failed'); }
      else await route.continue();
    });
    await page.goto(base + '/khach-hang/tao-moi'); await fillDraft(page, lostName, lostTax);
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await page.getByText('Chưa nhận được kết quả lưu hồ sơ', { exact: true }).waitFor();
    assert.equal(await page.getByLabel(/^Tên khách hàng/).inputValue(), lostName);
    await page.getByRole('button', { name: 'Kiểm tra kết quả và thử lại', exact: true }).click();
    await page.getByRole('heading', { name: lostName, exact: true }).waitFor();
    assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]);
    assert.equal(Number((await db.query('SELECT count(*) n FROM qtkd.customer WHERE tax_code=$1', [lostTax])).rows[0].n), 1);
    await page.unroute(pattern);
  });
  await check('reactivation is connected, delegated by person, and blocked for missing real confirmation', page, async () => {
    await manager.goto(base + '/khach-hang');
    await manager.getByRole('link', { name: 'Ủy quyền kích hoạt lại', exact: true }).click();
    await manager.getByLabel('Nhân viên', { exact: false }).selectOption(staff.id);
    assert.equal(await manager.getByLabel('Thao tác được giao').inputValue(), 'Kích hoạt lại khách hàng');
    await manager.getByLabel('Hết hiệu lực lúc').fill('2020-01-01T00:00');
    await manager.getByRole('button', { name: 'Giao quyền', exact: true }).click();
    await manager.getByText('Thời điểm hết hạn phải ở trong tương lai.', { exact: true }).waitFor();
    await manager.getByLabel('Hết hiệu lực lúc').fill('');
    await manager.getByLabel('Ghi chú').fill('Kiểm thử UI API ' + prefix);
    const granting = manager.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/customers/delegations' && r.request().method() === 'POST');
    await manager.getByRole('button', { name: 'Giao quyền', exact: true }).click();
    const granted = await granting; assert.equal(granted.status(), 200); const grant = await granted.json();
    await manager.locator('.delegation-item').filter({ hasText: prefix + '.staff' }).waitFor();
    await page.goto(base + '/khach-hang/' + suspended + '/kich-hoat-lai');
    await page.getByText('Chưa đủ dữ liệu xác minh', { exact: true }).waitFor();
    assert(await page.getByRole('button', { name: 'Xác nhận kích hoạt lại', exact: true }).isDisabled());
    assert.equal((await row(suspended)).status, 'Suspended');
    await manager.locator('.delegation-item').filter({ hasText: prefix + '.staff' }).getByRole('button', { name: 'Thu hồi', exact: true }).click();
    const revoking = manager.waitForResponse(r => new URL(r.url()).pathname.endsWith('/delegations/' + grant.id + '/revoke'));
    await manager.getByRole('alertdialog').getByRole('button', { name: 'Thu hồi quyền', exact: true }).click();
    assert.equal((await revoking).status(), 200);
    await manager.getByText('Đã thu hồi quyền.', { exact: true }).waitFor();
    await page.reload();
    await page.getByText('Bạn không có quyền kích hoạt lại khách hàng này', { exact: true }).waitFor();
  });
  await check('ordinary employee cannot open delegation management or read its API', page, async () => {
    let requests = 0;
    const observe = r => { if (new URL(r.url()).pathname.startsWith('/api/v1/customers/delegations')) requests++; };
    page.on('request', observe);
    await page.goto(base + '/khach-hang/uy-quyen');
    await page.waitForURL(u => u.pathname === '/');
    assert.equal(await page.getByRole('heading', { name: 'Ủy quyền kích hoạt lại khách hàng', exact: true }).count(), 0);
    assert.equal(requests, 0); page.off('request', observe);
  });
  await check('removed suspension stays unavailable and never calls a removed write endpoint', manager, async () => {
    let calls = 0;
    manager.on('request', r => { if (new URL(r.url()).pathname.endsWith('/suspend')) calls++; });
    await manager.goto(base + '/khach-hang/' + code + '/tam-ngung');
    await manager.getByText('Chức năng tạm ngưng chưa sẵn sàng', { exact: true }).waitFor();
    assert.equal(calls, 0); assert.equal((await row(code)).status, 'Active');
  });
  await check('new Active customer is selectable for a real contract; Suspended is excluded', page, async () => {
    await page.goto(base + '/hop-dong/tao-moi');
    const picker = page.getByLabel(/^Khách hàng/);
    await picker.fill(code);
    await page.locator('.contract-customer-options button').filter({ hasText: code }).click();
    assert((await picker.inputValue()).includes(code));
    await picker.fill(suspended);
    await page.getByText('Không tìm thấy khách hàng', { exact: false }).first().waitFor();
    assert.equal(await page.locator('.contract-customer-options button').filter({ hasText: suspended }).count(), 0);
  });
  await check('no unhandled application errors', page, async () => assert.deepEqual(errors, []));
  await page.goto(base + '/khach-hang/' + code);
  await page.getByRole('heading', { name: customerName + ' đối chiếu', exact: true }).waitFor();
  await page.screenshot({ path: join(output, 'customer-api-final.png'), fullPage: true });
  console.log('PASS: ' + results.length + ' customer browser checks with real API and isolated PostgreSQL');
} finally {
  for (const context of contexts) await context.close();
  await browser.close(); await db.end();
  await writeFile(join(output, 'api-ui-report.json'), JSON.stringify({ source: 'local PostgreSQL via API; no controlled source provider', applicationErrors: errors, results }, null, 2));
}
