import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const result = spawnSync(process.execPath, [
  fileURLToPath(new URL("../node_modules/prisma/build/index.js", import.meta.url)),
  "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script",
], { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" });
assert.equal(result.status, 0, result.stderr);
const migration = readFileSync(new URL("../prisma/migrations/202611020001_dictionary/migration.sql", import.meta.url), "utf8");
const normalize = (value: string) => value.replace(/^--.*$/gm, "")
  .replace(/^BEGIN;\s*|^COMMIT;\s*|^SET LOCAL search_path = qtkd, pg_catalog;\s*/gm, "")
  .replace(/\s+/g, " ").trim();
assert.equal(normalize(migration), normalize(result.stdout), "Initial migration differs from schema.prisma. Review and regenerate before any deployment.");
console.log("PASS: initial migration matches schema; diff generated without connecting to a database.");
