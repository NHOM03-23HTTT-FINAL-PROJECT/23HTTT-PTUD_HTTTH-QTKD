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
    ...await load('features/auth/api/authApi.ts'), ...await load('lib/http/client.ts'),
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
  ['/phe-duyet/tien-do', 'approvals.track'], ['/quan-tri/quy-trinh', 'workflows.manage'],
  ['/quan-tri/quy-trinh/tao-moi', 'workflows.manage'], ['/quan-tri/quy-trinh/WF-001/cap-nhat', 'workflows.manage'],
];

function ignoreStaticRedirectWarning(t) {
  const warn = console.warn;
  t.mock.method(console, 'warn', (...args) => {
    // Static rendering cannot execute Navigate effects. These cases assert that children are blocked.
    if (String(args[0]).startsWith('<Navigate> must not be used on the initial render')) return;
    warn(...args);
  });
}

test('API identity can open all 26 mock business routes without mounting mocks or losing its session', () => {
  api.acceptAuth(authResult);
  for (const [path, permission] of routes) {
    const html = api.renderRoute(path, { ...user, permissions: new Set([permission]) });
    assert.ok(html.includes('Chức năng chưa sẵn sàng'), path);
    assert.ok(html.includes('Bạn vẫn đang đăng nhập'), path);
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
