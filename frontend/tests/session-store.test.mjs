import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sessionStore } from '../src/lib/auth/session.ts';
test('local logout intent survives reload metadata and is reset only by login', t => {
  const original = globalThis.window;
  const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };
  globalThis.window = { localStorage: storage(), sessionStorage: storage() };
  t.after(() => { globalThis.window = original; });
  sessionStore.save({ userId: 'test-user', signedInAt: new Date().toISOString(), lastActiveAt: Date.now() }, true);
  assert.equal(sessionStore.isSignedOut(), false);
  sessionStore.markSignedOut(); assert.equal(sessionStore.isSignedOut(), true);
  sessionStore.clear(); assert.equal(sessionStore.load(), null); assert.equal(sessionStore.isSignedOut(), true);
  sessionStore.save({ userId: 'test-user', signedInAt: new Date().toISOString(), lastActiveAt: Date.now() }, false);
  assert.equal(sessionStore.isSignedOut(), false);
});
