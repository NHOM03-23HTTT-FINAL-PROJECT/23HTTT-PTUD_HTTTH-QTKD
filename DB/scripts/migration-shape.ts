import assert from "node:assert/strict";

// The initial migration sets search_path=qtkd and omits qualification; later ones qualify identifiers.
// Normalize this representation and CRLF before comparing, without changing the applied SQL files.
export const normalizeMigrationSql = (sql: string) => sql.replace(/\r\n/g, "\n").replace(/"qtkd"\./g, "");
export const normalizeSqlWhitespace = (value: string) => value.replace(/,\s*$/, "").replace(/\s+/g, " ").trim();

export const migrationPrimaryKeys = (sql: string) => [...sql.matchAll(/CONSTRAINT "\w+_pkey" PRIMARY KEY \([^\n]+/g)]
  .map(x => normalizeSqlWhitespace(x[0]).replace(/,\s+(?=")/g, ",")).sort();

export function migrationColumns(input: string) {
  const sql = normalizeMigrationSql(input);
  const tables = new Map<string, Map<string, string>>();
  for (const match of sql.matchAll(/CREATE TABLE "(\w+)"\s*\(([\s\S]*?)\);/g))
    tables.set(match[1], new Map([...match[2].matchAll(/^\s*"(\w+)"\s+([^\n]+)/gm)].map(x => [x[1], normalizeSqlWhitespace(x[2])])));
  for (const match of sql.matchAll(/ALTER TABLE "(\w+)" ADD COLUMN "(\w+)" ([^;]+);/g)) {
    const table = tables.get(match[1]);
    assert(table, "ALTER references missing table: " + match[1]);
    table.set(match[2], normalizeSqlWhitespace(match[3]));
  }
  for (const match of sql.matchAll(/ALTER TABLE "(\w+)" ALTER COLUMN "(\w+)" (SET|DROP) NOT NULL;/g)) {
    const table = tables.get(match[1]);
    const value = table?.get(match[2]);
    assert(value, "ALTER references missing column: " + match[1] + "." + match[2]);
    if (match[3] === "DROP") table!.set(match[2], value.replace(/\s+NOT NULL\b/, ""));
    else if (!value.includes("NOT NULL")) table!.set(match[2], value.replace(/ DEFAULT /, " NOT NULL DEFAULT ") + (value.includes(" DEFAULT ") ? "" : " NOT NULL"));
  }
  return [...tables].sort(([a], [b]) => a.localeCompare(b)).map(([table, cols]) => [table, [...cols].sort(([a], [b]) => a.localeCompare(b))]);
}
