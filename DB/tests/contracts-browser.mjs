import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Optional browser verification against the same disposable DB/API as contracts-api.mjs. */
export async function browserCheck({
  repo,
  salesToken,
  managerToken,
  salesUser,
  managerUser,
  apiPort,
  freePort,
  cancellationCode,
  screenshot,
}) {
  const { chromium } = await import(pathToFileURL(process.env.QTKD_PLAYWRIGHT_MODULE).href);
  const port = await freePort();
  const vite = spawn(
    process.execPath,
    [
      join(repo, 'frontend/node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    {
      cwd: join(repo, 'frontend'),
      windowsHide: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        VITE_CONTRACTS_USE_BACKEND: 'true',
        VITE_AUTH_MODE: 'api',
        QTKD_API_PROXY: `http://127.0.0.1:${apiPort}`,
      },
    },
  );
  let browser;
  try {
    const origin = `http://127.0.0.1:${port}`;
    for (let n = 0; n < 80; n++) {
      try {
        if ((await fetch(origin)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    browser = await chromium.launch({ executablePath: process.env.QTKD_BROWSER_EXECUTABLE, headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    // PGlite's socket fixture accepts one backend connection; serialize browser requests only.
    let requestTurn = Promise.resolve();
    page.on('pageerror', (error) => errors.push(error.message));
    // Supply the external identity dependency only in this isolated browser fixture.
    async function attachIdentity(page, account, token, role) {
      await page.route('**/api/v1/contracts**', async (route) => {
        const previous = requestTurn;
        let release;
        requestTurn = new Promise((resolve) => {
          release = resolve;
        });
        await previous;
        try {
          const response = await route.fetch();
          await route.fulfill({ response });
        } finally {
          release();
        }
      });
      await page.addInitScript(
        ({ userId }) => {
          sessionStorage.setItem(
            'qtkd.session',
            JSON.stringify({
              userId,
              signedInAt: new Date().toISOString(),
              lastActiveAt: Date.now(),
            }),
          );
        },
        { userId: account.userId },
      );
      const user = {
        id: account.userId,
        username: account.username,
        email: account.companyEmail,
        fullName: account.fullName,
        department: 'KD',
        permissions:
          role === 'TP_KD'
            ? ['contracts.view', 'approvals.approve', 'approvals.track']
            : ['contracts.view', 'contracts.create', 'approvals.track'],
        roles: [role],
        mustChangePassword: false,
      };
      await page.route('**/src/features/auth/api/authApi.ts*', (route) =>
        route.fulfill({
          contentType: 'text/javascript',
          body: `import { configureContractTokenProvider } from '/src/features/contracts/api/contractHttp.ts';
          configureContractTokenProvider(() => ${JSON.stringify(token)});
          export const IS_MOCK_AUTH = false;
          export const authApi = {
            restore: async () => ({ user: ${JSON.stringify(user)}, signedInAt: new Date().toISOString(), previousLogin: null }),
            activity: async () => {}, getDeadlines: () => null,
            checkSession: async () => ({ status: 'active', user: ${JSON.stringify(user)} }),
            getPasswordChangedAt: () => null, logout: async () => {},
          };`,
        }),
      );
    }
    await attachIdentity(page, salesUser, salesToken, 'NV_KD');
    await page.goto(origin + '/hop-dong');
    try {
      await page.getByRole('heading', { name: 'Hợp đồng của tôi', exact: true }).waitFor({ timeout: 15000 });
    } catch (error) {
      console.error(
        'Browser fixture errors:',
        errors,
        'URL:',
        page.url(),
        await page.locator('body').innerText(),
      );
      throw error;
    }
    await page.getByRole('link', { name: '+ Tạo hợp đồng', exact: true }).click();
    await page.getByLabel(/^Khách hàng/).fill('Logistics');
    await page.getByRole('button', { name: /Công ty Logistics Minh An Demo/ }).click();
    await page.getByRole('radio', { name: /Lập dự thảo mới/ }).click();
    await page.getByLabel(/^Tên hợp đồng/).fill('Hợp đồng kiểm tra qua trình duyệt');
    await page.getByLabel(/^Loại hợp đồng/).fill('Dịch vụ logistics');
    await page.getByLabel(/^Bắt đầu hiệu lực/).fill('2026-11-02');
    await page.getByLabel(/^Kết thúc hiệu lực/).fill('2027-11-02');
    await page.getByLabel(/^Giá trị hợp đồng/).fill('5000000');
    await page.getByLabel(/^Điều khoản thanh toán/).fill('Thanh toán trong 30 ngày');
    await page.getByRole('button', { name: '+ Thêm hạng mục dịch vụ', exact: true }).click();
    await page.locator('.contract-service-table select').nth(1).selectOption('DEMO-B01');
    await page
      .getByLabel('Nội dung hợp đồng', { exact: true })
      .fill('Nội dung thử nghiệm qua giao diện thật.');
    await page.getByRole('button', { name: 'Lưu nháp', exact: true }).click();
    await page.getByRole('heading', { name: 'Hợp đồng kiểm tra qua trình duyệt', exact: true }).waitFor();
    assert(page.url().includes('/hop-dong/HD-'));
    await page.screenshot({ path: screenshot, fullPage: true });
    await page.reload();
    await page.getByRole('heading', { name: 'Hợp đồng kiểm tra qua trình duyệt', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Hủy hồ sơ', exact: true }).click();
    await page.getByLabel(/^Lý do hủy/).fill('Kết thúc kiểm thử giao diện');
    await page.getByRole('button', { name: 'Xác nhận hủy', exact: true }).click();
    await page.getByText('Hủy hồ sơ thành công', { exact: true }).waitFor();
    await page.goto(origin + '/hop-dong/' + cancellationCode);
    await page.getByRole('button', { name: 'Đề nghị hủy', exact: true }).click();
    await page.getByLabel(/^Lý do đề nghị hủy/).fill('Đề nghị qua giao diện');
    await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await page.getByRole('heading', { name: 'Chờ Trưởng phòng Kinh doanh', exact: true }).waitFor();
    const managerPage = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    managerPage.on('pageerror', (error) => errors.push(error.message));
    await attachIdentity(managerPage, managerUser, managerToken, 'TP_KD');
    await managerPage.goto(origin + '/hop-dong/' + cancellationCode);
    await managerPage.getByRole('button', { name: 'Xem xét đề nghị', exact: true }).click();
    await managerPage.getByLabel(/^Ý kiến \/ lý do quyết định/).fill('Đồng ý hủy qua giao diện');
    await managerPage.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await managerPage.getByRole('heading', { name: 'Đã chấp thuận', exact: true }).waitFor();
    await managerPage.screenshot({ path: screenshot.replace(/\.png$/, '-cancellation.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log(
      'PASS browser contract catalogs, draft creation/reload, draft cancellation and cancellation request/decision using external identity fixtures',
    );
  } finally {
    await browser?.close();
    if (vite.exitCode === null) {
      vite.kill();
      await new Promise((r) => vite.once('exit', r));
    }
  }
}
