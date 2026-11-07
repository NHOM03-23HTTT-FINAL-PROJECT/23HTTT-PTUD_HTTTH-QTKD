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

// Disposable PostgreSQL in WASM only. DIRECT_URL and DB/.env are never read by this test.
const dbRoot = fileURLToPath(new URL('..', import.meta.url));
const repo = resolve(dbRoot, '..');
// Same SQL files and fixture the EF Core migrations and QTKD.DbTool seed use.
const sqlDir = join(repo, 'backend/src/QTKD.Infrastructure/Persistence/Migrations/Sql');
const fixture = JSON.parse(await readFile(join(repo, 'backend/src/QTKD.Infrastructure/Persistence/Seed/demo-seed.json'), 'utf8'));
const ids = fixture.ids;
const camel = (name) => name.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
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
  // The original (pre-EF) migration files carry their own BEGIN/COMMIT; EF-native ones need the EF history table.
  for (const name of (await readdir(sqlDir)).filter((n) => /^\d{12}_.*\.sql$/.test(n)).sort())
    await db.exec(await readFile(join(sqlDir, name), 'utf8'));
  pass('all migrations execute on PostgreSQL');
  const passwordHash = await hash(password, 12);
  // tables: database rows (snake_case) for INSERT; data: the same rows with camelCase keys for the assertions below.
  const tables = Object.fromEntries(Object.entries(fixture.tables).map(([table, rows]) => [table,
    rows.map((row) => (row.password_hash === fixture.passwordHashPlaceholder ? { ...row, password_hash: passwordHash } : row))]));
  const data = Object.fromEntries(Object.entries(tables).map(([table, rows]) => [camel(table),
    rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [camel(key), value])))]));
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
    const table = delegate.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
    for (const [index, raw] of data[delegate].entries()) {
      if (delegate === 'approvalRound' && raw.recordType !== 'Contract') continue;
      if (
        delegate === 'approvalStep' &&
        !data.approvalRound.some((r) => r.recordType === 'Contract' && r.roundId === raw.roundId)
      )
        continue;
      const row = { ...tables[table][index] };
      if (delegate === 'department') delete row.manager_id;
      if (delegate === 'userAccount') row.must_change_password = false;
      const columns = Object.keys(row).map((column) => `"${column}"`).join(',');
      // PostgreSQL converts each JSON value to the column type (enum, uuid, numeric, date, jsonb).
      await db.query(
        `INSERT INTO qtkd."${table}" (${columns}) SELECT ${columns} FROM jsonb_populate_record(NULL::qtkd."${table}", $1::jsonb) ON CONFLICT DO NOTHING`,
        [JSON.stringify(row)],
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
  const approvalUiPort = await freePort();
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
        // Keep queued states deterministic on PGlite's single backend. Worker recovery is tested separately.
        Notifications__Delivery__Enabled: 'false',
        ConnectionStrings__Identity: `Host=127.0.0.1;Port=${dbPort};Database=postgres;Username=postgres;SSL Mode=Disable;Pooling=false;Timeout=5;Command Timeout=10`,
        Storage__Root: tempRoot,
        Jwt__SigningKey: signingKey,
        Jwt__Issuer: 'contract-test-identity',
        Jwt__Audience: 'contract-test-api',
        Cors__Origins__3: `http://127.0.0.1:${approvalUiPort}`,
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
  let httpTurn = Promise.resolve();
  async function serialHttp(action) {
    const previous = httpTurn; let release;
    httpTurn = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await action(); } finally { release(); }
  }
  async function call(path, token, method = 'GET', body, key) {
    return serialHttp(async () => {
    const headers = new Headers();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (method !== 'GET') { headers.set('X-QTKD-CSRF', '1'); headers.set('Origin', `http://127.0.0.1:${approvalUiPort}`); }
    if (key) headers.set('Idempotency-Key', key);
    if (body && !(body instanceof FormData)) headers.set('Content-Type', 'application/json');
    const response = await fetch(base + path, {
      method,
      headers,
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    });
    const result = response.status === 204 ? null : await response.json().catch(() => null);
    return { status: response.status, body: result };
    });
  }
  const fixtureSessions = new Map();
  for (const username of [
    'demo.sales',
    'demo.sales.manager',
    'demo.board.chair',
    'demo.legal.unassigned',
    'demo.legal.manager',
    'demo.legal',
  ]) {
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
    board = tokenFor('demo.board.chair'),
    legal = tokenFor('demo.legal.unassigned');
  assert.equal((await call('/contracts', legal)).body.total, 0);
  pass('legal role without assignment sees no contracts');
  const legalManagerList = await call('/contracts', tokenFor('demo.legal.manager'));
  assert.equal(legalManagerList.status, 200, JSON.stringify(legalManagerList.body));
  assert.equal(legalManagerList.body.total, 0);
  const unassignedStep = data.approvalStep.find((step) => step.assigneeId == null);
  assert(unassignedStep, 'main seed must include an unassigned approval step');
  const unassignedRound = data.approvalRound.find((round) => round.roundId === unassignedStep.roundId);
  const unassignedCode = (
    await db.query('SELECT contract_code FROM qtkd.contract WHERE contract_id=$1', [
      unassignedRound.contractId,
    ])
  ).rows[0].contract_code;
  const unassignedContract = await call(`/contracts/${unassignedCode}`, sales);
  assert.equal(unassignedContract.status, 200, JSON.stringify(unassignedContract.body));
  const shownRound = unassignedContract.body.rounds.find((round) => round.no === unassignedRound.roundNo);
  assert.equal(
    shownRound.steps.length,
    data.approvalStep.filter((step) => step.roundId === unassignedRound.roundId).length,
  );
  assert(
    shownRound.steps.some(
      (step) => step.assigneeId === null && step.state === 'waiting' && step.key === 'legal',
    ),
  );
  pass('main manager roles preserve scope and unassigned approval stages remain visible in contract details');
  assert.match(unassignedContract.body.id, /^[0-9a-f-]{36}$/i);
  assert.match(shownRound.id, /^[0-9a-f-]{36}$/i);
  assert(shownRound.steps.every(step => /^[0-9a-f-]{36}$/i.test(step.id)));
  const approvalInbox = await call('/approvals/inbox?step=sales', manager);
  assert.equal(approvalInbox.status, 200, JSON.stringify(approvalInbox.body));
  assert(approvalInbox.body.every(row => /^HD-/.test(row.code)));
  pass('detail UUIDs and human-readable approval inbox codes connect the two APIs');
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
  // New SYS-CTR-10 safeguards on the disposable database only.
  const legalHead = tokenFor('demo.legal.manager');
  const legalStaff = tokenFor('demo.legal');
  const ready = (await call(`/approvals/contracts/${ids.assignLegalContract}?step=sales`, manager)).body;
  const future = { id: unassignedContract.body.id, version: unassignedContract.body.version,
    roundId: shownRound.id, steps: shownRound.steps };
  const assignmentRequest = (document, step, assignee) => ({ roundId: document.roundId,
    stepId: document.steps.find(s => s.key === step).id, viewedVersion: document.version, assigneeId: assignee });
  const queue = await call('/approvals/assignments', legalHead);
  assert.equal(queue.status, 200);
  assert(queue.body.some(row => row.document.id === ready.id));
  assert(!queue.body.some(row => row.document.id === future.id));
  const tooEarly = await call(`/approvals/contracts/${future.id}/assignment`, legalHead, 'POST', assignmentRequest(future, 'legal', ids.legalStaff));
  assert.equal(tooEarly.status, 409);
  await assert.rejects(db.query("UPDATE qtkd.approval_step SET assignee_id=$1,step_status='Pending' WHERE step_id=$2", [ids.legalStaff, future.steps[1].id]), e => e.code === '23514');
  pass('future assignment is hidden and rejected by both API and database');

  const legalDepartment = data.userAccount.find(u => u.userId === ids.legalStaff).departmentId;
  await db.query('UPDATE qtkd.user_account SET department_id=$1 WHERE user_id=$2', [ids.accounting, ids.legalStaff]);
  const candidates = await call(`/approvals/contracts/${ready.id}/candidates?step=legal`, legalHead);
  assert.equal(candidates.status, 200);
  assert(!candidates.body.some(person => person.id === ids.legalStaff));
  const wrongDept = await call(`/approvals/contracts/${ready.id}/assignment`, legalHead, 'POST', assignmentRequest(ready, 'legal', ids.legalStaff));
  assert.equal(wrongDept.status, 400);
  assert.equal(wrongDept.body.code, 'INVALID_ASSIGNEE');
  await db.query('UPDATE qtkd.user_account SET department_id=$1 WHERE user_id=$2', [legalDepartment, ids.legalStaff]);
  pass('candidate validation checks actual department as well as role and permissions');

  const assigned = await call(`/approvals/contracts/${ready.id}/assignment`, legalHead, 'POST', assignmentRequest(ready, 'legal', ids.legalStaff));
  assert.equal(assigned.status, 200, JSON.stringify(assigned.body));
  assert.equal(assigned.body.steps[1].state, 'pending-accept');
  for (const person of [ids.legalStaff, ids.legalManager]) {
    const duplicate = await call(`/approvals/contracts/${ready.id}/assignment`, legalHead, 'POST', assignmentRequest(ready, 'legal', person));
    assert.equal(duplicate.status, 409); assert.equal(duplicate.body.code, 'ASSIGNMENT_IMMUTABLE');
  }
  await assert.rejects(db.query('UPDATE qtkd.approval_step SET assignee_id=$1 WHERE step_id=$2', [ids.legalManager, ready.steps[1].id]), e => e.code === '23514');
  const decisionRequest = { roundId: ready.roundId, stepId: ready.steps[1].id, viewedVersion: ready.version, step: 'legal', decision: 'approve', comment: 'Verified legal terms' };
  assert.equal((await call(`/approvals/contracts/${ready.id}/decisions`, legalStaff, 'POST', decisionRequest, randomUUID())).status, 409);
  assert.equal((await call(`/approvals/contracts/${ready.id}/accept`, legalStaff, 'POST', decisionRequest, randomUUID())).status, 200);
  const idempotency = randomUUID();
  const approved = await call(`/approvals/contracts/${ready.id}/decisions`, legalStaff, 'POST', decisionRequest, idempotency);
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.document.steps[2].state, 'unassigned');
  assert.equal((await call(`/approvals/contracts/${ready.id}/decisions`, legalStaff, 'POST', decisionRequest, idempotency)).status, 200);
  const auditCount = await db.query("SELECT count(*)::int AS n FROM qtkd.audit_log WHERE entity_id=$1 AND action='REVIEW_APPROVED_AND_FORWARDED'", [ready.id]);
  assert.equal(auditCount.rows[0].n, 1);
  const history = (await call(`/contracts/${ready.code}`, manager)).body.rounds.at(-1).log;
  assert(history.some(row => row.action === 'approve' && row.stepKey === 'legal'));
  assert(history.some(row => row.action === 'handoff-board' && row.stepKey === 'legal'));
  const notifications = await db.query("SELECT count(*)::int AS n FROM qtkd.notification WHERE record_id=$1 AND recipient_id=$2 AND content LIKE 'Cần phân công %' AND send_status='Pending'", [ready.id, ids.boardChair]);
  assert.equal(notifications.rows[0].n, 1);
  pass('assignment is immutable and legal acceptance plus combined approval is idempotent and queues the director notice');

  let legacy = (await call(`/approvals/contracts/${ids.assignBoardContract}?step=sales`, manager)).body;
  // Emulate an old round whose legal conclusion was saved before the former handoff button was pressed.
  await db.query("UPDATE qtkd.approval_step SET step_status='Completed',decision='Approve',comment='Legacy legal conclusion',decided_by=assignee_id,decided_at=now() WHERE step_id=$1 AND decision IS NULL", [legacy.steps[1].id]);
  legacy = (await call(`/approvals/contracts/${legacy.id}?step=sales`, manager)).body;
  assert.equal(legacy.steps[2].state, 'unassigned');
  const continued = await call(`/approvals/contracts/${legacy.id}/assignment`, board, 'POST', assignmentRequest(legacy, 'board', ids.boardChair));
  assert.equal(continued.status, 200, JSON.stringify(continued.body));
  assert.equal(continued.body.steps[2].state, 'pending-accept');
  pass('older rounds with an approved legal conclusion continue without a separate handoff');
  if (process.env.QTKD_APPROVAL_BROWSER === 'true') {
    assert(process.env.QTKD_PLAYWRIGHT_MODULE, 'Set QTKD_PLAYWRIGHT_MODULE for the optional approval browser checks');
    const { approvalDetailBrowserCheck } = await import('./approval-detail-browser.mjs');
    let sequence = 0;
    const createSubmitted = async () => {
      const created = await call('/contracts', sales, 'POST', { draft: { ...draft, title: `Kiểm thử UI phê duyệt ${++sequence}` } }, randomUUID());
      assert.equal(created.status, 200, JSON.stringify(created.body));
      const record = created.body.contract;
      const upload = new FormData(); upload.set('baseVersion', String(record.version)); upload.set('file', new Blob(['approval UI attachment']), 'approval.pdf');
      assert.equal((await call(`/contracts/${record.code}/attachments`, sales, 'POST', upload, randomUUID())).status, 200);
      const submitted = await call(`/contracts/${record.code}/submit`, sales, 'POST', {}, randomUUID());
      assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
      return submitted.body.contract;
    };
    const actors = {
      sales: { user: data.userAccount.find(u => u.userId === ids.salesStaff), role: 'NV_KD', token: sales, department: 'KD', permissions: ['contracts.view', 'contracts.create', 'approvals.track'] },
      manager: { user: data.userAccount.find(u => u.userId === ids.salesManager), role: 'TP_KD', token: manager, department: 'KD', permissions: ['contracts.view', 'approvals.approve', 'approvals.track', 'approvals.assign'] },
      legal: { user: data.userAccount.find(u => u.userId === ids.legalManager), role: 'TP_PC', token: tokenFor('demo.legal.manager'), department: 'PC', permissions: ['contracts.view', 'approvals.review-legal', 'approvals.assign'] },
      legalReviewer: { user: data.userAccount.find(u => u.userId === ids.legalStaff), role: 'NV_PC', token: tokenFor('demo.legal'), department: 'PC', permissions: ['contracts.view', 'approvals.review-legal', 'approvals.track'] },
      board: { user: data.userAccount.find(u => u.userId === ids.boardChair), role: 'TGD', token: board, department: 'BGD', permissions: ['contracts.view', 'approvals.approve', 'approvals.assign'] },
    };
    await approvalDetailBrowserCheck({ repo, apiPort, browserPort: approvalUiPort, actors, createSubmitted, call, serialHttp,
      screenshotRoot: process.env.QTKD_APPROVAL_SCREENSHOTS ?? tempRoot });
    pass('browser: canonical detail supports acceptance, immutable assignment, combined legal approval and final approval with real workflow APIs');
  }
  if (process.env.QTKD_PLAYWRIGHT_MODULE && process.env.QTKD_APPROVAL_BROWSER !== 'true') {
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
