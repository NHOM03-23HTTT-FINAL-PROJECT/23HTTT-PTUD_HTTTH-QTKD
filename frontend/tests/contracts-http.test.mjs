import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';

async function fixture(t) {
  const originalWindow = globalThis.window;
  globalThis.window = new EventTarget();
  t.after(() => {
    globalThis.window = originalWindow;
  });
  const identityUrl = new URL('../src/lib/http/client.ts?contract-test=' + randomUUID(), import.meta.url);
  const identity = await import(identityUrl.href);
  const source = (
    await readFile(new URL('../src/features/contracts/api/contractHttp.ts', import.meta.url), 'utf8')
  ).replace("'@/lib/http/client'", JSON.stringify(identityUrl.href));
  const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } }).outputText;
  const contracts = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));
  const session = {
    accessToken: 'fixture-token',
    accessTokenExpiresAt: new Date(Date.now() + 600000).toISOString(),
    user: { id: 'fixture-user', roles: ['NV_KD'], permissions: ['contracts.view'] },
  };
  identity.acceptAuth(session);
  return { identity, contracts };
}

test('refresh 401 becomes a contract error and ends the shared session with its reason', async (t) => {
  const { identity, contracts } = await fixture(t);
  const reasons = [];
  window.addEventListener('qtkd:session-ended', (event) => reasons.push(event.detail));
  contracts.configureContractTokenProvider(async () => {
    throw new identity.ApiError(401, 'password-changed');
  });
  await assert.rejects(contracts.api('/contracts'), (error) => {
    assert(error instanceof contracts.ApiError);
    assert.equal(error.status, 401);
    assert.equal(error.details.sessionStatus, 'password-changed');
    return true;
  });
  assert.equal(identity.apiAuthState(), null);
  assert.deepEqual(reasons, ['password-changed']);
});

test('refresh 403 is normalized without clearing the session or emitting logout', async (t) => {
  const { identity, contracts } = await fixture(t);
  let ended = 0;
  window.addEventListener('qtkd:session-ended', () => ended++);
  contracts.configureContractTokenProvider(async () => {
    throw new identity.ApiError(403, 'FORBIDDEN');
  });
  await assert.rejects(
    contracts.api('/contracts'),
    (error) => error instanceof contracts.ApiError && error.status === 403 && error.code === 'FORBIDDEN',
  );
  assert.equal(identity.apiAuthState().user.id, 'fixture-user');
  assert.equal(ended, 0);
});

test('attachment download token retrieval uses the same session-error normalization', async (t) => {
  const { identity, contracts } = await fixture(t);
  contracts.configureContractTokenProvider(async () => {
    throw new identity.ApiError(401, 'SESSION_ENDED');
  });
  await assert.rejects(
    contracts.getContractAccessToken(),
    (error) => error instanceof contracts.ApiError && error.details.sessionStatus === 'expired',
  );
  assert.equal(identity.apiAuthState(), null);
});
