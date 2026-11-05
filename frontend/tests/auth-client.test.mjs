import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';

function result(user = 'user-1', token = 'test-access-token') {
  return { accessToken: token, accessTokenExpiresAt: new Date(Date.now() + 600000).toISOString(), signedInAt: new Date().toISOString(),
    idleExpiresAt: new Date(Date.now() + 1800000).toISOString(), expiresAt: new Date(Date.now() + 28800000).toISOString(), previousLogin: null,
    user: { id: user, username: 'synthetic-test', email: 'test@example.invalid', fullName: 'Test', department: 'KD', roles: ['NV_KD'], permissions: [], mustChangePassword: false } };
}
const response = (value, status = 200) => new Response(status === 204 ? null : JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
async function client(t, fetcher) {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = new EventTarget();
  globalThis.fetch = fetcher;
  t.after(() => { globalThis.fetch = originalFetch; globalThis.window = originalWindow; });
  return import('../src/lib/http/client.ts?test=' + randomUUID());
}
test('anonymous recovery calls omit credentials and work after local logout', async t => {
  const api = await client(t, async (path, init) => {
    assert.equal(path, '/api/v1/auth/password/recovery/send');
    assert.equal(init.credentials, 'omit');
    assert.equal(new Headers(init.headers).get('Authorization'), null);
    assert.equal(new Headers(init.headers).get('X-QTKD-CSRF'), '1');
    assert.deepEqual(JSON.parse(init.body), { identifier: 'synthetic-test' });
    return response({ expiresAt: 42 }, 202);
  });
  api.clearApiAuth();
  assert.deepEqual(await api.postAnonymous('/auth/password/recovery/send', { identifier: 'synthetic-test' }), { expiresAt: 42 });
  assert.equal(api.apiAuthState(), null);
});

test('403 preserves the authenticated session and does not refresh or emit logout', async t => {
  let calls = 0, ended = 0;
  const api = await client(t, async () => { calls++; return response({ code: 'FORBIDDEN' }, 403); });
  window.addEventListener('qtkd:session-ended', () => ended++);
  api.acceptAuth(result());
  await assert.rejects(api.apiRequest('/users'), error => error.status === 403);
  assert.equal(calls, 1); assert.equal(ended, 0); assert.equal(api.apiAuthState().user.id, 'user-1');
});
test('401 refreshes once and retries with the replacement bearer token', async t => {
  const calls = [];
  const api = await client(t, async (path, init) => {
    calls.push([path, new Headers(init.headers).get('Authorization')]);
    if (path.endsWith('/auth/refresh')) return response(result('user-1', 'replacement-token'));
    return calls.length === 1 ? response({ code: 'SESSION_ENDED' }, 401) : response({ ok: true });
  });
  api.acceptAuth(result()); assert.deepEqual(await api.apiRequest('/users'), { ok: true });
  assert.equal(calls.length, 3); assert.equal(calls[1][0], '/api/v1/auth/refresh');
  assert.equal(calls[2][1], 'Bearer replacement-token');
});
test('concurrent requests share one refresh', async t => {
  let refreshes = 0;
  const api = await client(t, async path => {
    if (path.endsWith('/auth/refresh')) { refreshes++; await new Promise(resolve => setImmediate(resolve)); return response(result()); }
    return response({ ok: true });
  });
  await Promise.all([api.apiRequest('/users'), api.apiRequest('/roles')]); assert.equal(refreshes, 1);
});
test('failed refresh clears access state and emits one session-ended event', async t => {
  let ended = 0;
  const api = await client(t, async () => response({ code: 'expired' }, 401));
  window.addEventListener('qtkd:session-ended', () => ended++);
  api.acceptAuth(result()); await assert.rejects(api.apiRequest('/users'), error => error.status === 401);
  assert.equal(api.apiAuthState(), null); assert.equal(ended, 1);
});
test('bootstrap without a cookie does not show a false expired-session notice', async t => {
  let ended = 0;
  const api = await client(t, async () => response({ code: 'expired' }, 401));
  window.addEventListener('qtkd:session-ended', () => ended++);
  await assert.rejects(api.apiRequest('/auth/session', {}, false)); assert.equal(ended, 0);
});
test('logout prevents an in-flight refresh or a new request from restoring the session', async t => {
  let release;
  let refreshes = 0;
  const api = await client(t, async path => {
    if (path.endsWith('/auth/refresh')) { refreshes++; return new Promise(resolve => { release = () => resolve(response(result())); }); }
    return response(null, 204);
  });
  const pending = api.refreshHttp();
  await new Promise(resolve => setImmediate(resolve));
  await api.logoutHttp();
  await assert.rejects(api.apiRequest('/users'), error => error.status === 401);
  release(); await assert.rejects(pending, error => error.status === 401);
  assert.equal(refreshes, 1); assert.equal(api.apiAuthState(), null);
});
test('refresh cannot silently switch to another user from a shared browser cookie', async t => {
  const api = await client(t, async path => path.endsWith('/auth/refresh') ? response(result('different-user')) : response({ code: 'expired' }, 401));
  api.acceptAuth(result()); await assert.rejects(api.apiRequest('/users'), error => error.status === 401);
  assert.equal(api.apiAuthState(), null);
});
test('one role with zero permissions is accepted; missing role or permissions fails closed', async t => {
  const api = await client(t, async () => { throw new Error('unexpected fetch'); });
  api.acceptAuth(result()); assert.deepEqual(api.apiAuthState().user.permissions, []);
  const missingRole = result(); missingRole.user.roles = [];
  assert.throws(() => api.acceptAuth(missingRole), error => error.status === 500);
  const missingPermissions = result(); delete missingPermissions.user.permissions;
  assert.throws(() => api.acceptAuth(missingPermissions), error => error.status === 500);
});
test('cookie requests use credentials and CSRF header without persisting credentials in Web Storage', async t => {
  const api = await client(t, async (path, init) => {
    assert.equal(init.credentials, 'include'); assert.equal(new Headers(init.headers).get('X-QTKD-CSRF'), '1');
    assert.equal(path, '/api/v1/auth/login'); return response(result());
  });
  await api.loginHttp({ identifier: 'synthetic-test', password: 'not-a-real-password' });
  assert.equal(api.apiAuthState().user.roles.length, 1);
});
