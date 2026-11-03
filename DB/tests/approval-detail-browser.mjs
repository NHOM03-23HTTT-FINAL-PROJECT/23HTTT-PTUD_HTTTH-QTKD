import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/** Real FE + approval/contract APIs + disposable PostgreSQL fixture. Only the external login projection is supplied here. */
export async function approvalDetailBrowserCheck({ repo, apiPort, browserPort, actors, createSubmitted, call, serialHttp, screenshotRoot }) {
  const { chromium } = await import(pathToFileURL(process.env.QTKD_PLAYWRIGHT_MODULE).href);
  const origin = `http://127.0.0.1:${browserPort}`;
  const vite = spawn(process.execPath, [join(repo, 'frontend/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(browserPort), '--strictPort'], {
    cwd: join(repo, 'frontend'), windowsHide: true, stdio: 'ignore',
    env: { ...process.env, VITE_CONTRACTS_USE_BACKEND: 'true', VITE_AUTH_MODE: 'api', QTKD_API_PROXY: `http://127.0.0.1:${apiPort}` },
  });
  let browser;
  const errors = [];
  const decisionRequests = [];
  try {
    await mkdir(screenshotRoot, { recursive: true });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(origin)).ok) break; } catch {}
      if (vite.exitCode !== null) throw new Error('Vite exited before approval UI verification');
      await new Promise(r => setTimeout(r, 100));
    }
    browser = await chromium.launch({ executablePath: process.env.QTKD_BROWSER_EXECUTABLE, headless: true });
    async function pageFor(actor, width = 1440) {
      const page = await browser.newPage({ viewport: { width, height: 1100 } });
      page.setDefaultTimeout(15000);
      page.on('pageerror', e => errors.push(e.message));
      page.on('request', request => {
        if (request.method() === 'POST' && request.url().endsWith('/decisions')) decisionRequests.push({ url: request.url(), key: request.headers()['idempotency-key'] });
      });
      // PGlite socket supports one backend connection. Serialize fixture HTTP traffic across tabs.
      await page.route('**/api/v1/**', async route => {
        await serialHttp(async () => { const response = await route.fetch(); await route.fulfill({ response }); });
      });
      const now = new Date().toISOString();
      const user = { id: actor.user.userId, username: actor.user.username, email: actor.user.companyEmail,
        fullName: actor.user.fullName, department: actor.department, roles: [actor.role], permissions: actor.permissions, mustChangePassword: false };
      const session = { user, accessToken: actor.token, accessTokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        signedInAt: now, idleExpiresAt: new Date(Date.now() + 1800000).toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), previousLogin: null };
      await page.addInitScript(({ id, at }) => sessionStorage.setItem('qtkd.session', JSON.stringify({ userId: id, signedInAt: at, lastActiveAt: Date.now() })), { id: user.id, at: now });
      await page.route('**/src/features/auth/api/authApi.ts*', route => route.fulfill({ contentType: 'text/javascript', body: `
        import { acceptAuth } from '/src/lib/http/client.ts';
        acceptAuth(${JSON.stringify(session)});
        export const IS_MOCK_AUTH = false;
        export const authApi = {
          restore: async () => ({ user: ${JSON.stringify(user)}, signedInAt: ${JSON.stringify(now)}, previousLogin: null }),
          activity: async () => {}, getDeadlines: () => null,
          checkSession: async () => ({ status: 'active', user: ${JSON.stringify(user)} }),
          getPasswordChangedAt: () => null, logout: async () => {},
        };
      ` }));
      return page;
    }
    const submitted = await createSubmitted();
    assert(submitted.id && submitted.rounds.at(-1).id, 'Contract details must expose stable approval identifiers');
    const manager = await pageFor(actors.manager);
    async function detail(page, contract) {
      await page.goto(`${origin}/hop-dong/${contract.code}`);
      await page.getByRole('heading', { name: contract.title, exact: true }).waitFor();
      await page.waitForLoadState('networkidle');
    }
    // HTML section aria-label is a landmark region; the same selectors exercise the actual detail component.
    await detail(manager, submitted);
    await manager.getByRole('button', { name: 'Tiếp nhận rà soát', exact: true }).waitFor();
    await manager.screenshot({ path: join(screenshotRoot, '01-sales-accept.png'), fullPage: true });
    await manager.getByRole('button', { name: 'Tiếp nhận rà soát', exact: true }).click();
    await manager.getByLabel('Ý kiến rà soát').waitFor();
    await manager.getByRole('button', { name: 'Chấp thuận', exact: true }).click();
    await manager.getByText('Nhập ý kiến/kết luận hoặc lý do bắt buộc.', { exact: true }).waitFor();
    assert.equal(decisionRequests.length, 0, 'An empty comment must never reach the API');
    await manager.getByLabel('Ý kiến rà soát').fill('Đồng ý điều kiện kinh doanh đã đối chiếu.');
    await manager.getByRole('button', { name: 'Chấp thuận', exact: true }).click();
    await manager.getByRole('alertdialog').getByRole('button', { name: 'Quay lại' }).click();
    assert.equal(await manager.getByLabel('Ý kiến rà soát').inputValue(), 'Đồng ý điều kiện kinh doanh đã đối chiếu.');
    // A temporary delivery failure is injected only at the HTTP boundary. Retrying keeps the payload/key and comment.
    await manager.route('**/api/v1/approvals/contracts/*/decisions', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'TEMPORARY_FAILURE' }) }), { times: 1 });
    await manager.getByRole('button', { name: 'Chấp thuận', exact: true }).click();
    await manager.getByRole('alertdialog').getByRole('button', { name: 'Xác nhận quyết định' }).click();
    await manager.getByText('Không thể xử lý yêu cầu. Hãy tải lại để kiểm tra kết quả trước khi gửi lại.', { exact: true }).waitFor();
    assert.equal(await manager.getByLabel('Ý kiến rà soát').inputValue(), 'Đồng ý điều kiện kinh doanh đã đối chiếu.');
    await manager.getByRole('button', { name: 'Chấp thuận', exact: true }).click();
    await manager.screenshot({ path: join(screenshotRoot, '02-sales-confirm.png'), fullPage: true });
    await manager.getByRole('alertdialog').getByRole('button', { name: 'Xác nhận quyết định' }).dblclick();
    await manager.getByText(/Đã chấp thuận tại Trưởng phòng Kinh doanh/).waitFor();
    await manager.waitForLoadState('networkidle');
    assert.equal(decisionRequests.length, 2, 'One failed attempt plus one successful decision; double-click does not duplicate');
    assert.equal(decisionRequests[0].key, decisionRequests[1].key, 'Retry of the same action must reuse its idempotency key');
    await manager.getByText(/Bước Pháp chế đang chờ phân công người xử lý/).waitFor();

    async function assign(contract, step, actor) {
      const snapshot = await call(`/approvals/contracts/${contract.id}?step=sales`, actors.manager.token);
      assert.equal(snapshot.status, 200, JSON.stringify(snapshot.body));
      const result = await call(`/approvals/contracts/${contract.id}/assignment`, actor.token, 'POST', {
        roundId: snapshot.body.roundId, stepId: snapshot.body.steps.find(s => s.key === step).id,
        viewedVersion: snapshot.body.version, assigneeId: actor.user.userId,
      });
      assert.equal(result.status, 200, JSON.stringify(result.body));
    }
    await assign(submitted, 'legal', actors.legal);
    const legal = await pageFor(actors.legal);
    await legal.goto(`${origin}/phe-duyet/cho-ra-soat`);
    const row = legal.getByRole('row').filter({ hasText: submitted.title });
    await row.getByRole('link', { name: 'Rà soát', exact: true }).click();
    await legal.getByLabel('Kết luận rà soát pháp lý').waitFor();
    await legal.getByRole('button', { name: 'Yêu cầu phối hợp', exact: true }).click();
    await legal.getByRole('alertdialog').getByLabel('Nội dung cần xác minh / tài liệu liên quan').waitFor();
    await legal.getByRole('alertdialog').getByRole('button', { name: 'Hủy', exact: true }).click();
    assert.equal(new URL(legal.url()).pathname, `/hop-dong/${submitted.code}`, 'Inbox actions must enter the same human-readable contract detail route');
    await legal.screenshot({ path: join(screenshotRoot, '03-legal-review.png'), fullPage: true });
    await legal.getByLabel('Kết luận rà soát pháp lý').fill('Đạt yêu cầu pháp lý; đã rà soát các điều khoản.');
    await legal.getByRole('button', { name: 'Chấp thuận', exact: true }).click();
    await legal.getByRole('alertdialog').getByRole('button', { name: 'Xác nhận quyết định' }).click();
    await legal.getByRole('button', { name: 'Trình hồ sơ lên Ban Giám đốc', exact: true }).waitFor();
    await legal.waitForLoadState('networkidle');
    await assign(submitted, 'board', actors.board);
    const board = await pageFor(actors.board);
    await detail(board, submitted);
    await board.getByText(/Hồ sơ chưa được bàn giao đến Ban Giám đốc/).waitFor();
    assert.equal(await board.getByRole('button', { name: 'Phê duyệt', exact: true }).count(), 0);
    await legal.getByRole('button', { name: 'Trình hồ sơ lên Ban Giám đốc', exact: true }).click();
    await legal.getByText(/Đã ghi nhận việc trình Ban Giám đốc/).waitFor();
    await legal.waitForLoadState('networkidle');
    await detail(board, submitted);
    await board.getByLabel('Ý kiến phê duyệt').waitFor();
    await board.screenshot({ path: join(screenshotRoot, '04-board-review.png'), fullPage: true });
    await board.getByLabel('Ý kiến phê duyệt').fill('Phê duyệt đúng phiên bản đã rà soát.');
    await board.getByRole('button', { name: 'Phê duyệt', exact: true }).click();
    await board.getByRole('alertdialog').getByRole('button', { name: 'Xác nhận quyết định' }).click();
    await board.locator('.page-header').getByText('Đã duyệt', { exact: true }).waitFor();
    await board.waitForLoadState('networkidle');
    assert.equal(await board.getByRole('button', { name: 'Phê duyệt', exact: true }).count(), 0);
    const final = await call(`/contracts/${submitted.code}`, actors.manager.token);
    assert.equal(final.body.status, 'approved'); assert.equal(final.body.rounds.at(-1).result, 'completed');
    await board.screenshot({ path: join(screenshotRoot, '05-approved-detail.png'), fullPage: true });
    await manager.goto(`${origin}/phe-duyet/ho-so/${submitted.id}?step=sales`);
    await manager.waitForURL(`**/hop-dong/${submitted.code}`);
    await manager.waitForLoadState('networkidle');

    // Revision and rejection are exercised from the same canonical detail UI as the successful path.
    for (const action of ['revision', 'reject']) {
      const contract = await createSubmitted();
      await detail(manager, contract);
      await manager.getByRole('button', { name: 'Tiếp nhận rà soát', exact: true }).click();
      await manager.getByLabel('Ý kiến rà soát').waitFor();
      const choice = action === 'revision' ? 'Yêu cầu chỉnh sửa' : 'Từ chối';
      await manager.getByRole('radio', { name: choice, exact: true }).click();
      await manager.getByLabel(action === 'revision' ? 'Nội dung cần chỉnh sửa và lý do' : 'Lý do từ chối').fill('Cần xử lý điều khoản chưa phù hợp.');
      await manager.getByRole('button', { name: choice, exact: true }).click();
      await manager.getByRole('alertdialog').getByRole('button', { name: 'Xác nhận quyết định' }).click();
      await manager.locator('.page-header').getByText(action === 'revision' ? 'Yêu cầu chỉnh sửa' : 'Bị từ chối', { exact: true }).waitFor();
      await manager.waitForLoadState('networkidle');
      const saved = await call(`/contracts/${contract.code}`, actors.manager.token);
      assert.equal(saved.body.status, action === 'revision' ? 'revision-requested' : 'rejected');
      await manager.screenshot({ path: join(screenshotRoot, `06-${action}-detail.png`), fullPage: true });
    }
    // The supplied PDF targets a desktop shell. Also verify its narrowed 1024px desktop/tablet layout.
    const narrow = await pageFor(actors.board, 1024);
    await detail(narrow, submitted);
    assert(await narrow.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Review detail should not overflow at 1024px');
    await narrow.screenshot({ path: join(screenshotRoot, '07-tablet-detail.png'), fullPage: true });
    assert.deepEqual(errors, [], 'Browser must report no uncaught component errors');
    console.log('PASS browser approval detail: role CTAs, required comments, confirmation, stable retries, real three-level workflow, revision/reject, legacy links and narrow layout');
  } catch (error) {
    console.error('Approval browser errors:', errors);
    if (browser) {
      for (const context of browser.contexts()) for (const page of context.pages()) console.error('Approval page:', page.url(), (await page.locator('body').innerText().catch(() => '')).slice(-2200));
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    if (vite.exitCode === null) { vite.kill(); await new Promise(resolve => vite.once('exit', resolve)); }
  }
}
