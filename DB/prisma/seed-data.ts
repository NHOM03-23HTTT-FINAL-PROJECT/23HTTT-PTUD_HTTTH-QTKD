import { createHash } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.ts";
import { buildIdentitySeed } from "./identity-catalog.js";

const id = (group: number, row = 1) =>
  `00000000-0000-4000-8000-${(group * 1000 + row).toString(16).padStart(12, "0")}`;
const at = (value: string) => new Date(value);
const createdAt = at("2026-10-01T02:00:00Z");
const approvedAt = at("2026-10-02T02:00:00Z");
const signedAt = at("2026-10-03T02:00:00Z");
const sentAt = at("2026-11-01T02:00:00Z");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export const ids = {
  sales: id(1), operations: id(1, 2), accounting: id(1, 3), legal: id(1, 4),
  board: id(1, 5), adminDepartment: id(1, 6),
  salesStaff: id(2), salesManager: id(2, 2), operationsStaff: id(2, 3),
  operationsManager: id(2, 4), accountant: id(2, 5), accountingReviewer: id(2, 6),
  legalStaff: id(2, 7), boardMember: id(2, 8), admin: id(2, 9), legalManager: id(2, 10), boardChair: id(2, 11),
  customer: id(8), suspendedCustomer: id(8, 2),
  port: id(10), yard: id(10, 2), block: id(10, 3), warehouse: id(10, 4), suspendedBlock: id(10, 5),
  lifting: id(11), storage: id(11, 2),
  contract: id(14), submittedContract: id(14, 2), draftContract: id(14, 3), appendix: id(14, 4),
  assignSalesContract: id(14, 5), assignLegalContract: id(14, 6), assignBoardContract: id(14, 7),
  item: id(15), price: id(16), liftingPrice: id(17), storagePrice: id(17, 2),
  volume: id(18), liftingVolume: id(19), storageVolume: id(19, 2), statement: id(20),
  contractRound: id(24), currentRound: id(24, 2), paymentRound: id(24, 3),
  assignSalesRound: id(24, 4), assignLegalRound: id(24, 5), assignBoardRound: id(24, 6),
  contractFile: id(7), paymentFile: id(7, 2),
} as const;

/** Synthetic fixtures; supplied passwordHash must be generated only for a real seed run. */
export function buildSeedData(passwordHash: string) {
  const department = [
    { departmentId: ids.sales, code: "KD", departmentName: "Kinh doanh", managerId: ids.salesManager },
    { departmentId: ids.operations, code: "KT", departmentName: "Khai thác", managerId: ids.operationsManager },
    { departmentId: ids.accounting, code: "KTOAN", departmentName: "Kế toán", managerId: ids.accountingReviewer },
    { departmentId: ids.legal, code: "PC", departmentName: "Pháp chế", managerId: ids.legalManager },
    { departmentId: ids.board, code: "BGD", departmentName: "Ban Giám đốc", managerId: ids.boardChair },
    { departmentId: ids.adminDepartment, code: "QTHT", departmentName: "Quản trị hệ thống", managerId: ids.admin },
  ] satisfies Prisma.DepartmentCreateManyInput[];

  const userAccount = [
    { userId: ids.salesStaff, username: "demo.sales", fullName: "Nguyễn An Demo", departmentId: ids.sales, role: "SalesStaff" },
    { userId: ids.salesManager, username: "demo.sales.manager", fullName: "Trần Bình Demo", departmentId: ids.sales, role: "SalesManager" },
    { userId: ids.operationsStaff, username: "demo.operations", fullName: "Lê Cường Demo", departmentId: ids.operations, role: "OperationsStaff" },
    { userId: ids.operationsManager, username: "demo.operations.manager", fullName: "Phạm Dung Demo", departmentId: ids.operations, role: "OperationsManager" },
    { userId: ids.accountant, username: "demo.accountant", fullName: "Võ Hạnh Demo", departmentId: ids.accounting, role: "Accountant" },
    { userId: ids.accountingReviewer, username: "demo.accountant.reviewer", fullName: "Đỗ Khang Demo", departmentId: ids.accounting, role: "Accountant" },
    { userId: ids.legalStaff, username: "demo.legal", fullName: "Bùi Lan Demo", departmentId: ids.legal, role: "LegalStaff" },
    { userId: ids.boardMember, username: "demo.board", fullName: "Hoàng Minh Demo", departmentId: ids.board, role: "BoardMember" },
    { userId: ids.legalManager, username: "demo.legal.manager", fullName: "Đinh Quang Demo", departmentId: ids.legal, role: "LegalManager" },
    { userId: ids.boardChair, username: "demo.board.chair", fullName: "Lý Tâm Demo", departmentId: ids.board, role: "BoardChair" },
    { userId: ids.admin, username: "demo.admin", fullName: "Đặng Nam Demo", departmentId: ids.adminDepartment, role: "SystemAdmin" },
  ].map((user) => ({
    ...user,
    role: user.role as Prisma.UserAccountCreateManyInput["role"],
    companyEmail: `${user.username}@example.invalid`, passwordHash,
    status: "Active" as const, failedLoginCount: 0, mustChangePassword: true,
    canSign: user.userId === ids.boardMember || user.userId === ids.boardChair,
  })) satisfies Prisma.UserAccountCreateManyInput[];

  const customer = [
    { customerId: ids.customer, customerName: "Công ty Logistics Minh An Demo", taxCode: "0000000001",
      address: "Địa chỉ giả lập, Thành phố Hồ Chí Minh", legalRepresentative: "Nguyễn Đại Diện Demo",
      contactName: "Trần Liên Hệ Demo", contactTitle: "Điều phối", phone: "0900000001",
      email: "contact@example.invalid", customerGroup: "Doanh nghiệp logistics", interestedServices: "Nâng hạ; lưu bãi",
      status: "Active", accountManagerId: ids.salesStaff, version: 1 },
    { customerId: ids.suspendedCustomer, customerName: "Công ty Kho Vận Tạm Ngưng Demo", taxCode: "0000000002",
      address: "Địa chỉ giả lập, Đồng Nai", legalRepresentative: "Lê Đại Diện Demo", phone: "0900000002",
      status: "Suspended", accountManagerId: ids.salesStaff, version: 2 },
  ] satisfies Prisma.CustomerCreateManyInput[];

  const service = [
    { serviceId: ids.lifting, serviceName: "Nâng hạ container Demo", unit: "TEU", isMandatory: true },
    { serviceId: ids.storage, serviceName: "Lưu bãi Demo", unit: "TEU-ngày", isMandatory: false },
  ] satisfies Prisma.ServiceCreateManyInput[];

  const area = [
    { areaId: ids.port, areaCode: "DEMO-PORT", areaName: "Cảng Demo", areaType: "Cảng", level: 1,
      hierarchyPath: "/DEMO-PORT", areaM2: "100000", capacity: "10000", status: "Active" },
    { areaId: ids.yard, areaCode: "DEMO-CY", areaName: "Bãi CY Demo", areaType: "Bãi CY", parentAreaId: ids.port,
      level: 2, hierarchyPath: "/DEMO-PORT/DEMO-CY", areaM2: "40000", capacity: "4000", status: "Active" },
    { areaId: ids.warehouse, areaCode: "DEMO-CFS", areaName: "Kho CFS Demo", areaType: "Kho CFS", parentAreaId: ids.port,
      level: 2, hierarchyPath: "/DEMO-PORT/DEMO-CFS", areaM2: "10000", capacity: "1000", status: "Active" },
    { areaId: ids.block, areaCode: "DEMO-B01", areaName: "Block 01 Demo", areaType: "Block", parentAreaId: ids.yard,
      level: 3, hierarchyPath: "/DEMO-PORT/DEMO-CY/DEMO-B01", areaM2: "5000", capacity: "500", status: "Active" },
    { areaId: ids.suspendedBlock, areaCode: "DEMO-B02", areaName: "Block 02 Tạm Ngưng Demo", areaType: "Block", parentAreaId: ids.yard,
      level: 3, hierarchyPath: "/DEMO-PORT/DEMO-CY/DEMO-B02", areaM2: "5000", capacity: "500", status: "Suspended" },
  ] satisfies Prisma.AreaCreateManyInput[];

  const contractBase = {
    customerId: ids.customer, contractType: "Dịch vụ logistics", startDate: at("2026-10-01T00:00:00Z"),
    endDate: at("2027-09-30T00:00:00Z"), contractValue: "100000000.00", paymentTerms: "Thanh toán trong 30 ngày (dữ liệu demo).",
    content: "Nội dung giả lập phục vụ kiểm tra dữ liệu; không phải hợp đồng thực tế.",
    ownerId: ids.salesStaff, version: 1, createdAt, updatedAt: createdAt,
  };
  const contract = [
    { ...contractBase, contractId: ids.contract, documentType: "Contract", title: "Hợp đồng đang khai thác Demo", status: "Active" },
    { ...contractBase, contractId: ids.submittedContract, documentType: "Contract", title: "Hợp đồng chờ rà soát Demo", status: "Submitted" },
    { ...contractBase, contractId: ids.draftContract, documentType: "Contract", title: "Hợp đồng dự thảo Demo", status: "Draft" },
    { ...contractBase, contractId: ids.appendix, documentType: "Appendix", parentContractId: ids.contract, title: "Phụ lục dự thảo Demo", status: "Draft" },
    // SYS-CTR-10: hồ sơ để thử tab "Phân công người duyệt" của từng trưởng bộ phận.
    { ...contractBase, contractId: ids.assignSalesContract, documentType: "Contract", title: "Chờ TP Kinh doanh phân công Demo", status: "Submitted" },
    { ...contractBase, contractId: ids.assignLegalContract, documentType: "Contract", title: "Chờ TP Pháp chế phân công Demo", status: "UnderReview" },
    { ...contractBase, contractId: ids.assignBoardContract, documentType: "Contract", title: "Chờ Tổng Giám đốc phân công Demo", status: "UnderReview" },
  ] satisfies Prisma.ContractCreateManyInput[];

  const contractItem = [
    { itemId: ids.item, contractId: ids.contract, serviceId: ids.lifting, areaId: ids.block, areaNameSnapshot: "Block 01 Demo" },
    { itemId: id(15, 2), contractId: ids.contract, serviceId: ids.storage, areaId: ids.block, areaNameSnapshot: "Block 01 Demo" },
    { itemId: id(15, 3), contractId: ids.submittedContract, serviceId: ids.lifting, areaId: ids.block, areaNameSnapshot: "Block 01 Demo" },
  ] satisfies Prisma.ContractItemCreateManyInput[];

  const priceList = [{ priceListId: ids.price, contractId: ids.contract, version: 1,
    effectiveFrom: at("2026-10-01T00:00:00Z"), effectiveTo: at("2027-09-30T00:00:00Z"), status: "Effective", createdBy: ids.salesStaff,
  }] satisfies Prisma.PriceListCreateManyInput[];
  const priceListLine = [
    { lineId: ids.liftingPrice, priceListId: ids.price, serviceId: ids.lifting, areaId: ids.block, unitPrice: "100000.00", unit: "TEU" },
    { lineId: ids.storagePrice, priceListId: ids.price, serviceId: ids.storage, areaId: ids.block, unitPrice: "20000.00", unit: "TEU-ngày" },
  ] satisfies Prisma.PriceListLineCreateManyInput[];
  const volumePeriod = [{ volumePeriodId: ids.volume, contractId: ids.contract, billingPeriod: "2026-10",
    status: "Locked", lockedBy: ids.operationsManager, lockedAt: at("2026-10-31T10:00:00Z"),
  }] satisfies Prisma.VolumePeriodCreateManyInput[];
  const volumeLine = [
    { volumeLineId: ids.liftingVolume, volumePeriodId: ids.volume, serviceId: ids.lifting, areaId: ids.block, quantity: "10.0000" },
    { volumeLineId: ids.storageVolume, volumePeriodId: ids.volume, serviceId: ids.storage, areaId: ids.block, quantity: "30.0000" },
  ] satisfies Prisma.VolumeLineCreateManyInput[];
  const paymentStatement = [{ statementId: ids.statement, contractId: ids.contract, billingPeriod: "2026-10",
    priceListId: ids.price, volumePeriodId: ids.volume, customerNameSnapshot: customer[0].customerName,
    taxCodeSnapshot: customer[0].taxCode, addressSnapshot: customer[0].address,
    representativeSnapshot: customer[0].legalRepresentative, subtotal: "1600000.00", taxAmount: "160000.00", totalAmount: "1760000.00",
    status: "Issued", createdBy: ids.accountant, createdAt: sentAt, issuedAt: at("2026-11-02T02:00:00Z"), isLocked: true,
  }] satisfies Prisma.PaymentStatementCreateManyInput[];
  const paymentStatementLine = [
    { lineId: id(21), statementId: ids.statement, priceListLineId: ids.liftingPrice, volumeLineId: ids.liftingVolume,
      quantity: "10.0000", unitPrice: "100000.00", amount: "1000000.00", isMandatory: true },
    { lineId: id(21, 2), statementId: ids.statement, priceListLineId: ids.storagePrice, volumeLineId: ids.storageVolume,
      quantity: "30.0000", unitPrice: "20000.00", amount: "600000.00", isMandatory: false },
  ] satisfies Prisma.PaymentStatementLineCreateManyInput[];

  const snapshot = (contractId: string) => {
    const record = contract.find((row) => row.contractId === contractId)!;
    return { contractId, title: record.title, customer: { customerName: customer[0].customerName, taxCode: customer[0].taxCode },
      contractValue: record.contractValue, version: record.version,
      items: contractItem.filter((row) => row.contractId === contractId).map((row) => ({ ...row })),
      workflow: { version: 1, stages: ["SalesManager", "LegalStaff", "BoardMember"] } };
  };
  const approvalRound = [
    { roundId: ids.contractRound, recordType: "Contract", contractId: ids.contract, recordVersion: 1, roundNo: 1,
      submittedBy: ids.salesStaff, submittedAt: createdAt, result: "Completed", endedAt: approvedAt, recordSnapshot: snapshot(ids.contract) },
    { roundId: ids.currentRound, recordType: "Contract", contractId: ids.submittedContract, recordVersion: 1, roundNo: 1,
      submittedBy: ids.salesStaff, submittedAt: sentAt, result: "Running", recordSnapshot: snapshot(ids.submittedContract) },
    { roundId: ids.paymentRound, recordType: "PaymentStatement", statementId: ids.statement, recordVersion: 1, roundNo: 1,
      submittedBy: ids.accountant, submittedAt: at("2026-11-01T03:00:00Z"), result: "Completed", endedAt: at("2026-11-01T07:00:00Z"),
      recordSnapshot: { ...paymentStatement[0], createdAt: sentAt.toISOString(), issuedAt: null,
        status: "Reconciled", isLocked: false, lines: paymentStatementLine.map((row) => ({ ...row })),
        workflow: { version: 1, stages: ["Accountant", "BoardMember"] } } },
    // SYS-CTR-10: lượt đang chạy có bước chưa phân công (assignee_id trống, NotStarted).
    ...([[ids.assignSalesRound, ids.assignSalesContract], [ids.assignLegalRound, ids.assignLegalContract], [ids.assignBoardRound, ids.assignBoardContract]] as const)
      .map(([roundId, contractId]) => ({ roundId, recordType: "Contract" as const, contractId, recordVersion: 1, roundNo: 1,
        submittedBy: ids.salesStaff, submittedAt: sentAt, result: "Running" as const, recordSnapshot: snapshot(contractId) })),
  ] satisfies Prisma.ApprovalRoundCreateManyInput[];
  const approvalStep: Prisma.ApprovalStepCreateManyInput[] = [];
  for (const [roundIndex, roundId, complete] of [[0, ids.contractRound, true], [1, ids.currentRound, false]] as const) {
    [ids.salesManager, ids.legalStaff, ids.boardMember].forEach((assigneeId, index) => {
      const stepTime = new Date(createdAt.getTime() + index * 60 * 60 * 1000);
      approvalStep.push({ stepId: id(25, roundIndex * 3 + index + 1), roundId,
        stepName: ["Rà soát kinh doanh", "Rà soát pháp lý", "Phê duyệt"][index], stepOrder: index + 1, assigneeId,
        stepStatus: complete ? "Completed" : index === 0 ? "Pending" : "NotStarted",
        ...(complete ? { assignedAt: stepTime, acceptedAt: stepTime, decision: "Approve", comment: "Đồng ý (lịch sử giả lập).",
          decidedBy: assigneeId, decidedAt: stepTime, ...(index === 1 ? { legalConclusion: "Đạt yêu cầu pháp lý (demo)." } : {}) }
          : index === 0 ? { assignedAt: sentAt } : {}),
      });
    });
  }
  [ids.accountingReviewer, ids.boardMember].forEach((assigneeId, index) => approvalStep.push({
    stepId: id(25, 7 + index), roundId: ids.paymentRound, stepName: index === 0 ? "Duyệt kế toán" : "Phê duyệt",
    stepOrder: index + 1, assigneeId, assignedAt: at("2026-11-01T03:00:00Z"), acceptedAt: at("2026-11-01T03:00:00Z"), stepStatus: "Completed",
    decision: "Approve", comment: "Đồng ý số liệu demo.", decidedBy: assigneeId,
    decidedAt: at(`2026-11-01T0${index + 3}:00:00Z`),
  }));

  // SYS-CTR-10 · dữ liệu thử phân công. Thứ tự bước: 1 Rà soát kinh doanh, 2 Pháp chế, 3 Ban Giám đốc.
  const stepNames = ["Rà soát kinh doanh", "Rà soát pháp lý", "Phê duyệt"];
  const unassigned = (roundId: string, row: number, order: number) =>
    ({ stepId: id(25, row), roundId, stepName: stepNames[order - 1], stepOrder: order, stepStatus: "NotStarted" as const });
  const salesApproved = (roundId: string, row: number) => ({ stepId: id(25, row), roundId, stepName: stepNames[0], stepOrder: 1,
    assigneeId: ids.salesManager, assignedAt: sentAt, acceptedAt: sentAt, stepStatus: "Completed" as const, decision: "Approve" as const,
    comment: "Đồng ý chuyển Pháp chế (dữ liệu thử phân công).", decidedBy: ids.salesManager, decidedAt: at("2026-11-01T04:00:00Z") });
  approvalStep.push(
    // A. Mọi bước chưa phân công → TP Kinh doanh gán bước 1, bước chuyển sang Chờ tiếp nhận.
    unassigned(ids.assignSalesRound, 9, 1), unassigned(ids.assignSalesRound, 10, 2), unassigned(ids.assignSalesRound, 11, 3),
    // B. Kinh doanh đã duyệt, Pháp chế chưa có người → TP Pháp chế gán, bước vào Đang rà soát ngay.
    salesApproved(ids.assignLegalRound, 12), unassigned(ids.assignLegalRound, 13, 2), unassigned(ids.assignLegalRound, 14, 3),
    // C. Pháp chế đang rà soát (không đổi người được), BGĐ chưa có người → Tổng Giám đốc gán, chờ Pháp chế bàn giao.
    salesApproved(ids.assignBoardRound, 15),
    { stepId: id(25, 16), roundId: ids.assignBoardRound, stepName: stepNames[1], stepOrder: 2, assigneeId: ids.legalStaff,
      assignedAt: at("2026-11-01T04:00:00Z"), acceptedAt: at("2026-11-01T04:00:00Z"), stepStatus: "Reviewing" },
    unassigned(ids.assignBoardRound, 17, 3),
  );

  return {
    ...buildIdentitySeed(),
    department, userAccount,
    loginSession: [{ sessionId: id(3), userId: ids.salesStaff, refreshTokenHash: hash("revoked-demo-session"), logoutTokenHash: hash("revoked-demo-logout"),
      createdAt, lastActivityAt: createdAt, expiresAt: at("2026-10-01T02:30:00Z"), isRevoked: true, endReason: "Expired", device: "Demo fixture; not a live session" }] satisfies Prisma.LoginSessionCreateManyInput[],
    passwordOtp: [{ otpId: id(4), userId: ids.salesStaff, otpHash: hash("consumed-demo-otp"), sentAt: createdAt,
      expiresAt: at("2026-10-01T02:05:00Z"), failedCount: 0, isUsed: true }] satisfies Prisma.PasswordOtpCreateManyInput[],
    notification: [{ notificationId: id(5), recipientId: ids.salesManager, recordType: "Contract", recordId: ids.submittedContract,
      content: "Hợp đồng Demo chờ rà soát; dữ liệu thử nghiệm.", isRead: false, sendStatus: "Pending", createdAt: sentAt }] satisfies Prisma.NotificationCreateManyInput[],
    auditLog: [{ logId: id(6), entityType: "demo_seed", entityId: ids.contract, action: "ImportDemoFixture", actorId: ids.admin,
      actedAt: sentAt, note: "Dữ liệu giả lập, bao gồm lịch sử đã hoàn tất; không phải kết quả chạy quy trình nghiệp vụ." }] satisfies Prisma.AuditLogCreateManyInput[],
    attachment: [
      { attachmentId: ids.contractFile, recordType: "Contract", contractId: ids.contract, fileName: "DEMO-contract-placeholder.pdf",
        filePath: "demo-placeholder/contracts/contract.pdf", uploadedBy: ids.salesStaff, uploadedAt: signedAt },
      { attachmentId: ids.paymentFile, recordType: "PaymentStatement", statementId: ids.statement, fileName: "DEMO-payment-placeholder.pdf",
        filePath: "demo-placeholder/payments/statement.pdf", uploadedBy: ids.accountant, uploadedAt: at("2026-11-01T08:00:00Z") },
      { attachmentId: id(7, 3), recordType: "Contract", contractId: ids.submittedContract, fileName: "DEMO-draft-placeholder.pdf",
        filePath: "demo-placeholder/contracts/draft.pdf", uploadedBy: ids.salesStaff, uploadedAt: sentAt },
    ] satisfies Prisma.AttachmentCreateManyInput[],
    customer,
    customerStatusDecision: [{ decisionId: id(9), customerId: ids.suspendedCustomer, decisionType: "Suspend", reason: "Tạm ngưng để kiểm tra kịch bản demo.",
      basis: "Dữ liệu giả lập", followUpPlan: "Tiếp tục đối soát nghĩa vụ cũ nếu có.", confirmedBy: ids.salesManager, decidedAt: sentAt }] satisfies Prisma.CustomerStatusDecisionCreateManyInput[],
    area, service,
    areaService: [{ areaId: ids.block, serviceId: ids.lifting }, { areaId: ids.block, serviceId: ids.storage },
      { areaId: ids.warehouse, serviceId: ids.storage }] satisfies Prisma.AreaServiceCreateManyInput[],
    areaAssignment: [{ assignmentId: id(13), areaId: ids.block, userId: ids.operationsStaff, fromDate: createdAt }] satisfies Prisma.AreaAssignmentCreateManyInput[],
    contract, contractItem, priceList, priceListLine, volumePeriod, volumeLine, paymentStatement, paymentStatementLine,
    reconciliation: [{ reconciliationId: id(22), statementId: ids.statement, volumeConfirmedBy: ids.operationsStaff,
      volumeConfirmedAt: at("2026-11-01T02:10:00Z"), priceConfirmedAt: at("2026-11-01T02:15:00Z"), sentToCustomerAt: at("2026-11-01T02:20:00Z"),
      customerResult: "Agreed", customerFeedback: "Đồng ý số liệu demo.", reconciledBy: ids.accountant, completedAt: at("2026-11-01T02:30:00Z") }] satisfies Prisma.ReconciliationCreateManyInput[],
    changeRequest: [{ requestId: id(23), requestType: "Revision", recordType: "PaymentStatement", statementId: ids.statement,
      reason: "Đề nghị điều chỉnh dữ liệu demo; chưa có hiệu lực thay thế.", status: "Pending", requestedBy: ids.accountant,
      requestedAt: at("2026-11-02T03:00:00Z") }] satisfies Prisma.ChangeRequestCreateManyInput[],
    approvalRound, approvalStep,
    signingSession: [
      { signingSessionId: id(26), recordType: "Contract", contractId: ids.contract, providerSessionId: "DEMO-CONTRACT-SIGN-1",
        status: "Succeeded", companySignerId: ids.boardMember, companySignedAt: signedAt, customerSignerName: customer[0].legalRepresentative,
        customerSignerEmail: "signer@example.invalid", customerSignedAt: signedAt, signedFileId: ids.contractFile,
        sentBy: ids.salesStaff, sentAt: approvedAt, resultAt: signedAt },
      { signingSessionId: id(26, 2), recordType: "PaymentStatement", statementId: ids.statement, providerSessionId: "DEMO-PAYMENT-SIGN-1",
        status: "Succeeded", companySignerId: ids.boardMember, companySignedAt: at("2026-11-01T08:00:00Z"), customerSignerName: customer[0].legalRepresentative,
        customerSignerEmail: "signer@example.invalid", customerSignedAt: at("2026-11-01T08:00:00Z"), signedFileId: ids.paymentFile,
        sentBy: ids.accountant, sentAt: at("2026-11-01T07:00:00Z"), resultAt: at("2026-11-01T08:00:00Z") },
    ] satisfies Prisma.SigningSessionCreateManyInput[],
  };
}

export type SeedData = ReturnType<typeof buildSeedData>;
