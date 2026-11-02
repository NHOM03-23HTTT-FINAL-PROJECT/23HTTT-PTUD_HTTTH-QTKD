import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { buildSeedData } from "./seed-data.js";
import { validateSeedData } from "../scripts/validate-seed.js";
import { requireSupabaseUrl } from "../scripts/supabase.js";
import { readSchema } from "../scripts/schema-info.js";

async function main() {
  if (process.argv.includes("--dry-run")) {
    const counts = validateSeedData(buildSeedData("OFFLINE_ONLY_NOT_A_PASSWORD_HASH"));
    console.table(counts);
    console.log("PASS: fixture integrity checked offline. No connection, schema creation or INSERT executed.");
    return;
  }
  const connectionString = requireSupabaseUrl();
  const password = process.env.SEED_PASSWORD;
  if (!password || password.startsWith("REPLACE_") || password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("SEED_PASSWORD cần ít nhất 12 ký tự, tối đa 72 byte UTF-8; đặt trong DB/.env.");
  }
  const data = buildSeedData(await hash(password, 12));
  validateSeedData(data);
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema: "qtkd" }) });
  try {
    await client.$transaction(async (tx) => {
      // Serialize concurrent seed invocations. No cleanup, password reset or destructive reset.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('qtkd-demo-seed-v1', 0))`;
      await tx.department.createMany({ data: data.department.map((row) => ({ ...row, managerId: null })), skipDuplicates: true });
      await tx.userAccount.createMany({ data: data.userAccount, skipDuplicates: true });
      for (const row of data.department) {
        await tx.department.updateMany({ where: { departmentId: row.departmentId, managerId: null }, data: { managerId: row.managerId } });
      }
      await tx.service.createMany({ data: data.service, skipDuplicates: true });
      // Parents precede children; rows are deliberately inserted in separate statements.
      for (const row of data.area) await tx.area.createMany({ data: [row], skipDuplicates: true });
      await tx.customer.createMany({ data: data.customer, skipDuplicates: true });
      await tx.customerStatusDecision.createMany({ data: data.customerStatusDecision, skipDuplicates: true });
      for (const row of data.contract) await tx.contract.createMany({ data: [row], skipDuplicates: true });
      await tx.areaService.createMany({ data: data.areaService, skipDuplicates: true });
      await tx.areaAssignment.createMany({ data: data.areaAssignment, skipDuplicates: true });
      await tx.contractItem.createMany({ data: data.contractItem, skipDuplicates: true });
      await tx.priceList.createMany({ data: data.priceList, skipDuplicates: true });
      await tx.priceListLine.createMany({ data: data.priceListLine, skipDuplicates: true });
      await tx.volumePeriod.createMany({ data: data.volumePeriod, skipDuplicates: true });
      await tx.volumeLine.createMany({ data: data.volumeLine, skipDuplicates: true });
      await tx.paymentStatement.createMany({ data: data.paymentStatement, skipDuplicates: true });
      await tx.paymentStatementLine.createMany({ data: data.paymentStatementLine, skipDuplicates: true });
      await tx.reconciliation.createMany({ data: data.reconciliation, skipDuplicates: true });
      await tx.changeRequest.createMany({ data: data.changeRequest, skipDuplicates: true });
      await tx.approvalRound.createMany({ data: data.approvalRound, skipDuplicates: true });
      for (const row of data.approvalStep) await tx.approvalStep.createMany({ data: [row], skipDuplicates: true });
      await tx.attachment.createMany({ data: data.attachment, skipDuplicates: true });
      await tx.signingSession.createMany({ data: data.signingSession, skipDuplicates: true });
      await tx.notification.createMany({ data: data.notification, skipDuplicates: true });
      await tx.loginSession.createMany({ data: data.loginSession, skipDuplicates: true });
      await tx.passwordOtp.createMany({ data: data.passwordOtp, skipDuplicates: true });
      await tx.auditLog.createMany({ data: data.auditLog, skipDuplicates: true });

      // A collision on username/email/natural keys must fail rather than silently leave a partial fixture.
      const records = data as unknown as Record<string, Record<string, unknown>[]>;
      for (const model of readSchema()) {
        const primary = model.fields.find((field) => field.attributes.includes("@id"));
        if (!primary) continue; // AREA_SERVICE has a composite PK; its FKs are validated above.
        if (!/^[a-z_]+$/.test(model.table) || !/^[a-z_]+$/.test(primary.column!)) throw new Error("Invalid internal identifier");
        const keys = records[model.delegate].map((row) => row[primary.name]);
        const rows = await tx.$queryRawUnsafe<{ count: bigint }[]>(
          `SELECT count(*) FROM qtkd."${model.table}" WHERE "${primary.column}" = ANY($1::uuid[])`, keys);
        if (Number(rows[0].count) !== keys.length) throw new Error(`Seed ID collision: ${model.name}`);
      }
    }, { timeout: 120_000, maxWait: 15_000 });
    console.log("Seed committed. Existing demo rows and passwords were preserved.");
  } finally {
    await client.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Prisma connection errors can include connection details; do not echo their raw message.
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
  console.error(code ? `Seed failed (${code}); transaction rolled back. Check your private DB configuration.`
    : error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Seed failed; transaction rolled back.");
  process.exitCode = 1;
});
