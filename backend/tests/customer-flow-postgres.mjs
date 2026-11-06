// Run only against an explicitly disposable loopback PostgreSQL and local test API.
// This script creates synthetic users and records; it never deletes existing rows.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

if (process.env.QTKD_CUSTOMER_TEST_DISPOSABLE !== 'true') throw new Error('Explicit disposable test database acknowledgement required');
const port = Number(process.env.QTKD_CUSTOMER_TEST_PORT);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('A loopback test database port is required');
const requireDb = createRequire(new URL('../../DB/package.json', import.meta.url));
const { Client } = requireDb('pg');
const bcrypt = requireDb('bcryptjs');
const db = new Client({ host: '127.0.0.1', port, database: 'qtkdtest', user: 'postgres', password: 'qtkd-test-only' });
const apiOrigin = process.env.QTKD_CUSTOMER_TEST_API ?? 'http://127.0.0.1:7156';
if (new URL(apiOrigin).protocol !== 'http:' || new URL(apiOrigin).hostname !== '127.0.0.1')
  throw new Error('The disposable business API must use a loopback HTTP address');
const base = apiOrigin + '/api/v1';
const password = 'Customer.Test@2026';
const unique = randomUUID().replaceAll('-', '').slice(0, 10);
const names = Object.fromEntries(['staff', 'other', 'manager', 'accountant', 'outside'].map(x => [x, `cf.${unique}.${x}`]));
let previousSalesManager;

async function call(path, { token, key, body, method = 'GET' } = {}) {
  const headers = { Origin: 'http://localhost:5173', 'X-QTKD-CSRF': '1' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers['Idempotency-Key'] = key;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
}
function expect(response, status, code) {
  assert.equal(response.status, status, JSON.stringify(response.data));
  if (code) assert.equal(response.data?.code, code);
}

try {
  await db.connect();
  for (const [code, title] of [['KD', 'Kinh doanh'], ['KT', 'Khai thác'], ['KTOAN', 'Kế toán']])
    await db.query('INSERT INTO qtkd.department(department_name,code) VALUES($1,$2) ON CONFLICT(code) DO NOTHING', [title, code]);
  const hash = bcrypt.hashSync(password, 10);
  for (const [name, role, dept] of [['staff','SalesStaff','KD'], ['other','SalesStaff','KD'], ['manager','SalesManager','KD'], ['accountant','Accountant','KTOAN'], ['outside','OperationsStaff','KT']]) {
    await db.query(`INSERT INTO qtkd.user_account(username,company_email,password_hash,full_name,department_id,role,status,must_change_password)
      SELECT $1,$2,$3,$4,department_id,$5::qtkd.user_role,'Active',false FROM qtkd.department WHERE code=$6`,
      [names[name], `${names[name]}@example.invalid`, hash, `Thử nghiệm ${name}`, role, dept]);
  }
  const tokens = {};
  previousSalesManager = (await db.query("SELECT manager_id FROM qtkd.department WHERE code='KD'")).rows[0].manager_id;
  await db.query("UPDATE qtkd.department SET manager_id=(SELECT user_id FROM qtkd.user_account WHERE username=$1) WHERE code='KD'", [names.manager]);
  for (const name of ['staff', 'other', 'manager', 'accountant']) {
    const login = await call('/auth/login', { method: 'POST', body: { identifier: names[name], password } });
    expect(login, 200); tokens[name] = login.data.accessToken;
  }
  // Confirm the local API actually reads the explicitly supplied disposable DB
  // before issuing any customer mutations through HTTP.
  const markerTax = '8' + String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0');
  const marker = await db.query(`INSERT INTO qtkd.customer(customer_name,tax_code,address,legal_representative,phone,account_manager_id)
    SELECT $1,$2,'Địa chỉ thử','Người thử','0900000000',user_id FROM qtkd.user_account WHERE username=$3 RETURNING customer_code`,
    [`Marker ${unique}`, markerTax, names.staff]);
  const markerResponse = await call(`/customers?keyword=${markerTax}&status=all&sort=code-asc&page=1&size=8`, { token: tokens.staff });
  expect(markerResponse, 200);
  assert(markerResponse.data.items.some(item => item.code === marker.rows[0].customer_code), 'API does not use the disposable test database');
  expect(await call('/customers'), 401);
  expect(await call('/customers', { token: tokens.accountant }), 403);

  const tax = '0' + String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0');
  const draft = { name: `Công ty Ánh Dương ${unique}`, taxCode: tax, address: 'Bến cảng', representative: 'Nguyễn An',
    contactName: 'Minh', contactTitle: '', phone: '0912345678', email: 'test@example.invalid', customerGroup: 'XNK', serviceGroups: ['BOC_XEP'] };
  const createKey = randomUUID();
  const request = { token: tokens.staff, method: 'POST', key: createKey, body: { draft } };
  const [first, retry] = await Promise.all([call('/customers', request), call('/customers', request)]);
  expect(first, 200); expect(retry, 200);
  assert.equal(first.data.customer.code, retry.data.customer.code);
  assert.deepEqual([first.data.replayed, retry.data.replayed].sort(), [false, true]);
  const created = first.data.customer;
  assert.equal(created.taxCode, tax);
  expect(await call('/customers', { ...request, body: { draft: { ...draft, name: 'Nội dung khác' } } }), 409, 'IDEMPOTENCY_KEY_REUSED');
  expect(await call('/customers', { ...request, key: randomUUID() }), 409, 'DUPLICATE_TAX_CODE');
  expect(await call('/customers', { ...request, key: randomUUID(), body: { draft: { ...draft, taxCode: '123', phone: '', email: '' } } }), 400, 'VALIDATION');
  expect(await call('/customers', { ...request, key: undefined }), 400, 'IDEMPOTENCY_KEY_REQUIRED');
  for (const field of ['ownerId', 'status', 'code', 'version']) {
    expect(await call('/customers', { ...request, key: randomUUID(), body: { draft: { ...draft, [field]: 'tampered' } } }), 400, 'IMMUTABLE_FIELD');
  }
  const malformed = await fetch(base + '/customers', { method: 'POST', headers: { Authorization: `Bearer ${tokens.staff}`,
    'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: '{' });
  assert.equal(malformed.status, 400, 'Malformed JSON must be rejected as a client error');

  const list = await call(`/customers?keyword=${encodeURIComponent('anh duong')}&status=all&sort=name-asc&page=1&size=8`, { token: tokens.other });
  expect(list, 200); assert(list.data.items.some(x => x.code === created.code));
  expect(await call('/customers?page=0&size=8', { token: tokens.staff }), 400, 'INVALID_QUERY');
  expect(await call('/customers?page=1&size=999', { token: tokens.staff }), 400, 'INVALID_QUERY');
  expect(await call('/customers?status=invalid', { token: tokens.staff }), 400, 'INVALID_QUERY');
  const injection = await call('/customers?status=all&keyword=' + encodeURIComponent("' OR 1=1 --"), { token: tokens.staff });
  expect(injection, 200); assert.equal(injection.data.total, 0);
  expect(await call(`/customers/${created.code}`, { token: tokens.other }), 200);
  const { taxCode: _, ...editable } = draft;
  const changed = { ...editable, name: `${draft.name} mới` };
  const update = { method: 'PATCH', key: randomUUID(), body: { baseVersion: created.version, draft: changed, reason: 'Điều chỉnh tên liên hệ' } };
  expect(await call(`/customers/${created.code}`, { ...update, token: tokens.other }), 403, 'FORBIDDEN');
  expect(await call(`/customers/${created.code}`, { ...update, token: tokens.staff, body: { ...update.body, draft } }), 400, 'IMMUTABLE_FIELD');
  const saved = await call(`/customers/${created.code}`, { ...update, token: tokens.staff });
  expect(saved, 200); assert.equal(saved.data.customer.version, created.version + 1);
  const again = await call(`/customers/${created.code}`, { ...update, token: tokens.staff });
  expect(again, 200); assert.equal(again.data.replayed, true);
  expect(await call(`/customers/${created.code}`, { ...update, key: randomUUID(), token: tokens.staff }), 409, 'CONFLICT');
  expect(await call(`/customers/${created.code}`, { ...update, key: randomUUID(), token: tokens.staff,
    body: { ...update.body, baseVersion: saved.data.customer.version } }), 400, 'NO_CHANGES');
  const competing = [' A', ' B'].map(suffix => call(`/customers/${created.code}`, {
    ...update, key: randomUUID(), token: tokens.staff,
    body: { ...update.body, baseVersion: saved.data.customer.version, draft: { ...changed, name: changed.name + suffix } },
  }));
  const outcomes = await Promise.all(competing);
  assert.deepEqual(outcomes.map(x => x.status).sort(), [200, 409]);
  const current = outcomes.find(x => x.status === 200).data.customer;
  const managerDraft = { ...changed, name: current.name, contactName: 'Quản lý cập nhật' };
  expect(await call(`/customers/${created.code}`, { method: 'PATCH', key: randomUUID(), token: tokens.manager,
    body: { baseVersion: current.version, draft: managerDraft, reason: 'Cập nhật đầu mối' } }), 200);
  const audit = await db.query("SELECT action, count(*)::int AS count FROM qtkd.audit_log WHERE entity_id=(SELECT customer_id FROM qtkd.customer WHERE customer_code=$1) AND entity_type='Customer' GROUP BY action", [created.code]);
  assert.deepEqual(Object.fromEntries(audit.rows.map(r => [r.action, r.count])), { CUSTOMER_CREATED: 1, CUSTOMER_UPDATED: 3 });

  const outsideTax = '1' + String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0');
  const outside = await db.query(`INSERT INTO qtkd.customer(customer_name,tax_code,address,legal_representative,phone,account_manager_id)
    SELECT 'Ngoài phạm vi', $1, 'Địa chỉ thử', 'Người thử', '0900000000', user_id FROM qtkd.user_account WHERE username=$2 RETURNING customer_code`, [outsideTax, names.outside]);
  const hidden = await call(`/customers?keyword=${outsideTax}&status=all&sort=code-asc&page=1&size=8`, { token: tokens.staff });
  expect(hidden, 200); assert.equal(hidden.data.total, 0);
  expect(await call(`/customers/${outside.rows[0].customer_code}`, { token: tokens.staff }), 404, 'NOT_FOUND');
  const duplicateOutside = await call('/customers', { ...request, key: randomUUID(), body: { draft: { ...draft, taxCode: outsideTax } } });
  expect(duplicateOutside, 409, 'DUPLICATE_TAX_CODE'); assert.equal(duplicateOutside.data.detail.existing, null);

  const suspendedTax = '2' + String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0');
  const legacy = await db.query(`INSERT INTO qtkd.customer(customer_name,tax_code,address,legal_representative,phone,account_manager_id,status,customer_group,interested_services)
    SELECT 'Khách tạm ngưng', $1, 'Địa chỉ thử', 'Người thử', '0900000000', user_id, 'Suspended', 'Nhóm cũ', 'Dịch vụ cũ' FROM qtkd.user_account WHERE username=$2 RETURNING customer_code`, [suspendedTax, names.staff]);
  const legacyCode = legacy.rows[0].customer_code;
  const activeDefault = await call('/customers?keyword=' + suspendedTax, { token: tokens.staff });
  expect(activeDefault, 200); assert.equal(activeDefault.data.total, 0);
  const allStatuses = await call('/customers?keyword=' + suspendedTax + '&status=all', { token: tokens.staff });
  expect(allStatuses, 200); assert.equal(allStatuses.data.total, 1);
  await db.query(`INSERT INTO qtkd.customer_status_decision(customer_id,decision_type,reason,basis,follow_up_plan,confirmed_by)
    SELECT c.customer_id, 'Suspend', 'Lý do thử nghiệm', 'Căn cứ thử nghiệm', 'Phương án thử nghiệm', u.user_id
    FROM qtkd.customer c JOIN qtkd.user_account u ON u.username=$1 WHERE c.customer_code=$2`, [names.manager, legacyCode]);
  expect(await call('/customers', { ...request, key: randomUUID(), body: { draft: { ...draft, taxCode: suspendedTax } } }), 409, 'DUPLICATE_TAX_CODE');
  const legacyView = await call(`/customers/${legacyCode}`, { token: tokens.staff });
  expect(legacyView, 200); assert.equal(legacyView.data.legacyInterestedServices, 'Dịch vụ cũ');
  assert.equal(legacyView.data.statusDecisions[0].reason, 'Lý do thử nghiệm');
  const legacyDraft = { name: 'Khách tạm ngưng cập nhật', address: 'Địa chỉ thử', representative: 'Người thử', contactName: '', contactTitle: '',
    phone: '0900000000', email: '', customerGroup: 'Nhóm cũ', serviceGroups: ['BOC_XEP'] };
  const legacyUpdate = await call(`/customers/${legacyCode}`, { method: 'PATCH', key: randomUUID(), token: tokens.staff,
    body: { baseVersion: legacyView.data.version, draft: legacyDraft, reason: 'Cập nhật thông tin khách cũ' } });
  expect(legacyUpdate, 200); assert.equal(legacyUpdate.data.customer.status, 'suspended');
  assert.equal(legacyUpdate.data.customer.legacyInterestedServices, 'Dịch vụ cũ');
  expect(await call(`/customers/${legacyCode}/reactivate`, { token: tokens.manager, method: 'POST', key: randomUUID(),
    body: { baseVersion: legacyUpdate.data.customer.version, reason: 'Kiểm tra kích hoạt', evidence: [] } }), 503, 'REVIEW_INCOMPLETE');
  assert.equal((await call(`/customers/${legacyCode}`, { token: tokens.staff })).data.status, 'suspended');
  await assert.rejects(() => db.query('UPDATE qtkd.customer SET customer_code=$1 WHERE customer_code=$2', ['KH-999999', legacyCode]), e => e.code === '23514');
  await assert.rejects(() => db.query('UPDATE qtkd.customer SET tax_code=$1 WHERE customer_code=$2', ['9999999999', legacyCode]), e => e.code === '23514');
  const contractCodes = [];
  for (const [owner, title] of [[names.staff, 'Hợp đồng của người phụ trách'], [names.other, 'Hợp đồng ngoài quyền nhân viên']]) {
    const contract = await db.query(`INSERT INTO qtkd.contract(customer_id,title,contract_type,start_date,end_date,contract_value,payment_terms,content,status,owner_id,owning_department_id)
      SELECT c.customer_id,$1,'Logistics','2026-01-01','2027-01-01',1000,'30 ngày','Nội dung thử','Approved',u.user_id,u.department_id
      FROM qtkd.customer c JOIN qtkd.user_account u ON u.username=$2 WHERE c.customer_code=$3 RETURNING contract_code`, [title, owner, created.code]);
    contractCodes.push(contract.rows[0].contract_code);
  }
  // Real contract review is connected; missing operations sources are explicit dependencies.
  expect(await call(`/customers/${created.code}/suspension-review`, { token: tokens.staff }), 403, 'FORBIDDEN');
  const suspensionReview = await call(`/customers/${created.code}/suspension-review`, { token: tokens.manager });
  expect(suspensionReview, 200);
  assert.equal(suspensionReview.data.items.length, 2);
  assert(suspensionReview.data.missingSources.includes('operations_jobs'));
  assert(suspensionReview.data.missingSources.includes('unbilled_services'));
  const currentVersion = (await call(`/customers/${created.code}`, { token: tokens.manager })).data.version;
  expect(await call(`/customers/${created.code}/suspend`, { token: tokens.manager, method: 'POST', key: randomUUID(),
    body: { baseVersion: currentVersion, reasonGroup: 'KHAC', reason: 'Kiểm tra nguồn thật', evidence: [], plan: [],
      coordinationNote: '', reviewToken: suspensionReview.data.reviewToken } }), 503, 'REVIEW_INCOMPLETE');
  const staffId = (await db.query('SELECT user_id FROM qtkd.user_account WHERE username=$1', [names.staff])).rows[0].user_id;
  const suspendGrant = await call('/customers/delegations', { method: 'POST', token: tokens.manager,
    body: { granteeId: staffId, action: 'suspend' } });
  expect(suspendGrant, 200);
  const staffReview = await call(`/customers/${created.code}/suspension-review`, { token: tokens.staff });
  expect(staffReview, 200); assert.equal(staffReview.data.items.length, 1);
  assert(!JSON.stringify(staffReview.data).includes('Hợp đồng ngoài quyền nhân viên'));
  const statusPermission = await call(`/customers/${created.code}/status-permissions`, { token: tokens.staff });
  expect(statusPermission, 200); assert.equal(statusPermission.data.canSuspend, true); assert.equal(statusPermission.data.canReactivate, false);
  expect(await call(`/customers/delegations/${suspendGrant.data.id}/revoke`, { method: 'POST', token: tokens.manager, body: {} }), 200);
  expect(await call(`/customers/${created.code}/records/payments`, { token: tokens.staff }), 403, 'FORBIDDEN');
  expect(await call(`/customers/${created.code}/records/contracts`, { token: tokens.staff }), 503, 'SOURCE_UNAVAILABLE');
  expect(await call(`/customers/${created.code}/records/priceLists`, { token: tokens.staff }), 503, 'SOURCE_UNAVAILABLE');
  expect(await call(`/customers/${outside.rows[0].customer_code}/records/priceLists`, { token: tokens.staff }), 404, 'NOT_FOUND');
  assert.equal((await call(`/customers/${created.code}`, { token: tokens.staff })).data.status, 'active');

  for (let index = 0; index < 10; index++) {
    const pagingTax = '5' + String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0');
    await db.query(`INSERT INTO qtkd.customer(customer_name,tax_code,address,legal_representative,phone,account_manager_id)
      SELECT $1,$2,'Địa chỉ thử','Người thử','0900000000',user_id FROM qtkd.user_account WHERE username=$3`,
      [`Paging ${unique} ${index}`, pagingTax, names.staff]);
  }
  const query = `keyword=${encodeURIComponent(`paging ${unique}`)}&status=active&sort=code-asc&size=8`;
  const firstPage = await call(`/customers?${query}&page=1`, { token: tokens.staff });
  const secondPage = await call(`/customers?${query}&page=2`, { token: tokens.staff });
  expect(firstPage, 200); expect(secondPage, 200);
  assert.equal(firstPage.data.total, 10); assert.equal(secondPage.data.total, 10);
  assert.equal(firstPage.data.items.length, 8); assert.equal(secondPage.data.items.length, 2);
  assert.equal(new Set([...firstPage.data.items, ...secondPage.data.items].map(item => item.code)).size, 10);

  // Simulate administration revoking a role grant while a request is in flight.
  // This touches only the disposable DB and restores the grant even on failure.
  const revokedTax = '3' + String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0');
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(22023)');
    await db.query("DELETE FROM qtkd.role_permission WHERE role='SalesStaff' AND permission_code='customers.create'");
    const pending = call('/customers', { ...request, key: randomUUID(), body: { draft: { ...draft, taxCode: revokedTax } } });
    await new Promise(resolve => setTimeout(resolve, 200));
    await db.query('COMMIT');
    expect(await pending, 403, 'FORBIDDEN');
    const absent = await db.query('SELECT count(*)::int AS count FROM qtkd.customer WHERE tax_code=$1', [revokedTax]);
    assert.equal(absent.rows[0].count, 0);
  } finally {
    await db.query('ROLLBACK').catch(() => {});
    await db.query("INSERT INTO qtkd.role_permission(role,permission_code) VALUES ('SalesStaff','customers.create') ON CONFLICT DO NOTHING");
  }
  const service = await db.query("INSERT INTO qtkd.service(service_name,unit,requires_area) VALUES ('Dịch vụ kiểm thử quyền','lần',false) RETURNING service_code");
  const contractTitle = `Kiểm tra thu hồi quyền ${unique}`;
  const contractDraft = { customerCode: created.code, sourceMode: 'blank', templateCode: '', title: contractTitle,
    contractType: 'Logistics', effectiveFrom: '2026-11-01', effectiveTo: '2027-11-01', value: '1000',
    paymentTerm: '30 ngày', content: 'Nội dung thử', services: [{ id: 'test', serviceCode: service.rows[0].service_code,
      serviceName: 'Dịch vụ kiểm thử quyền', unit: 'lần', requiresArea: false, areaCode: '' }] };
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(22023)');
    await db.query("DELETE FROM qtkd.role_permission WHERE role='SalesStaff' AND permission_code='customers.view'");
    const pendingContract = call('/contracts', { method: 'POST', token: tokens.staff, key: randomUUID(), body: { draft: contractDraft } });
    await new Promise(resolve => setTimeout(resolve, 200));
    await db.query('COMMIT');
    const result = await pendingContract;
    assert([403, 409].includes(result.status), JSON.stringify(result.data));
    const absent = await db.query('SELECT count(*)::int AS count FROM qtkd.contract WHERE title=$1', [contractTitle]);
    assert.equal(absent.rows[0].count, 0);
  } finally {
    await db.query('ROLLBACK').catch(() => {});
    await db.query("INSERT INTO qtkd.role_permission(role,permission_code) VALUES ('SalesStaff','customers.view') ON CONFLICT DO NOTHING");
  }
  // Customer selection after merging main: Active and visible can create a real Draft;
  // Suspended and out-of-scope customers must not become new contract references.
  const options = await call('/contracts/form-options', { token: tokens.staff });
  expect(options, 200);
  assert(options.data.customers.some(c => c.code === created.code));
  assert(!options.data.customers.some(c => c.code === legacyCode || c.code === outside.rows[0].customer_code));
  const validContract = await call('/contracts', { method: 'POST', token: tokens.staff, key: randomUUID(), body: { draft: contractDraft } });
  expect(validContract, 200); assert.equal(validContract.data.contract.status, 'draft');
  expect(await call('/contracts', { method: 'POST', token: tokens.staff, key: randomUUID(),
    body: { draft: { ...contractDraft, customerCode: legacyCode } } }), 409, 'CUSTOMER_INACTIVE');
  expect(await call('/contracts', { method: 'POST', token: tokens.staff, key: randomUUID(),
    body: { draft: { ...contractDraft, customerCode: outside.rows[0].customer_code } } }), 409, 'CUSTOMER_INACTIVE');
  console.log('Customer API business checks passed on disposable PostgreSQL.');
  console.log(`Local browser test user: ${names.staff}`);
  console.log(`Local browser test manager: ${names.manager}`);
  console.log(`Local suspended test customer: ${legacyCode}`);
  console.log(`Local customer with review contracts: ${created.code}`);
} finally {
  if (previousSalesManager !== undefined) await db.query("UPDATE qtkd.department SET manager_id=$1 WHERE code='KD'", [previousSalesManager]);
  await db.end();
}
