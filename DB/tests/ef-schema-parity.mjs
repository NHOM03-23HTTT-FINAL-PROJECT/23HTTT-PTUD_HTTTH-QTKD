// EF Core model ↔ migration SQL parity on disposable PostgreSQL (PGlite, WASM). Never reads DB/.env or DIRECT_URL.
//   A = the migration SQL files (backend/.../Migrations/Sql), i.e. the real schema.
//   B = "dotnet ef dbcontext script", i.e. DDL produced from the EF model only.
// Tables, columns, PK/unique/FK, indexes, sequences and enum labels must match. Objects that only the SQL files
// define (CHECK, trigger, function, RLS, expression/partial indexes) must be in the allow-list below.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const backend = join(repo, 'backend');
const sqlDir = join(backend, 'src/QTKD.Infrastructure/Persistence/Migrations/Sql');

// Indexes only the migration SQL can express (expressions, partial predicates).
const sqlOnlyIndexes = new Set([
  'user_username_ci', 'user_email_ci', 'area_code_ci', 'area_sibling_name_ci', 'payment_one_processing',
  'round_one_running_contract', 'round_one_running_payment', 'step_one_current', 'signing_one_contract',
  'signing_one_payment', 'contract_file_name_unique', 'cancellation_one_pending',
]);

async function catalog(db) {
  await db.exec('SET search_path = qtkd, pg_catalog');
  const rows = async (sql) => (await db.query(sql)).rows.map((r) => Object.values(r).join(' | ')).sort();
  const skip = `('_prisma_migrations','__EFMigrationsHistory')`;
  return {
    tables: await rows(`SELECT tablename FROM pg_tables WHERE schemaname='qtkd' AND tablename NOT IN ${skip}`),
    columns: await rows(`SELECT table_name, column_name, udt_schema||'.'||udt_name, coalesce(character_maximum_length,-1),
        coalesce(numeric_precision,-1)||','||coalesce(numeric_scale,-1), coalesce(datetime_precision,-1), is_nullable, coalesce(column_default,'')
      FROM information_schema.columns WHERE table_schema='qtkd' AND table_name NOT IN ${skip}`),
    constraints: await rows(`SELECT conrelid::regclass::text, conname, contype,
        regexp_replace(pg_get_constraintdef(oid), ' ON UPDATE (RESTRICT|CASCADE|NO ACTION|SET NULL|SET DEFAULT)', '')
      FROM pg_constraint WHERE connamespace='qtkd'::regnamespace AND contype IN ('p','u','f')`),
    indexes: await rows(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='qtkd' AND tablename NOT IN ${skip}`),
    sequences: await rows(`SELECT sequencename, data_type, start_value, increment_by FROM pg_sequences WHERE schemaname='qtkd'`),
    enums: await rows(`SELECT t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumlabel) FROM pg_type t
      JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typnamespace='qtkd'::regnamespace GROUP BY t.typname`),
  };
}

const fromSql = await PGlite.create();
for (const name of (await readdir(sqlDir)).filter((n) => n.endsWith('.sql')).sort()) {
  if (name.includes('_EfHistoryRls')) continue; // needs the EF history table, which B does not create either
  await fromSql.exec(await readFile(join(sqlDir, name), 'utf8'));
}

const script = spawnSync('dotnet', ['ef', 'dbcontext', 'script', '-p', 'src/QTKD.Infrastructure', '-s', 'src/QTKD.Infrastructure',
  '-c', 'QtkdDbContext'], { cwd: backend, encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32' });
assert.equal(script.status, 0, script.stderr || script.stdout);
const fromModel = await PGlite.create();
await fromModel.exec(script.stdout.replace(/^Build (started|succeeded)\.\.?.*$/gm, ''));

const a = await catalog(fromSql);
const b = await catalog(fromModel);
const problems = [];
for (const key of Object.keys(a)) {
  const onlySql = a[key].filter((x) => !b[key].includes(x));
  const onlyModel = b[key].filter((x) => !a[key].includes(x));
  const unexpected = key === 'indexes' ? onlySql.filter((x) => !sqlOnlyIndexes.has(x.split(' | ')[0])) : onlySql;
  if (unexpected.length) problems.push(`${key} only in migration SQL:\n  ${unexpected.join('\n  ')}`);
  if (onlyModel.length) problems.push(`${key} only in EF model:\n  ${onlyModel.join('\n  ')}`);
}
for (const name of sqlOnlyIndexes)
  if (!a.indexes.some((x) => x.startsWith(name + ' | '))) problems.push(`allow-listed index ${name} no longer exists; update the list`);
assert.equal(problems.length, 0, '\n' + problems.join('\n'));
console.log(`PASS: EF model matches migration SQL (${a.tables.length} tables, ${a.columns.length} columns, ` +
  `${a.constraints.length} keys/FKs, ${a.indexes.length} indexes, ${a.sequences.length} sequences, ${a.enums.length} enums). ` +
  'ON UPDATE actions are not compared (EF cannot express them).');
await fromSql.close();
await fromModel.close();
