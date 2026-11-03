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
  for (const statement of sql.matchAll(/ALTER TABLE "(\w+)" ([^;]+);/g)) {
    const table = tables.get(statement[1]);
    for (const column of statement[2].matchAll(/ADD COLUMN\s+"(\w+)"\s+([^\n]+?)(?=,?\s*\n|$)/g)) {
      assert(table, "ALTER references missing table: " + statement[1]);
      table.set(column[1], normalizeSqlWhitespace(column[2]));
    }
    for (const change of statement[2].matchAll(/ALTER COLUMN "(\w+)" (SET|DROP) NOT NULL/g)) {
      const value = table?.get(change[1]);
      assert(value, "ALTER references missing column: " + statement[1] + "." + change[1]);
      table!.set(change[1], change[2] === "DROP" ? value.replace(/ NOT NULL/g, "") :
        value.includes("NOT NULL") ? value : value.replace(/ DEFAULT /, " NOT NULL DEFAULT ") + (value.includes(" DEFAULT ") ? "" : " NOT NULL"));
    }
  }
  return [...tables].sort(([a], [b]) => a.localeCompare(b)).map(([table, cols]) => [table, [...cols].sort(([a], [b]) => a.localeCompare(b))]);
}
