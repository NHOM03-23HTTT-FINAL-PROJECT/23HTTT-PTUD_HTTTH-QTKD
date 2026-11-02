import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { migrationColumns, migrationPrimaryKeys, normalizeMigrationSql, normalizeSqlWhitespace as normalize } from "./migration-shape.ts";

const result = spawnSync(process.execPath, [
  fileURLToPath(new URL("../node_modules/prisma/build/index.js", import.meta.url)),
  "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script",
], { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" });
assert.equal(result.status, 0, result.stderr);
const root = new URL("../prisma/migrations/", import.meta.url);
const migrations = normalizeMigrationSql(readdirSync(root, { withFileTypes: true }).filter(x => x.isDirectory()).map(x => x.name).sort()
  .map(name => readFileSync(new URL(name + "/migration.sql", root), "utf8")).join("\n"));
const expected = normalizeMigrationSql(result.stdout);

// Static final shape, including additive ALTERs. Never rewrite already-applied migrations.
// PostgreSQL execution, triggers, RLS and transaction behavior remain a separate integration gate.
assert.deepEqual(migrationColumns(migrations), migrationColumns(expected), "Migration column types/nullability/defaults differ from schema.");
for (const fk of expected.matchAll(/ALTER TABLE "\w+" ADD CONSTRAINT [^;]+FOREIGN KEY[^;]+;/g))
  assert(normalize(migrations).includes(normalize(fk[0])), "Missing or changed model foreign key: " + fk[0]);
for (const index of expected.matchAll(/CREATE (?:UNIQUE )?INDEX [^;]+;/g))
  assert(normalize(migrations).includes(normalize(index[0])), "Missing or changed model index: " + index[0]);
assert.deepEqual(migrationPrimaryKeys(migrations), migrationPrimaryKeys(expected), "Migration primary keys differ from schema.");
const enums = (sql: string) => [...sql.matchAll(/CREATE TYPE "\w+" AS ENUM \([^;]+;/g)].map(x => normalize(x[0])).sort();
assert.deepEqual(enums(migrations), enums(expected), "Migration enum definitions differ from schema.");
console.log("PASS: static migration columns/types/nullability/defaults, PK/FK and model indexes. PostgreSQL replay NOT checked.");
