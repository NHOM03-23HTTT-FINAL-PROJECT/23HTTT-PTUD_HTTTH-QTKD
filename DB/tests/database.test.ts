import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildSeedData, ids } from "../prisma/seed-data.js";
import { readSchema } from "../scripts/schema-info.js";
import { validateSeedData } from "../scripts/validate-seed.js";
import { requireSupabaseUrl } from "../scripts/supabase.js";

const fixture = () => buildSeedData("OFFLINE_ONLY_NOT_A_PASSWORD_HASH");

test("all 26 source tables and all 239 active columns are mapped", () => {
  const source = JSON.parse(readFileSync(new URL("../data-dictionary/source-columns.json", import.meta.url), "utf8")) as {
    tables: Record<string, string[]>; foreignKeys: { table: string; column: string; target: string }[];
  };
  const models = readSchema();
  assert.deepEqual(models.map((model) => model.table).sort(), Object.keys(source.tables).sort());
  assert.equal(Object.values(source.tables).flat().length, 239);
  for (const model of models) {
    const actual = model.fields.flatMap((field) => field.column ? [field.column] : []);
    for (const column of source.tables[model.table]) assert(actual.includes(column), `${model.table}.${column}`);
    const additions = actual.filter((column) => !source.tables[model.table].includes(column));
    assert.deepEqual(additions, model.name === "Contract" ? ["updated_at"] : []);
  }
  const actualFks = models.flatMap((model) => model.relations.flatMap((relation) => relation.fields.map((field) => ({
    table: model.table, column: model.fields.find((item) => item.name === field)!.column!,
    target: models.find((item) => item.name === relation.target)!.table,
  }))));
  const normalize = (items: typeof actualFks) => items.map((item) => `${item.table}.${item.column}->${item.target}`).sort();
  assert.deepEqual(normalize(actualFks), normalize(source.foreignKeys));
});

test("valid complete fixture passes without any connection", () => {
  const counts = validateSeedData(fixture());
  assert.equal(Object.keys(counts).length, 26);
  assert.equal(counts.userAccount, 9);
  assert.equal(counts.department, 6);
});

test("missing foreign key and duplicate account are rejected", () => {
  const data = fixture(); data.customer[0].accountManagerId = "missing-user";
  assert.throws(() => validateSeedData(data), /Broken FK/);
  const duplicate = fixture(); duplicate.userAccount[1].username = duplicate.userAccount[0].username;
  assert.throws(() => validateSeedData(duplicate), /Duplicate key/);
});

test("invalid tax code and empty customer contact are rejected", () => {
  const data = fixture(); data.customer[0].taxCode = "123";
  assert.throws(() => validateSeedData(data), /tax code/);
  const contact = fixture(); contact.customer[0].phone = ""; contact.customer[0].email = "";
  assert.throws(() => validateSeedData(contact), /customer contact/);
});

test("area cycles, excess depth and stale hierarchy path are rejected", () => {
  const cycle = fixture();
  cycle.area[1].parentAreaId = ids.block;
  assert.throws(() => validateSeedData(cycle), /cycle/);
  const deep = fixture();
  const child = deep.area.find((row) => row.areaId === ids.suspendedBlock)!;
  child.parentAreaId = ids.block; child.level = 4;
  assert.throws(() => validateSeedData(deep), /depth/);
  const path = fixture(); path.area[1].hierarchyPath = "/wrong";
  assert.throws(() => validateSeedData(path), /hierarchy path/);
});

test("line arithmetic, totals and source contract must match", () => {
  const line = fixture(); line.paymentStatementLine[0].amount = "1.00";
  assert.throws(() => validateSeedData(line), /line amount/);
  const total = fixture(); total.paymentStatement[0].totalAmount = "1.00";
  assert.throws(() => validateSeedData(total), /payment total/);
  const volume = fixture(); volume.volumePeriod[0].contractId = ids.draftContract;
  assert.throws(() => validateSeedData(volume), /volume contract/);
});

test("duplicate running round and wrong decision actor are rejected", () => {
  const data = fixture();
  const current = data.approvalRound.find((row) => row.result === "Running")!;
  data.approvalRound.push({ ...current, roundId: "00000000-0000-4000-8000-000000009999", roundNo: 2 });
  data.approvalStep.push({ ...data.approvalStep.find((step) => step.roundId === current.roundId)!,
    roundId: "00000000-0000-4000-8000-000000009999", stepId: "00000000-0000-4000-8000-000000009998" });
  assert.throws(() => validateSeedData(data), /Duplicate running/);
  const actor = fixture(); actor.approvalStep[0].decidedBy = ids.admin;
  assert.throws(() => validateSeedData(actor), /not assignee/);
});

test("snapshots remain independent from changed live names and prices", () => {
  const data = fixture();
  const round = data.approvalRound[0];
  const historical = structuredClone(round.recordSnapshot);
  data.customer[0].customerName = "Tên mới"; data.area[3].areaName = "Khu vực mới";
  data.priceListLine[0].unitPrice = "999999.00";
  assert.deepEqual(round.recordSnapshot, historical);
  assert.equal(data.paymentStatement[0].customerNameSnapshot, "Công ty Logistics Minh An Demo");
  assert.equal(data.paymentStatementLine[0].unitPrice, "100000.00");
});

test("unrevoked sessions, unused OTP and unauthorized signer are rejected", () => {
  const session = fixture(); Object.assign(session.loginSession[0], { isRevoked: false });
  assert.throws(() => validateSeedData(session), /live sessions/);
  const otp = fixture(); Object.assign(otp.passwordOtp[0], { isUsed: false });
  assert.throws(() => validateSeedData(otp), /usable OTP/);
  const signer = fixture(); signer.userAccount.find((row) => row.userId === ids.boardMember)!.canSign = false;
  assert.throws(() => validateSeedData(signer), /signing authority/);
});

test("connection guard permits Supabase direct/session URLs only, without revealing secrets", () => {
  const secret = "private-example-password";
  const direct = `postgresql://postgres:${secret}@db.abcdefghijkl.supabase.co:5432/postgres?schema=qtkd&sslmode=require`;
  assert.equal(requireSupabaseUrl(direct), direct);
  const session = `postgresql://postgres.abcdefghijkl:${secret}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?schema=qtkd&sslmode=require`;
  assert.equal(requireSupabaseUrl(session), session);
  for (const value of ["", "not-a-url", direct.replace("db.abcdefghijkl.supabase.co", "localhost"),
    session.replace(":5432", ":6543"), direct.replace("schema=qtkd", "schema=public"), direct.replace("&sslmode=require", "")]) {
    assert.throws(() => requireSupabaseUrl(value), (error: Error) => !error.message.includes(secret));
  }
});

test("connection CLI exits before attempting migration when no Supabase URL exists", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/supabase.ts", "status"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8", env: { ...process.env, DIRECT_URL: "" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Chưa có DIRECT_URL/);
});
