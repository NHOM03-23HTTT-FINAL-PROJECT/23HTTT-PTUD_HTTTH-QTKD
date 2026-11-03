import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { hash } from 'bcryptjs';
import { buildSeedData, ids } from '../prisma/seed-data.ts';
import { readSchema } from '../scripts/schema-info.ts';

// Disposable PostgreSQL in WASM only. DIRECT_URL and DB/.env are never read by this test.
const dbRoot = fileURLToPath(new URL('..', import.meta.url));
const repo = resolve(dbRoot, '..');
const db = await PGlite.create();
let server,
  child,
  logs = '';
const tempRoot = await mkdtemp(join(tmpdir(), 'qtkd-contract-test-'));
const signingKey = randomBytes(48).toString('hex');
const unassignedLegalId = randomUUID();
const password = `Aa1!${randomBytes(18).toString('hex')}`;
const freePort = () =>
  new Promise((resolvePort, reject) => {
    const socket = createServer();
    socket.on('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const port = socket.address().port;
      socket.close(() => resolvePort(port));
    });
  });
let passed = 0;
const pass = (name) => {
  passed++;
  console.log(`PASS ${name}`);
};
try {
  for (const name of (await readdir(join(dbRoot, 'prisma/migrations'))).sort()) {
    if (!name.startsWith('20')) continue;
    await db.exec(await readFile(join(dbRoot, 'prisma/migrations', name, 'migration.sql'), 'utf8'));
  }
  pass('all migrations execute on PostgreSQL');
  const data = buildSeedData(await hash(password, 12));
  const models = readSchema();
  // Seed only data required by this feature, in dependency order. No live session or OTP fixture is used.
  const groups = [
    'roleDefinition',
    'permission',
    'rolePermission',
    'department',
    'userAccount',
    'service',
    'area',
    'customer',
    'contract',
    'contractItem',
    'approvalRound',
    'approvalStep',
  ];
  for (const delegate of groups) {
    const model = models.find((m) => m.delegate === delegate);
    for (const raw of data[delegate]) {
      if (delegate === 'approvalRound' && raw.recordType !== 'Contract') continue;
      if (
        delegate === 'approvalStep' &&
        !data.approvalRound.some((r) => r.recordType === 'Contract' && r.roundId === raw.roundId)
      )
        continue;
      const row = { ...raw };
      if (delegate === 'department') row.managerId = null;
      if (delegate === 'userAccount') row.mustChangePassword = false;
      const fields = model.fields.filter((f) => f.column && row[f.name] !== undefined);
      const values = fields.map((f) => (f.type === 'Json' ? JSON.stringify(row[f.name]) : row[f.name]));
      await db.query(
        `INSERT INTO qtkd."${model.table}" (${fields.map((f) => `"${f.column}"`).join(',')}) VALUES (${fields.map((_, i) => `$${i + 1}`).join(',')}) ON CONFLICT DO NOTHING`,
        values,
      );
    }
  }
  for (const row of data.department)
    await db.query('UPDATE qtkd.department SET manager_id=$2 WHERE department_id=$1', [
      row.departmentId,
      row.managerId,
    ]);
  await db.query(
    "INSERT INTO qtkd.user_account(user_id,username,company_email,password_hash,full_name,department_id,role,must_change_password) SELECT $1,'demo.legal.unassigned','unassigned@example.invalid',password_hash,'Legal Unassigned',department_id,role,false FROM qtkd.user_account WHERE user_id=$2",
    [unassignedLegalId, ids.legalStaff],
  );
  const dbPort = await freePort(),
    apiPort = await freePort();
  server = new PGLiteSocketServer({ db, port: dbPort, host: '127.0.0.1' });
  await server.start();
  child = spawn(
    'dotnet',
    [
      process.env.QTKD_CONTRACT_API_DLL ?? join(repo, 'backend/src/QTKD.Api/bin/Debug/net10.0/QTKD.Api.dll'),
      '--urls',
      `http://127.0.0.1:${apiPort}`,
    ],
    {
      cwd: join(repo, 'backend/src/QTKD.Api'),
      windowsHide: true,
      env: {
        ...process.env,
        ASPNETCORE_ENVIRONMENT: 'Testing',
        ConnectionStrings__Identity: `Host=127.0.0.1;Port=${dbPort};Database=postgres;Username=postgres;SSL Mode=Disable;Pooling=false;Timeout=5;Command Timeout=10`,
        Storage__Root: tempRoot,
        Jwt__SigningKey: signingKey,
        Jwt__Issuer: 'contract-test-identity',
        Jwt__Audience: 'contract-test-api',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stdout.on('data', (chunk) => {
    logs += chunk;
  });
  child.stderr.on('data', (chunk) => {
    logs += chunk;
  });
  const base = `http://127.0.0.1:${apiPort}/api/v1`;
  for (let n = 0; n < 80; n++) {
    try {
      if ((await fetch(`http://127.0.0.1:${apiPort}/api/health`)).ok) break;
    } catch {}
    if (child.exitCode !== null) throw new Error(`API exited: ${logs}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  async function call(path, token, method = 'GET', body, key) {
    const headers = new Headers();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (key) headers.set('Idempotency-Key', key);
    if (body && !(body instanceof FormData)) headers.set('Content-Type', 'application/json');
    const response = await fetch(base + path, {
      method,
      headers,
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    });
    const result = response.status === 204 ? null : await response.json().catch(() => null);
    return { status: response.status, body: result };
  }
  const fixtureSessions = new Map();
  for (const username of ['demo.sales', 'demo.sales.manager', 'demo.board', 'demo.legal.unassigned']) {
    const userId =
      username === 'demo.legal.unassigned'
        ? unassignedLegalId
        : data.userAccount.find((u) => u.username === username).userId;
    const sid = randomUUID();
    await db.query(
      `INSERT INTO qtkd.login_session(session_id,user_id,refresh_token_hash,logout_token_hash,last_activity_at,expires_at)
      VALUES($1,$2,$3,$4,now(),now()+interval '1 hour')`,
      [sid, userId, randomBytes(32).toString('hex'), randomBytes(32).toString('hex')],
    );
    fixtureSessions.set(username, { userId, sid });
  }
  function tokenFor(username, expired = false) {
    const { userId, sid } = fixtureSessions.get(username);
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
      sub: userId,
      sid,
      iss: 'contract-test-identity',
      aud: 'contract-test-api',
      exp: Math.floor(Date.now() / 1000) + (expired ? -120 : 3600),
    })}`;
    return `${unsigned}.${createHmac('sha256', signingKey).update(unsigned).digest('base64url')}`;
  }
  assert.equal((await call('/contracts')).status, 401);
  pass('anonymous contract access is rejected');
  const sales = tokenFor('demo.sales'),
    manager = tokenFor('demo.sales.manager'),
    board = tokenFor('demo.board'),
    legal = tokenFor('demo.legal.unassigned');
  assert.equal((await call('/contracts', legal)).body.total, 0);
  pass('legal role without assignment sees no contracts');
  const options = (await call('/contracts/form-options', sales)).body;
  const emptyFilters = await call(
    '/contracts?keyword=&status=&areaCode=&contractType=&page=1&size=10&view=all',
    sales,
  );
  assert.equal(emptyFilters.status, 200, JSON.stringify(emptyFilters.body));
  const defaultList = await call('/contracts', sales);
  assert.deepEqual(emptyFilters.body, defaultList.body);
  assert.equal((await call('/contracts?status=invalid', sales)).status, 422);
  assert.equal((await call('/contracts?keyword=&view=', sales)).status, 200);
  pass('empty optional list filters load normally while invalid status is rejected');
  assert.equal(options.customers.length, 1);
  assert(!options.areas.some((a) => a.code === 'DEMO-B02'));
  const draft = {
    customerCode: options.customers[0].code,
    sourceMode: 'blank',
    templateCode: '',
    title: 'Integration contract',
    contractType: 'Dịch vụ logistics',
    effectiveFrom: '2026-11-02',
    effectiveTo: '2026-11-02',
    value: '123.456',
    paymentTerm: '30 ngày',
    content: 'Nội dung thử nghiệm',
    services: [{ id: 'line-1', ...options.services[0], areaCode: 'DEMO-B01' }],
  };
  const bad = structuredClone(draft);
  const duplicateItems = structuredClone(draft);
  duplicateItems.services = [0, 1].map(() => ({ ...draft.services[0], requiresArea: true, areaCode: '' }));
  for (const malformed of [duplicateItems, { ...draft, services: [null] }]) {
    const invalid = await call('/contracts', sales, 'POST', { draft: malformed }, randomUUID());
    assert.equal(invalid.status, 422, JSON.stringify(invalid.body));
    assert.equal(invalid.body.code, 'VALIDATION');
    assert(invalid.body.fieldErrors.services);
  }
  pass('duplicate IDs and null service elements return validation errors rather than 500');
  bad.services[0].areaCode = '';
  bad.services[0].requiresArea = false;
  const missing = await call('/contracts', sales, 'POST', { draft: bad }, randomUUID());
  assert.equal(missing.status, 422);
  assert(missing.body.fieldErrors.serviceAreas['line-1']);
  pass('server rejects missing area even when the client forges requiresArea=false');
  const inactive = structuredClone(draft);
  inactive.services[0].areaCode = 'DEMO-B02';
  assert.equal(
    (await call('/contracts', sales, 'POST', { draft: inactive }, randomUUID())).body.code,
    'AREA_INACTIVE',
  );
  assert.equal(
    (await call('/contracts', sales, 'POST', { draft: { ...draft, value: '-12' } }, randomUUID())).status,
    422,
  );
  pass('inactive areas and invalid money cannot create a contract');
  const key = randomUUID();
  const created = await call('/contracts', sales, 'POST', { draft, userId: ids.admin }, key);
  assert.equal(created.status, 200, JSON.stringify(created.body));
  let contract = created.body.contract;
  assert.equal(contract.ownerId, ids.salesStaff);
  assert.equal(contract.status, 'draft');
  assert.equal(contract.value, 123456);
  assert.equal((await call('/contracts', sales, 'POST', { draft }, key)).body.replayed, true);
  assert.equal(
    (await call('/contracts', sales, 'POST', { draft: { ...draft, title: 'different' } }, key)).status,
    409,
  );
  pass('create sets server-side owner, accepts same-day dates and replays the exact request only');
  assert.equal((await call(`/contracts/${contract.code}`, board)).status, 404);
  assert(
    (await call('/contracts?areaCode=DEMO-B01', sales)).body.items.some((c) => c.code === contract.code),
  );
  pass('scope is enforced for direct links and area filtering');
  const updated = await call(`/contracts/${contract.code}`, sales, 'PUT', {
    baseVersion: contract.version,
    draft: { ...draft, title: 'Updated' },
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  const staleVersion = contract.version;
  contract = updated.body;
  assert.equal(
    (await call(`/contracts/${contract.code}`, sales, 'PUT', { baseVersion: staleVersion, draft })).status,
    409,
  );
  assert.equal(
    (await call(`/contracts/${contract.code}`, manager, 'PUT', { baseVersion: contract.version, draft }))
      .status,
    403,
  );
  pass('updates require ownership and reject stale versions');
  // PGlite socket exposes one backend. Multi-connection concurrency requires PostgreSQL.
  const form = new FormData();
  form.set('baseVersion', String(contract.version));
  form.set('file', new Blob(['%PDF-1.7 integration'], { type: 'application/pdf' }), 'test.pdf');
  const upload = await call(`/contracts/${contract.code}/attachments`, sales, 'POST', form, randomUUID());
  assert.equal(upload.status, 200, JSON.stringify(upload.body));
  contract = upload.body.contract;
  const download = await fetch(
    base + `/contracts/${contract.code}/attachments/${contract.attachments[0].id}`,
    { headers: { Authorization: `Bearer ${sales}` } },
  );
  assert.equal(download.status, 200);
  assert.equal(await download.text(), '%PDF-1.7 integration');
  assert.equal(
    (await call(`/contracts/${contract.code}/attachments/${contract.attachments[0].id}`, board)).status,
    404,
  );
  pass('file bytes upload/download require contract scope');
  const cancelKey = randomUUID();
  const cancelled = await call(
    `/contracts/${contract.code}/cancel`,
    sales,
    'POST',
    { baseVersion: contract.version, reason: 'Không còn nhu cầu' },
    cancelKey,
  );
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.equal(cancelled.body.contract.status, 'cancelled');
  assert.equal(
    (
      await call(
        `/contracts/${contract.code}/cancel`,
        sales,
        'POST',
        { baseVersion: contract.version, reason: 'Không còn nhu cầu' },
        cancelKey,
      )
    ).body.replayed,
    true,
  );
  assert.equal(
    (
      await call(`/contracts/${contract.code}`, sales, 'PUT', {
        baseVersion: cancelled.body.contract.version,
        draft,
      })
    ).status,
    409,
  );
  pass('draft cancellation is audited, idempotent and terminal');
  const submittedCode = (
    await db.query('SELECT contract_code FROM qtkd.contract WHERE contract_id=$1', [ids.submittedContract])
  ).rows[0].contract_code;
  let submitted = (await call(`/contracts/${submittedCode}`, sales)).body;
  const requested = await call(
    `/contracts/${submittedCode}/cancellation-requests`,
    sales,
    'POST',
    { baseVersion: submitted.version, party: 'customer', reason: 'Khách hàng đề nghị' },
    randomUUID(),
  );
  assert.equal(requested.status, 200, JSON.stringify(requested.body));
  submitted = requested.body.contract;
  assert.equal(
    (
      await call(
        `/contracts/${submittedCode}/cancellation-requests`,
        sales,
        'POST',
        { baseVersion: submitted.version, party: 'company', reason: 'Duplicate pending' },
        randomUUID(),
      )
    ).status,
    409,
  );
  let req = submitted.cancellationRequests[0];
  assert(
    [403, 404].includes(
      (
        await call(
          `/contracts/${submittedCode}/cancellation-requests/${req.id}/decision`,
          board,
          'POST',
          { baseVersion: req.version, approve: true, reason: '' },
          randomUUID(),
        )
      ).status,
    ),
  );
  const rejected = await call(
    `/contracts/${submittedCode}/cancellation-requests/${req.id}/decision`,
    manager,
    'POST',
    { baseVersion: req.version, approve: false, reason: 'Tiếp tục thực hiện' },
    randomUUID(),
  );
  assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
  assert.equal(rejected.body.contract.status, 'submitted');
  assert.equal(rejected.body.contract.cancellationRequests[0].status, 'rejected');
  pass('cancellation decisions require the assigned approver; rejection preserves the contract status');
  // Test an Approved document with no signature. This is isolated fixture setup, not a workflow implementation.
  await db.query("UPDATE qtkd.contract SET status='Approved' WHERE contract_id=$1", [ids.submittedContract]);
  submitted = (await call(`/contracts/${submittedCode}`, sales)).body;
  const approvedRequest = await call(
    `/contracts/${submittedCode}/cancellation-requests`,
    sales,
    'POST',
    { baseVersion: submitted.version, party: 'company', reason: 'Dừng hợp tác trước ký' },
    randomUUID(),
  );
  assert.equal(approvedRequest.status, 200, JSON.stringify(approvedRequest.body));
  req = approvedRequest.body.contract.cancellationRequests[0];
  const first = await call(
    `/contracts/${submittedCode}/cancellation-requests/${req.id}/decision`,
    manager,
    'POST',
    { baseVersion: req.version, approve: true, reason: 'Đồng ý trình' },
    randomUUID(),
  );
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.contract.status, 'approved');
  req = first.body.contract.cancellationRequests[0];
  assert.equal(req.status, 'pending-board');
  const final = await call(
    `/contracts/${submittedCode}/cancellation-requests/${req.id}/decision`,
    board,
    'POST',
    { baseVersion: req.version, approve: true, reason: 'Chấp thuận' },
    randomUUID(),
  );
  assert.equal(final.status, 200, JSON.stringify(final.body));
  assert.equal(final.body.contract.status, 'cancelled');
  assert.equal((await db.query('SELECT count(*)::int n FROM qtkd.contract_delivery')).rows[0].n, 2);
  assert.equal(
    (await db.query('SELECT result FROM qtkd.approval_round WHERE round_id=$1', [ids.currentRound])).rows[0]
      .result,
    'Withdrawn',
  );
  pass('Approved cancellation needs both decisions and durably queues customer notices');
  const revisionCreated = await call(
    '/contracts',
    sales,
    'POST',
    { draft: { ...draft, title: 'Revision fixture' } },
    randomUUID(),
  );
  const revisionCode = revisionCreated.body.contract.code;
  await db.query("UPDATE qtkd.contract SET status='RevisionRequested' WHERE contract_code=$1", [
    revisionCode,
  ]);
  let revision = (await call(`/contracts/${revisionCode}`, sales)).body;
  assert.equal(
    (await call(`/contracts/${revisionCode}`, sales, 'PUT', { baseVersion: revision.version, draft })).status,
    200,
  );
  revision = (await call(`/contracts/${revisionCode}`, sales)).body;
  assert.equal(
    (
      await call(
        `/contracts/${revisionCode}/cancellation-requests`,
        sales,
        'POST',
        { baseVersion: revision.version, party: 'company', reason: 'Dừng bản đang sửa' },
        randomUUID(),
      )
    ).status,
    200,
  );
  assert.equal(
    (await call(`/contracts/${revisionCode}`, sales, 'PUT', { baseVersion: revision.version, draft })).body
      .code,
    'CANCELLATION_PENDING',
  );
  pass('RevisionRequested is editable until a cancellation request freezes the record');
  const signingCreated = await call(
    '/contracts',
    sales,
    'POST',
    { draft: { ...draft, title: 'Signing fixture' } },
    randomUUID(),
  );
  const signingCode = signingCreated.body.contract.code;
  await db.query("UPDATE qtkd.contract SET status='Approved' WHERE contract_code=$1", [signingCode]);
  const signingId = randomUUID();
  await db.query(
    "INSERT INTO qtkd.signing_session(signing_session_id,record_type,contract_id,provider_session_id,status,company_signer_id,customer_signer_name,customer_signer_email,sent_by,sent_at) SELECT $1,'Contract',contract_id,'isolated-test-signing','Signing',$2,'Customer Demo','customer@example.invalid',$3,now() FROM qtkd.contract WHERE contract_code=$4",
    [signingId, ids.boardMember, ids.salesStaff, signingCode],
  );
  const signingContract = (await call(`/contracts/${signingCode}`, sales)).body;
  let signingRequest = (
    await call(
      `/contracts/${signingCode}/cancellation-requests`,
      sales,
      'POST',
      { baseVersion: signingContract.version, party: 'company', reason: 'Dừng trước ký' },
      randomUUID(),
    )
  ).body.contract.cancellationRequests[0];
  signingRequest = (
    await call(
      `/contracts/${signingCode}/cancellation-requests/${signingRequest.id}/decision`,
      manager,
      'POST',
      { baseVersion: signingRequest.version, approve: true, reason: '' },
      randomUUID(),
    )
  ).body.contract.cancellationRequests[0];
  const blocked = await call(
    `/contracts/${signingCode}/cancellation-requests/${signingRequest.id}/decision`,
    board,
    'POST',
    { baseVersion: signingRequest.version, approve: true, reason: '' },
    randomUUID(),
  );
  assert.equal(blocked.body.code, 'SIGNING_CANCELLATION_REQUIRED');
  assert.equal((await call(`/contracts/${signingCode}`, sales)).body.status, 'approved');
  await db.query(
    "UPDATE qtkd.signing_session SET status='Cancelled',reason='Isolated provider cancellation acknowledgement' WHERE signing_session_id=$1",
    [signingId],
  );
  assert.equal(
    (
      await call(
        `/contracts/${signingCode}/cancellation-requests/${signingRequest.id}/decision`,
        board,
        'POST',
        { baseVersion: signingRequest.version, approve: true, reason: '' },
        randomUUID(),
      )
    ).body.contract.status,
    'cancelled',
  );
  pass('a running signing session blocks final cancellation until a provider acknowledgement exists');
  assert(
    (await db.query("SELECT count(*)::int n FROM qtkd.audit_log WHERE entity_type='Contract'")).rows[0].n >=
      8,
  );
  pass('business changes and before/after snapshots are audited');
  const originalName = data.userAccount.find((u) => u.userId === ids.salesStaff).fullName;
  await db.query("UPDATE qtkd.user_account SET full_name='Renamed Actor' WHERE user_id=$1", [ids.salesStaff]);
  const historical = (await call(`/contracts/${contract.code}`, sales)).body;
  assert.equal(historical.history.find((entry) => entry.action === 'CONTRACT_CREATED').byName, originalName);
  await db.query('UPDATE qtkd.user_account SET full_name=$2 WHERE user_id=$1', [
    ids.salesStaff,
    originalName,
  ]);
  pass('audit actor names remain historical after live account names change');
  if (process.env.QTKD_PLAYWRIGHT_MODULE) {
    const browserFixture = await call(
      '/contracts',
      sales,
      'POST',
      { draft: { ...draft, title: 'Đề nghị hủy qua trình duyệt' } },
      randomUUID(),
    );
    const cancellationCode = browserFixture.body.contract.code;
    await db.query("UPDATE qtkd.contract SET status='Submitted' WHERE contract_code=$1", [cancellationCode]);
    const { browserCheck } = await import('./contracts-browser.mjs');
    await browserCheck({
      repo,
      salesToken: sales,
      managerToken: manager,
      salesUser: data.userAccount.find((u) => u.userId === ids.salesStaff),
      managerUser: data.userAccount.find((u) => u.userId === ids.salesManager),
      apiPort,
      freePort,
      cancellationCode,
      screenshot: process.env.QTKD_SCREENSHOT ?? join(tempRoot, 'contract.png'),
    });
  }
  assert.equal((await call('/contracts', tokenFor('demo.sales', true))).status, 401);
  assert.equal((await call('/contracts', sales + 'tampered')).status, 401);
  pass('expired and invalid external identity tokens cannot access contracts');
  let restricted = (await call('/contracts', sales, 'POST', { draft }, randomUUID())).body.contract;
  const fixtureFile = new FormData();
  fixtureFile.set('baseVersion', String(restricted.version));
  fixtureFile.set('file', new Blob(['permission fixture']), 'permission.pdf');
  restricted = (
    await call(`/contracts/${restricted.code}/attachments`, sales, 'POST', fixtureFile, randomUUID())
  ).body.contract;
  await db.query(
    "DELETE FROM qtkd.role_permission WHERE role='SalesStaff' AND permission_code='contracts.create'",
  );
  assert.equal((await call(`/contracts/${restricted.code}`, sales)).status, 200);
  const forbiddenWrites = [
    ['/contracts', 'POST', { draft }],
    [`/contracts/${restricted.code}`, 'PUT', { baseVersion: restricted.version, draft }],
    [
      `/contracts/${restricted.code}/cancel`,
      'POST',
      { baseVersion: restricted.version, reason: 'Permission check' },
    ],
    [
      `/contracts/${restricted.code}/cancellation-requests`,
      'POST',
      { baseVersion: restricted.version, party: 'company', reason: 'Permission check' },
    ],
    [`/contracts/${restricted.code}/attachments`, 'POST', fixtureFile],
    [
      `/contracts/${restricted.code}/attachments/${restricted.attachments[0].id}?baseVersion=${restricted.version}`,
      'DELETE',
    ],
  ];
  for (const [path, method, body] of forbiddenWrites) {
    const result = await call(path, sales, method, body, randomUUID());
    assert.equal(result.status, 403, `${method} ${path}: ${JSON.stringify(result.body)}`);
  }
  assert.equal((await call(`/contracts/${restricted.code}`, sales)).body.version, restricted.version);
  await db.query(
    "INSERT INTO qtkd.role_permission(role,permission_code) VALUES('SalesStaff','contracts.create')",
  );
  pass('revoked contract write permission blocks all writes while preserving read access and data');

  let decisionFixture = (await call('/contracts', sales, 'POST', { draft }, randomUUID())).body.contract;
  await db.query("UPDATE qtkd.contract SET status='Submitted' WHERE contract_code=$1", [
    decisionFixture.code,
  ]);
  decisionFixture = (await call(`/contracts/${decisionFixture.code}`, sales)).body;
  const pendingDecision = await call(
    `/contracts/${decisionFixture.code}/cancellation-requests`,
    sales,
    'POST',
    { baseVersion: decisionFixture.version, party: 'company', reason: 'Approval permission fixture' },
    randomUUID(),
  );
  assert.equal(pendingDecision.status, 200, JSON.stringify(pendingDecision.body));
  const cancellation = pendingDecision.body.contract.cancellationRequests[0];
  await db.query(
    "DELETE FROM qtkd.role_permission WHERE role='SalesManager' AND permission_code='approvals.approve'",
  );
  const deniedDecision = await call(
    `/contracts/${decisionFixture.code}/cancellation-requests/${cancellation.id}/decision`,
    manager,
    'POST',
    { baseVersion: cancellation.version, approve: true, reason: '' },
    randomUUID(),
  );
  assert.equal(deniedDecision.status, 403, JSON.stringify(deniedDecision.body));
  assert.equal((await call(`/contracts/${decisionFixture.code}`, manager)).body.status, 'submitted');
  await db.query(
    "INSERT INTO qtkd.role_permission(role,permission_code) VALUES('SalesManager','approvals.approve')",
  );
  pass('an assigned manager cannot decide cancellation after approval permission is revoked');
  console.log(`${passed} integration checks passed. Supabase was not accessed.`);
} catch (error) {
  for (const line of logs.split('\n')) {
    try {
      const entry = JSON.parse(line);
      if (entry.Exception) console.error(entry.Exception.split('\n').slice(0, 4).join('\n'));
    } catch {}
  }
  console.error(logs.slice(-2500));
  throw error;
} finally {
  if (child && child.exitCode === null) {
    child.kill();
    await new Promise((r) => child.once('exit', r));
  }
  if (server) await server.stop();
  await db.close();
  // Only the verified, uniquely created test upload directory is recursively removed.
  if (
    resolve(tempRoot).startsWith(resolve(tmpdir()) + sep) &&
    resolve(tempRoot).includes('qtkd-contract-test-')
  )
    await rm(tempRoot, { recursive: true, force: true });
}
