import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const { QTKD_PLAYWRIGHT_PACKAGE: pkg, QTKD_BROWSER_PATH: executablePath, QTKD_UI_ARTIFACTS: output,
  QTKD_UI_API_ACTOR: actor, QTKD_UI_API_CUSTOMER: code } = process.env;
if (!pkg || !executablePath || !output || !actor || !code) throw new Error('Explicit local browser test configuration required');
const base = process.env.QTKD_UI_BASE ?? 'http://localhost:5173';
if (new URL(base).hostname !== 'localhost') throw new Error('Use the local development origin permitted by the API');
const { chromium } = createRequire(import.meta.url)(pkg);
const browser = await chromium.launch({ headless: true, executablePath });
const results = [];
await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const customerRequests = [];
  page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/v1/customers')) customerRequests.push(r.url()); });
  await page.goto(base + '/dang-nhap');
  await page.locator('input[name="username"]').fill(actor);
  await page.locator('input[name="password"]').fill('Customer.Test@2026');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(u => !u.pathname.includes('dang-nhap'));
  for (const path of ['/khach-hang', '/khach-hang/tao-moi', '/khach-hang/' + code, '/khach-hang/' + code + '/chinh-sua']) {
    await page.goto(base + path);
    await page.getByText('Chức năng chưa sẵn sàng', { exact: true }).waitFor();
    assert.equal(await page.locator('.data-table').count(), 0);
    results.push({ path, outcome: 'blocked-by-main-business-route', verified: true });
  }
  assert.deepEqual(customerRequests, []);
  await page.screenshot({ path: join(output, 'api-mode-main-guard.png'), fullPage: true });
  console.log('PASS real API login: all four main customer routes stay unavailable and never mount mock data or call customer APIs');
} finally {
  await browser.close();
  await writeFile(join(output, 'api-mode-report.json'), JSON.stringify({ results, interpretation: 'Expected main guard behavior; live customer UI integration is unavailable' }, null, 2));
}
