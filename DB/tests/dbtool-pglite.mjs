// QTKD.DbTool against disposable PostgreSQL (PGlite over a local socket). Never reads DB/.env or a real DIRECT_URL.
//  1. Empty DB: migrate applies every EF migration; seed twice changes nothing the second time; status is clean.
//  2. DB built the Prisma way (SQL files + _prisma_migrations): migrate refuses, adopt records the baseline
//     without DDL, then migrate applies only the EF-native migrations.
// Build first: dotnet build backend/src/QTKD.DbTool
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const sqlDir = join(repo, 'backend/src/QTKD.Infrastructure/Persistence/Migrations/Sql');
const tool = process.env.QTKD_DBTOOL_DLL ?? join(repo, 'backend/src/QTKD.DbTool/bin/Debug/net10.0/QTKD.DbTool.dll');
const temp = await mkdtemp(join(tmpdir(), 'qtkd-dbtool-'));
const emptyEnv = join(temp, 'empty.env');
await writeFile(emptyEnv, '');

const freePort = () => new Promise((resolve, reject) => {
  const socket = createServer();
  socket.on('error', reject);
  socket.listen(0, '127.0.0.1', () => { const { port } = socket.address(); socket.close(() => resolve(port)); });
});

// Async spawn: the PGlite socket server runs in this process and must keep serving while the tool runs.
const run = (port, ...args) => new Promise((resolve) => {
  const child = spawn('dotnet', [tool, ...args, '--disposable-local', '--env', emptyEnv], {
    windowsHide: true,
    env: { ...process.env, DIRECT_URL: `postgresql://postgres@127.0.0.1:${port}/postgres?schema=qtkd&sslmode=disable`,
      SEED_PASSWORD: `Aa1!${randomBytes(12).toString('hex')}` },
  });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  child.on('close', (code) => resolve({ code, out }));
});

async function withServer(prepare, body) {
  const db = await PGlite.create();
  await prepare(db);
  const port = await freePort();
  // EF opens a new connection right after closing one; with the default limit of 1 the old handler may not be gone yet.
  const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 4 });
  await server.start();
  try { await body(port, db); } finally { await server.stop(); await db.close(); }
}

const sqlFiles = (await readdir(sqlDir)).filter((n) => n.endsWith('.sql')).sort();
const prismaFiles = sqlFiles.filter((n) => /^\d{12}_/.test(n));
const count = async (db, sql) => Number((await db.query(sql)).rows[0].n);

// PGlite exits the process with code 100 on an unhandled rejection, hiding the assertion; print it first.
process.on("unhandledRejection", (error) => { console.error(error); process.exit(1); });
try {
  await withServer(async (db) => {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  }, async (port, db) => {
    let r = await run(port, 'migrate');
    assert.equal(r.code, 0, r.out);
    r = await run(port, 'status');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, new RegExp(`${sqlFiles.length} applied, 0 pending`));
    assert.equal(await count(db, "SELECT count(*) n FROM pg_tables WHERE schemaname='qtkd'"), 37); // main's 32 + customer's 4 + EF history
    assert.equal(await count(db, "SELECT count(*) n FROM pg_tables WHERE schemaname='qtkd' AND tablename IN ('customer_profile_data','customer_operation','customer_status_outbox','customer_status_delegation') AND rowsecurity"), 4);
    for (const role of ['anon', 'authenticated'])
      for (const table of ['customer_profile_data', 'customer_operation', 'customer_status_outbox', 'customer_status_delegation']) {
        const result = await db.query('SELECT has_table_privilege($1, $2, $3) AS allowed', [role, 'qtkd.' + table, 'SELECT,INSERT,UPDATE,DELETE']);
        assert.equal(result.rows[0].allowed, false, role + ' must not have direct access to ' + table);
      }
    assert.equal(await count(db, "SELECT count(*) n FROM qtkd.role_permission"), 42, 'grants bootstrapped by migration');
    assert.equal(await count(db, `SELECT count(*) n FROM pg_tables WHERE schemaname='qtkd' AND tablename='__EFMigrationsHistory' AND rowsecurity`), 1);
    r = await run(port, 'seed');
    assert.equal(r.code, 0, r.out);
    const users = await count(db, 'SELECT count(*) n FROM qtkd.user_account');
    const steps = await count(db, 'SELECT count(*) n FROM qtkd.approval_step');
    const hash = (await db.query("SELECT password_hash h FROM qtkd.user_account WHERE username='demo.admin'")).rows[0].h;
    assert.match(hash, /^\$2[aby]\$12\$/);
    r = await run(port, 'seed');
    assert.equal(r.code, 0, r.out);
    assert.equal(await count(db, 'SELECT count(*) n FROM qtkd.user_account'), users);
    assert.equal(await count(db, 'SELECT count(*) n FROM qtkd.approval_step'), steps);
    assert.equal((await db.query("SELECT password_hash h FROM qtkd.user_account WHERE username='demo.admin'")).rows[0].h, hash,
      'a second seed must not reset passwords');
    const legal = (await db.query("SELECT u.username FROM qtkd.department d JOIN qtkd.user_account u ON u.user_id=d.manager_id WHERE d.code='PC'")).rows[0];
    assert.equal(legal.username, 'demo.legal.manager');
    console.log(`PASS empty DB: migrate ${sqlFiles.length} migrations, seed twice (${users} users, ${steps} steps), status clean`);
  });


  // Upgrade the exact main EF schema, with legacy fixture rows already present.
  const baselineFile = join(temp, 'main-baseline.sql');
  const baseline = spawnSync('dotnet', ['ef', 'migrations', 'script', '0', '20261104154412_EfHistoryRls',
    '-p', 'src/QTKD.Infrastructure', '-s', 'src/QTKD.Infrastructure', '-c', 'QtkdDbContext',
    '--no-build', '--output', baselineFile], {
    cwd: join(repo, 'backend'), encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32',
  });
  assert.equal(baseline.status, 0, baseline.stderr || baseline.stdout);
  await withServer(async (db) => {
    const script = (await readFile(baselineFile, 'utf8')).replace(/^\uFEFF/, '');
    // PGlite sends one exec as one message. Commit each EF transaction boundary separately,
    // so transaction-suppressed enum additions commit before later migrations use them.
    for (const part of script.split(/(^START TRANSACTION;[ \t]*\r?$|^COMMIT;[ \t]*\r?$)/m))
      if (part.trim()) await db.exec(part);
  }, async (port, db) => {
    let r = await run(port, 'seed');
    assert.equal(r.code, 0, r.out);
    const customers = (await db.query('SELECT to_jsonb(c) data FROM qtkd.customer c ORDER BY customer_id')).rows;
    const decisions = (await db.query('SELECT to_jsonb(d) data FROM qtkd.customer_status_decision d ORDER BY decision_id')).rows;
    const audits = (await db.query('SELECT to_jsonb(a) data FROM qtkd.audit_log a ORDER BY log_id')).rows;
    r = await run(port, 'migrate');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /Applied: 20261105104547_CustomerFlow\s*$/);
    assert.deepEqual((await db.query("SELECT to_jsonb(c)-'customer_updated_at'-'flow_revision' data FROM qtkd.customer c ORDER BY customer_id")).rows, customers);
    assert.deepEqual((await db.query("SELECT to_jsonb(d)-'review_metadata' data FROM qtkd.customer_status_decision d ORDER BY decision_id")).rows, decisions);
    assert.deepEqual((await db.query('SELECT to_jsonb(a) data FROM qtkd.audit_log a ORDER BY log_id')).rows, audits);
    for (const table of ['customer_profile_data', 'customer_operation', 'customer_status_outbox', 'customer_status_delegation'])
      assert.equal(await count(db, 'SELECT count(*) n FROM qtkd.' + table), 0, table + ' must not be fabricated');
    assert.equal(await count(db, 'SELECT count(*) n FROM qtkd.customer WHERE flow_revision<>0 OR customer_updated_at IS NOT NULL'), 0);
    r = await run(port, 'migrate');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /Không có migration chờ/);
    console.log('PASS main EF upgrade: customer/decision/audit rows preserved, no invented metadata or operations, rerun unchanged');
  });

  await withServer(async (db) => {
    for (const name of prismaFiles) await db.exec(await readFile(join(sqlDir, name), 'utf8'));
    await db.exec(`CREATE TABLE qtkd._prisma_migrations (id varchar(36) PRIMARY KEY, checksum varchar(64) NOT NULL,
      finished_at timestamptz, migration_name varchar(255) NOT NULL, logs text, rolled_back_at timestamptz,
      started_at timestamptz NOT NULL DEFAULT now(), applied_steps_count int NOT NULL DEFAULT 0)`);
    for (const [i, name] of prismaFiles.entries())
      await db.query("INSERT INTO qtkd._prisma_migrations(id, checksum, finished_at, migration_name) VALUES ($1, 'x', now(), $2)",
        [String(i), name.replace(/\.sql$/, '')]);
  }, async (port, db) => {
    let r = await run(port, 'migrate');
    assert.equal(r.code, 1, 'migrate must refuse a Prisma DB that was not adopted');
    assert.match(r.out, /adopt/);
    r = await run(port, 'adopt');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, new RegExp(`Adopted: ${prismaFiles.length} baseline`));
    r = await run(port, 'adopt');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /adopt từ trước/);
    r = await run(port, 'migrate');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /Applied: \d+_EfHistoryRls, \d+_CustomerFlow$/m);
    r = await run(port, 'status');
    assert.match(r.out, new RegExp(`${sqlFiles.length} applied, 0 pending`));
    assert.equal(await count(db, 'SELECT count(*) n FROM qtkd._prisma_migrations'), prismaFiles.length, 'Prisma history is kept');
    console.log('PASS Prisma DB: migrate refused before adopt, adopt idempotent, then only EF-native migrations ran');
  });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await rm(temp, { recursive: true, force: true });
}
