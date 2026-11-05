import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server.js';

const sourceRoot = new URL('../src/', import.meta.url);
const originalWindow = globalThis.window;
const storage = () => ({ getItem: () => null, setItem() {}, removeItem() {} });
globalThis.window = Object.assign(new EventTarget(), { localStorage: storage(), sessionStorage: storage() });
after(() => { globalThis.window = originalWindow; });

// Load the actual routes/adapters; replace only the React login context with a signed-in user.
// SSR checks that blocked screens never mount (including their synchronous mock reads).
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    const mode = new URL(context.parentURL ?? import.meta.url).searchParams.get('authMode');
    if (specifier.startsWith('@/') || (mode && specifier.startsWith('.'))) {
      const url = specifier.startsWith('@/') ? new URL(specifier.slice(2), sourceRoot) : new URL(specifier, context.parentURL);
      if (!url.pathname.endsWith('.css')) {
        const file = ['', '.ts', '.tsx', '/index.ts'].map(ext => new URL(url.href + ext)).find(candidate => existsSync(fileURLToPath(candidate)));
        if (!file) throw new Error(`Cannot resolve test import: ${specifier}`);
        url.href = file.href;
      }
      if (mode) url.searchParams.set('authMode', mode);
      return { url: url.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (!url.startsWith(sourceRoot.href)) return nextLoad(url, context);
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
    const source = parsed.pathname.endsWith('/app/providers/AuthProvider.tsx') ? `
      let user = null;
      export function setUser(next) { user = next; }
      export function useAuth() { return { user, loading: false, syncUser() {}, logout() {},
        can: permission => Boolean(user?.permissions.has(permission)) }; }
    ` : readFileSync(parsed, 'utf8')
      .replaceAll('import.meta.env', `(${JSON.stringify({ VITE_AUTH_MODE: parsed.searchParams.get('authMode') })})`)
      .replaceAll('import.meta.glob', '(() => ({}))'); // SVG URLs do not affect route behavior.
    return { format: 'module', shortCircuit: true, source: ts.transpileModule(source, {
      fileName: parsed.pathname, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText };
  },
});

async function harness(mode) {
  const load = path => import(new URL(`${path}?authMode=${mode}`, sourceRoot));
  const { AppRoutes } = await load('app/router/AppRouter.tsx');
  const { BusinessRoute } = await load('app/router/BusinessRoute.tsx');
  const { setUser } = await load('app/providers/AuthProvider.tsx');
  return {
    ...await load('features/contracts/utils/approvalReview.ts'),
    ...await load('features/contracts/api/approvalApi.ts'),
    ...await load('features/auth/api/authApi.ts'), ...await load('features/auth/api/passwordRecoveryApi.ts'),
    ...await load('lib/http/client.ts'), ...await load('constants/routes.ts'),
    ...await load('mocks/contractsServer.ts'), ...await load('mocks/seed/users.ts'),
    renderRoute(path, user) {
      setUser(user);
      return renderToString(React.createElement(StaticRouter, { location: path }, React.createElement(AppRoutes)));
    },
    renderProbe(user) {
      setUser(user);
      return renderToString(React.createElement(StaticRouter, { location: '/hop-dong' },
        React.createElement(BusinessRoute, { permission: 'contracts.view', label: 'Hợp đồng' },
          React.createElement('p', null, 'business-screen-mounted'))));
    },
  };
}

const api = await harness('api');
const mock = await harness('mock');
hooks.deregister();
const user = {
  id: 'd14a4fc3-7a75-47a1-8093-dca852923864', username: 'synthetic-manager', fullName: 'Test Manager',
  email: 'test@example.invalid', department: 'KD', roles: ['TP_KD'], mustChangePassword: false,
  primaryRole: { name: 'Trưởng phòng Kinh doanh' },
  departmentInfo: { name: 'Kinh doanh', workspace: 'kinh-doanh' },
  signedInAt: new Date().toISOString(), permissions: new Set(),
};
const authResult = {
  accessToken: 'synthetic-access-token', accessTokenExpiresAt: new Date(Date.now() + 600000).toISOString(),
  signedInAt: user.signedInAt, idleExpiresAt: new Date(Date.now() + 1800000).toISOString(),
  expiresAt: new Date(Date.now() + 28800000).toISOString(), previousLogin: null,
  user: { ...user, permissions: [] },
};
const routes = [
  ['/khach-hang', 'customers.view'], ['/khach-hang/tao-moi', 'customers.create'],
  ['/khach-hang/KH-001', 'customers.view'], ['/khach-hang/KH-001/chinh-sua', 'customers.update'],
  ['/khach-hang/KH-001/tam-ngung', 'customers.change-status'], ['/khach-hang/KH-001/kich-hoat-lai', 'customers.change-status'],
  ['/khu-vuc', 'areas.view'], ['/khu-vuc/tra-cuu', 'areas.view'], ['/khu-vuc/so-do', 'areas.view'],
  ['/khu-vuc/tao-moi', 'areas.create'], ['/khu-vuc/KV-001', 'areas.view'], ['/khu-vuc/KV-001/chinh-sua', 'areas.update'],
  ['/hop-dong', 'contracts.view'], ['/hop-dong/tao-moi', 'contracts.create'],
  ['/hop-dong/can-chinh-sua', 'contracts.create'], ['/hop-dong/HD-2026-001', 'contracts.view'],
  ['/hop-dong/HD-2026-001/chinh-sua', 'contracts.create'], ['/hop-dong/HD-2026-001/tien-do', 'contracts.view'],
  ['/phe-duyet/cho-duyet', 'approvals.approve'], ['/phe-duyet/cho-ra-soat', 'approvals.review-legal'],
  ['/phe-duyet/da-ra-soat', 'approvals.review-legal'], ['/phe-duyet/cho-phe-duyet', 'approvals.approve'],
  ['/phe-duyet/tien-do', 'approvals.track'], ['/phe-duyet/phan-cong', 'approvals.assign'],
];

function ignoreStaticRedirectWarning(t) {
  const warn = console.warn;
  t.mock.method(console, 'warn', (...args) => {
    // Static rendering cannot execute Navigate effects. These cases assert that children are blocked.
    if (String(args[0]).startsWith('<Navigate> must not be used on the initial render')) return;
    warn(...args);
  });
}

test('API identity opens approval inboxes and reviewer assignment while other mock business routes remain isolated', () => {
  api.acceptAuth(authResult);
  for (const [path, permission] of routes) {
    const html = api.renderRoute(path, { ...user, permissions: new Set([permission]) });
    if (['/phe-duyet/cho-duyet', '/phe-duyet/cho-ra-soat', '/phe-duyet/da-ra-soat', '/phe-duyet/cho-phe-duyet'].includes(path)) {
      assert.ok(!html.includes('Chức năng chưa sẵn sàng'), path);
      assert.ok(html.includes('Chỉ gồm hồ sơ mà bạn là người được giao chính thức'), path);
    } else if (path === '/phe-duyet/phan-cong') {
      // SYS-CTR-10 đã nối BE: render màn thật, không phải placeholder.
      assert.ok(!html.includes('Chức năng chưa sẵn sàng'), path);
      assert.ok(html.includes('Phân công người duyệt'), path);
    } else {
      assert.ok(html.includes('Chức năng chưa sẵn sàng'), path);
      assert.ok(html.includes('Bạn vẫn đang đăng nhập'), path);
    }
    assert.equal(api.apiAuthState().user.id, user.id);
  }
});

test('permission rejection takes precedence over unavailable content and preserves API auth', t => {
  ignoreStaticRedirectWarning(t);
  api.acceptAuth(authResult);
  for (const [path] of routes) {
    const html = api.renderRoute(path, user);
    assert.ok(!html.includes('Chức năng chưa sẵn sàng'), path);
    assert.equal(api.apiAuthState().user.id, user.id);
  }
  assert.ok(!api.renderProbe(user).includes('business-screen-mounted'));
});

test('mock mode still mounts the permitted screen; permission denial still blocks it', t => {
  ignoreStaticRedirectWarning(t);
  assert.ok(mock.renderProbe({ ...user, permissions: new Set(['contracts.view']) }).includes('business-screen-mounted'));
  assert.ok(!mock.renderProbe(user).includes('business-screen-mounted'));
});

test('mock contract authorization still accepts a prototype account and rejects a real UUID', t => {
  const originalWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: () => null, setItem() {} } };
  t.after(() => { globalThis.window = originalWindow; });
  const account = mock.SEED_ACCOUNTS.find(account => account.status === 'active' && account.roles.includes('TP_KD'));
  const request = { userId: account.id, signedInAt: user.signedInAt,
    query: { page: 1, size: 10, keyword: '', status: '', areaCode: '', contractType: '' }, variant: 'all' };
  assert.doesNotThrow(() => mock.mockListContracts(request));
  assert.throws(() => mock.mockListContracts({ ...request, userId: user.id }), error => error.code === 'SESSION_ENDED');
});

test('API session verification uses BE for a real UUID and still ends expired or disabled sessions', async t => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = new EventTarget();
  t.after(() => { globalThis.fetch = originalFetch; globalThis.window = originalWindow; });
  const calls = [];
  const ended = [];
  window.addEventListener('qtkd:session-ended', event => ended.push(event.detail));
  for (const status of ['active', 'disabled', 'expired']) {
    globalThis.fetch = async path => {
      calls.push(path);
      if (path.endsWith('/auth/login')) return new Response(JSON.stringify(authResult), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
      return new Response(JSON.stringify(status === 'active' ? { ...authResult, status: 'active' } : { code: status }), {
        status: status === 'active' ? 200 : 401, headers: { 'Content-Type': 'application/json' },
      });
    };
    await api.authApi.login({ identifier: 'synthetic', password: 'synthetic' });
    const check = await api.authApi.checkSession(user.id, user.signedInAt);
    assert.equal(check.status, status);
    if (status === 'active') assert.equal(api.apiAuthState().user.id, user.id);
    else assert.equal(api.apiAuthState(), null);
  }
  assert.deepEqual(ended, ['disabled', 'expired']);
  assert.ok(calls.includes('/api/v1/auth/session'));
});

test('API mode opens password recovery and calls the real send, verify and reset adapter', async t => {
  assert.match(api.renderRoute(api.ROUTES.forgotPassword, null), /Quên mật khẩu/);
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const identifier = 'synthetic-user';
  const resetToken = 'synthetic-reset-token';
  const dispatch = { expiresAt: 1234, resendAvailableAt: 567 };
  const verified = { resetToken, accountLabel: 'test@example.invalid' };
  const requests = [
    ['send', { identifier }, 202, dispatch],
    ['verify', { identifier, code: '123456' }, 400, { code: 'INVALID_CODE' }],
    ['verify', { identifier, code: '123456' }, 200, verified],
    ['reset', { resetToken, newPassword: 'Synthetic@123' }, 200, { identifier }],
  ];
  globalThis.fetch = async (path, init) => {
    const [action, body, status, response] = requests.shift();
    assert.equal(path, `/api/v1/auth/password/recovery/${action}`);
    assert.deepEqual(JSON.parse(init.body), body);
    return new Response(JSON.stringify(response), { status });
  };

  assert.deepEqual(await api.passwordRecoveryApi.sendOtp(identifier), dispatch);
  await assert.rejects(api.passwordRecoveryApi.verifyOtp(identifier, '123456'), { name: 'RecoveryError', code: 'INVALID_CODE' });
  assert.deepEqual(await api.passwordRecoveryApi.verifyOtp(identifier, '123456'), verified);
  assert.deepEqual(await api.passwordRecoveryApi.resetPassword({ resetToken, newPassword: 'Synthetic@123' }), { identifier });
  assert.equal(requests.length, 0);
});

test('approval adapter sends snapshot and idempotency key with bearer and never sends a client actor', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = async (path, init) => {
    if (path.endsWith('/auth/login')) return new Response(JSON.stringify(authResult), { status: 200 });
    calls.push({ path, headers: new Headers(init.headers), body: init.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify({ document: { status: 'under-review' } }), { status: 200 });
  };
  await api.loginHttp({ identifier: 'synthetic', password: 'synthetic' });
  const expected = { roundId: 'round-1', stepId: 'step-1', viewedVersion: 3, step: 'legal' };
  await api.approvalApi.decide(user.id, { ...expected, decision: 'approve', comment: 'Valid conclusion' }, 'stable-key');
  await api.approvalApi.handoff(user.id, expected, 'handoff-key');
  await api.approvalApi.retry(user.id, 'legal', 'retry-key');
  assert.equal(calls[0].path, `/api/v1/approvals/contracts/${user.id}/decisions`);
  assert.equal(calls[0].headers.get('Idempotency-Key'), 'stable-key');
  assert.equal(calls[0].headers.get('Authorization'), 'Bearer synthetic-access-token');
  assert.equal(calls[0].headers.get('X-QTKD-CSRF'), '1');
  assert.deepEqual(calls[0].body, { ...expected, decision: 'approve', comment: 'Valid conclusion' });
  assert.equal(calls[1].path, `/api/v1/approvals/contracts/${user.id}/handoff`);
  assert.equal(calls[2].path, `/api/v1/approvals/contracts/${user.id}/pending-task/retry?step=legal`);
  for (const call of calls) assert.ok(!('userId' in call.body));
});

function reviewFixture(role = 'TP_KD') {
  const actor = { id: role, roles: [role], permissions: new Set(['approvals.approve', 'approvals.review-legal']) };
  const keys = ['sales', 'legal', 'board'];
  const assignees = ['TP_KD', 'NV_PC', 'GD'];
  const steps = keys.map((key, i) => ({ id: key, key, order: i + 1, assigneeId: assignees[i], assigneeName: assignees[i],
    state: i === 0 ? 'pending-accept' : 'waiting', decision: null, reviewedVersion: null, requiresHandoff: key === 'legal' }));
  const contract = { id: 'contract-uuid', code: 'HD-000010', status: 'submitted', version: 3,
    rounds: [{ id: 'round-1', no: 1, result: 'in-progress', contractVersion: 3, steps: structuredClone(steps) }] };
  const doc = { id: contract.id, code: contract.code, roundId: 'round-1', roundNo: 1, version: 3, submittedVersion: 3, roundResult: 'in-progress', status: 'submitted', steps };
  return { actor, contract, doc };
}

test('detail review exposes sales acceptance only for the assigned reviewer on the displayed version', () => {
  const { actor, contract, doc } = reviewFixture();
  assert.equal(api.approvalView(contract, actor, doc).kind, 'accept');
  assert.equal(api.approvalView({ ...contract, version: 2 }, actor, doc).kind, 'stale');
  assert.equal(api.approvalView(contract, actor, { ...doc, roundId: 'new-round' }).kind, 'stale');
  assert.equal(api.approvalView(contract, { ...actor, permissions: new Set() }, doc).kind, 'info');
  assert.equal(api.approvalView(contract, { ...actor, id: 'different-manager' }, doc).kind, 'info');
});

test('legal and board controls wait for predecessors, assignment and the explicit handoff', () => {
  const f = reviewFixture('NV_PC');
  assert.equal(api.approvalView(f.contract, f.actor, f.doc).kind, 'info');
  f.doc.status = 'under-review'; f.doc.steps[0] = { ...f.doc.steps[0], state: 'done', decision: 'approve', reviewedVersion: 3 };
  f.doc.steps[1].state = 'reviewing';
  assert.equal(api.approvalView(f.contract, f.actor, f.doc).kind, 'decide');
  f.doc.steps[1] = { ...f.doc.steps[1], state: 'done', decision: 'approve', reviewedVersion: 3 };
  assert.equal(api.approvalView(f.contract, f.actor, f.doc).kind, 'handoff');
  const board = { ...f.actor, id: 'GD', roles: ['GD'] };
  assert.equal(api.approvalView(f.contract, board, f.doc).kind, 'info');
  f.doc.steps[2].state = 'reviewing';
  assert.equal(api.approvalView(f.contract, board, f.doc).kind, 'decide');
  f.doc.steps[0].reviewedVersion = 2;
  assert.equal(api.approvalView(f.contract, board, f.doc).kind, 'info');
});

test('unassigned, concluded and new manager roles produce explicit read-only states', () => {
  const f = reviewFixture('NV_PC');
  f.contract.rounds[0].steps[1].assigneeId = null;
  assert.match(api.approvalView(f.contract, f.actor, f.doc).message, /chờ phân công/);
  f.contract.rounds[0].result = 'revision';
  assert.match(api.approvalView(f.contract, f.actor, f.doc).message, /đã kết thúc/);
  assert.equal(api.approvalStepFor({ roles: ['TP_PC'] }), 'legal');
  assert.equal(api.approvalStepFor({ roles: ['TGD'] }), 'board');
  assert.equal(api.approvalStepFor({ roles: ['NV_KD'] }), undefined);
});
