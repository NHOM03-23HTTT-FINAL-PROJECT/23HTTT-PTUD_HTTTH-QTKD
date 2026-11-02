import assert from "node:assert/strict";
import { Prisma } from "../generated/prisma/client.js";
import type { SeedData } from "../prisma/seed-data.js";
import { readSchema } from "./schema-info.js";

export function validateSeedData(data: SeedData) {
  const records = data as unknown as Record<string, Record<string, unknown>[]>;
  const models = readSchema();
  const modelByName = new Map(models.map((model) => [model.name, model]));
  assert.equal(Object.keys(data).length, 26, "The demo must cover all 26 dictionary tables.");
  for (const model of models) {
    const rows = records[model.delegate];
    assert(rows?.length, `Missing fixtures: ${model.name}`);
    for (const columns of model.uniques) {
      const keys = rows.filter((row) => columns.every((col) => row[col] != null))
        .map((row) => columns.map((col) => String(row[col])).join("|"));
      assert.equal(new Set(keys).size, keys.length, `Duplicate key in ${model.name}: ${columns}`);
    }
    for (const row of rows) {
      for (const field of model.fields.filter((field) => field.column)) {
        if (!field.type.endsWith("?") && !field.attributes.includes("@default")) {
          assert(row[field.name] != null, `Required field missing: ${model.name}.${field.name}`);
        }
      }
      for (const relation of model.relations) {
        if (relation.fields.every((field) => row[field] == null)) continue;
        const target = modelByName.get(relation.target)!;
        assert(records[target.delegate].some((other) => relation.fields.every((field, i) =>
          other[relation.references[i]] === row[field])), `Broken FK: ${model.name}.${relation.fields}`);
      }
    }
  }
  for (const field of ["username", "companyEmail"] as const) {
    const keys = data.userAccount.map((row) => row[field].trim().toLowerCase());
    assert.equal(new Set(keys).size, keys.length, `Case-insensitive duplicate ${field}`);
  }
  const areaCodes = data.area.map((row) => row.areaCode.trim().toLowerCase());
  assert.equal(new Set(areaCodes).size, areaCodes.length, "Case-insensitive duplicate area code");
  for (const customer of data.customer) {
    assert(/^\d{10}(\d{3})?$/.test(customer.taxCode), "Invalid tax code");
    assert(customer.phone?.trim() || ("email" in customer && customer.email?.trim()), "Missing customer contact");
  }
  const areas = new Map(data.area.map((row) => [row.areaId, row]));
  const siblingNames = new Set<string>();
  for (const area of data.area) {
    const visited = new Set<string>();
    let cursor: typeof area | undefined = area;
    const path: string[] = [];
    while (cursor) {
      assert(!visited.has(cursor.areaId), "Area hierarchy cycle");
      visited.add(cursor.areaId); path.unshift(cursor.areaCode);
      cursor = "parentAreaId" in cursor ? areas.get(cursor.parentAreaId!) : undefined;
    }
    assert.equal(path.length, area.level, "Incorrect area level");
    assert(path.length <= 3, "Area depth exceeds 3");
    assert.equal(area.hierarchyPath, `/${path.join("/")}`, "Incorrect area hierarchy path");
    assert(new Prisma.Decimal(area.areaM2).gt(0) && new Prisma.Decimal(area.capacity).gt(0), "Non-positive area dimensions");
    const key = `${"parentAreaId" in area ? area.parentAreaId : "root"}|${area.areaName.trim().toLocaleLowerCase("vi")}`;
    assert(!siblingNames.has(key), "Duplicate sibling area name"); siblingNames.add(key);
  }
  for (const contract of data.contract) {
    assert(contract.endDate > contract.startDate, "Invalid contract dates");
    assert(new Prisma.Decimal(contract.contractValue).gte(0), "Negative contract value");
  }
  for (const line of data.paymentStatementLine) {
    assert(new Prisma.Decimal(line.amount).eq(new Prisma.Decimal(line.quantity).mul(line.unitPrice)), "Incorrect payment line amount");
    const price = data.priceListLine.find((row) => row.lineId === line.priceListLineId)!;
    const volume = data.volumeLine.find((row) => row.volumeLineId === line.volumeLineId)!;
    assert.equal(price.serviceId, volume.serviceId, "Payment service mismatch");
    assert.equal(price.areaId, volume.areaId, "Payment area mismatch");
    assert(new Prisma.Decimal(line.unitPrice).eq(price.unitPrice), "Incorrect price snapshot");
  }
  for (const statement of data.paymentStatement) {
    const lines = data.paymentStatementLine.filter((row) => row.statementId === statement.statementId);
    const subtotal = lines.reduce((sum, row) => sum.add(row.amount), new Prisma.Decimal(0));
    assert(subtotal.eq(statement.subtotal), "Incorrect payment subtotal");
    assert(subtotal.add(statement.taxAmount).eq(statement.totalAmount), "Incorrect payment total");
    const period = data.volumePeriod.find((row) => row.volumePeriodId === statement.volumePeriodId)!;
    assert.equal(period.contractId, statement.contractId, "Payment volume contract mismatch");
    assert.equal(period.billingPeriod, statement.billingPeriod, "Payment billing period mismatch");
    assert.equal(period.status, "Locked", "Payment requires locked volume");
    assert(statement.status !== "Issued" || statement.isLocked, "Issued payment is not locked");
  }
  const running = new Set<string>();
  for (const round of data.approvalRound) {
    const source = round.recordType === "Contract" ? round.contractId : round.statementId;
    const steps = data.approvalStep.filter((row) => row.roundId === round.roundId).sort((a, b) => a.stepOrder - b.stepOrder);
    assert(steps.length, "Approval round has no steps");
    if (round.result === "Running") {
      assert(!running.has(source!), "Duplicate running approval round"); running.add(source!);
      assert.equal(steps.filter((step) => ["Pending", "Reviewing"].includes(step.stepStatus!)).length, 1, "Round must have one current step");
    }
    if (round.result === "Completed") {
      assert(steps.every((step) => step.stepStatus === "Completed" && step.decision === "Approve"), "Approval completed before every step approved");
      assert(round.endedAt && steps.every((step) => step.decidedAt && new Date(step.decidedAt) <= round.endedAt!), "Approval timestamps out of order");
    }
    for (const step of steps.filter((step) => step.decision)) {
      assert.equal(step.decidedBy, step.assigneeId, "Decision actor is not assignee");
      assert(step.comment?.trim(), "Decision requires a comment");
      assert(step.decidedBy !== round.submittedBy, "Submitter cannot approve own document");
    }
  }
  for (const session of data.signingSession) {
    assert(data.userAccount.find((user) => user.userId === session.companySignerId)?.canSign, "Company signer lacks signing authority");
    const file = data.attachment.find((row) => row.attachmentId === session.signedFileId)!;
    assert.equal(file.recordType, session.recordType, "Signed file belongs to another document type");
    assert.equal(file.contractId ?? file.statementId, session.contractId ?? session.statementId, "Signed file belongs to another document");
  }
  assert(data.loginSession.every((row) => row.isRevoked), "Demo must not create live sessions");
  assert(data.passwordOtp.every((row) => row.isUsed), "Demo must not create usable OTPs");
  return Object.fromEntries(Object.entries(data).map(([table, rows]) => [table, rows.length]));
}
