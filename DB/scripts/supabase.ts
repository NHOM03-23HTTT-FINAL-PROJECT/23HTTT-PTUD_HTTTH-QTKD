import "dotenv/config";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function requireSupabaseUrl(raw = process.env.DIRECT_URL): string {
  if (!raw) throw new Error("Chưa có DIRECT_URL. Các lệnh kiểm tra offline vẫn chạy được.");
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("DIRECT_URL không phải PostgreSQL URI hợp lệ."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)
    || !/^(?:db\.[a-z0-9]+\.supabase\.co|[a-z0-9.-]+\.pooler\.supabase\.com)$/.test(url.hostname)
    || (url.port && url.port !== "5432")) {
    throw new Error("Dùng Direct connection hoặc Session pooler Supabase cổng 5432; không dùng DB local hay Transaction pooler.");
  }
  if (!url.password || /REPLACE|PROJECT_REF/i.test(raw)) throw new Error("Hãy điền URI thật trong DB/.env; không gửi secret qua chat.");
  if (url.searchParams.get("schema") !== "qtkd" || !["require", "verify-ca", "verify-full"].includes(url.searchParams.get("sslmode") ?? "")) {
    throw new Error("DIRECT_URL phải có schema=qtkd và sslmode=require (hoặc verify-full với CA phù hợp).");
  }
  return raw;
}

// Imported by the seed and tests without executing a command.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const command = process.argv[2];
    const args = command === "migrate" ? ["migrate", "deploy"] : command === "status" ? ["migrate", "status"] : command === "seed" ? ["db", "seed"] : null;
    if (!args) throw new Error("Dùng npm run migrate:deploy, npm run migrate:status hoặc npm run seed.");
    requireSupabaseUrl();
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../node_modules/prisma/build/index.js", import.meta.url)), ...args], {
      cwd: fileURLToPath(new URL("..", import.meta.url)), env: process.env, stdio: "inherit",
    });
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Không thể thực hiện lệnh.");
    process.exitCode = 1;
  }
}
