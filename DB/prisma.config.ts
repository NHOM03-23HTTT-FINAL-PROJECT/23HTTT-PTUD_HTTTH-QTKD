import "dotenv/config";
import { defineConfig } from "prisma/config";

// This non-routable fallback lets validate/generate/diff work without a database.
// Commands that connect must use scripts/supabase.ts, which requires DIRECT_URL.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? "postgresql://offline:offline@offline.invalid:5432/offline?schema=qtkd",
  },
});
