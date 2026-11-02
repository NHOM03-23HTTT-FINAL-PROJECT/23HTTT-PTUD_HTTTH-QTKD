import "dotenv/config";
import { Client } from "pg";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { requireSupabaseUrl } from "./supabase.js";

const hints: Record<string, string> = {
  SELF_SIGNED_CERT_IN_CHAIN: "TLS trust failed. Download the database CA from Supabase Database Settings > SSL Configuration; use sslmode=verify-full and sslrootcert pointing to that file.",
  DEPTH_ZERO_SELF_SIGNED_CERT: "TLS trust failed. Configure the trusted database CA using sslrootcert and sslmode=verify-full.",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "TLS chain could not be verified. Check the database CA file and any network TLS inspection.",
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "TLS issuer is not trusted. Configure the database CA using sslrootcert.",
  ERR_TLS_CERT_ALTNAME_INVALID: "TLS hostname mismatch. Copy the exact Direct/Session host from Supabase Connect; do not replace it with an IP address.",
  CERT_HAS_EXPIRED: "TLS certificate expired. Check the system clock and obtain the current certificate from the trusted provider.",
  ENOTFOUND: "DNS resolution failed. Check the Connect hostname and DNS/network. Use the exact Session pooler URI (port 5432) if direct IPv6 is unavailable.",
  EAI_AGAIN: "DNS lookup temporarily failed. Check DNS/network before retrying.",
  ENETUNREACH: "Network route unavailable. If direct IPv6 is unavailable, use the exact Session pooler URI from Supabase Connect (port 5432).",
  ECONNREFUSED: "Connection refused. Check project availability, network restrictions and port 5432.",
  ETIMEDOUT: "Connection timed out. Check network/firewall, project availability and port 5432.",
  ENOENT: "A configured certificate file was not found. Check sslrootcert; relative paths resolve from DB when running the npm command.",
  "28P01": "Database authentication failed. Verify the database password, URI encoding and the username for the selected Direct/Session connection.",
  "28000": "Database authentication rejected. Check the exact username and project connection settings.",
};

// Never print raw errors: pg/TLS errors may contain hostnames, paths or connection credentials.
export function connectionFailure(error: unknown): string {
  const pending: unknown[] = [error];
  const seen = new Set<unknown>();
  while (pending.length && seen.size < 20) {
    const item = pending.shift();
    if (!item || typeof item !== "object" || seen.has(item)) continue;
    seen.add(item);
    const value = item as { code?: unknown; cause?: unknown; errors?: unknown[]; message?: unknown };
    if (typeof value.code === "string" && Object.hasOwn(hints, value.code))
      return `FAIL [${value.code}]: ${hints[value.code]}`;
    if (value.cause) pending.push(value.cause);
    if (Array.isArray(value.errors)) pending.push(...value.errors);
  }
  return "FAIL [UNKNOWN]: Connection/query failed. Check private configuration locally; do not share the URI or raw error. No seed was executed.";
}

async function main() {
  let connectionString: string;
  try { connectionString = requireSupabaseUrl(); }
  catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid private database configuration.");
    process.exitCode = 1;
    return;
  }
  let client: Client | undefined;
  try {
    client = new Client({ connectionString, connectionTimeoutMillis: 10_000, query_timeout: 10_000 });
    await client.connect();
    await client.query("SELECT 1 AS ok");
    console.log("PASS: database connection and SELECT 1 succeeded. No migration or seed executed.");
  } catch (error) {
    console.error(connectionFailure(error));
    process.exitCode = 1;
  } finally {
    await client?.end().catch(() => {});
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) void main();
