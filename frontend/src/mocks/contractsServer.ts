import type { Permission } from '@/constants/roles';
import type { AuthUser } from '@/features/auth/types/auth';
import {
  ContractActionError,
  CreateContractError,
  type AcceptReviewRequest,
  type ApprovalInboxItem,
  type ApprovalLogEntry,
  type ApprovalRound,
  type ApprovalStep,
  type ApprovalStepKey,
  type CancelContractRequest,
  type Contract,
  type ContractDraft,
  type ContractListItem,
  type ContractListQuery,
  type ContractListResult,
  type ContractScope,
  type ContractStatus,
  type CoordinationReplyRequest,
  type CoordinationRequest,
  type CreateContractRequest,
  type CreateContractResult,
  type DecideReviewRequest,
  type DecideReviewResult,
  type SetContractAttachmentsRequest,
  type SubmitCheck,
  type SubmitContractRequest,
  type UpdateContractRequest,
} from '@/features/contracts/types/contract';
import {
  activeStep,
  contractAreaCodes,
  EDITABLE_STATUSES,
  latestRound,
  STEP_LABELS,
  STEP_ORDER,
  stepLabelOf,
} from '@/features/contracts/utils/contractStatus';
import { parseContractValue, validateContractDraft } from '@/features/contracts/utils/contractValidation';
import { authorize, mockGetCustomer, mockGetCustomerOptions } from './customersServer';
import { mockGetAreaTree } from './areasServer';
import { mockStore } from './mockStore';
import {
  CONTRACT_SERVICE_CATALOG,
  CONTRACT_TEMPLATES,
  CONTRACT_TYPES,
  COORDINATION_DEPARTMENTS,
  DEPARTMENT_WORKFLOW_SCOPE,
  SEED_CONTRACTS,
  SIMULATED_CONFLICT_PREFIX,
  SIMULATED_CONTRACT_SAVE_ERROR_PREFIX,
  SIMULATED_LOAD_ERROR_CODE,
  SIMULATED_NOTIFY_ERROR_PREFIX,
  WORKFLOW_PEOPLE,
} from './seed/contracts';
import { mockFindActiveWorkflow } from './workflowServer';

/** Hồ sơ lưu từ phiên bản prototype cũ (chỉ có SYS-CTR-01) chưa có các trường quy trình. */
function normalize(contract: Contract): Contract {
  const legacy = contract as Partial<Contract> & Contract;
  return {
    ...contract,
    departmentCode: legacy.departmentCode ?? 'KD',
    updatedAt: legacy.updatedAt ?? contract.createdAt,
    version: legacy.version ?? 1,
    rounds: legacy.rounds ?? [],
  };
}

function allContracts(): Contract[] {
  const stored = mockStore.getStoredContracts().map(normalize);
  return [...SEED_CONTRACTS.filter((seed) => !stored.some((item) => item.code === seed.code)), ...stored];
}

function nextContractCode(): string {
  const max = Math.max(30, ...allContracts().map((contract) => Number(/^HD-\d{4}-(\d+)$/.exec(contract.code)?.[1] ?? 0)));
  return `HD-${new Date().getFullYear()}-${String(max + 1).padStart(3, '0')}`;
}

function normalizeDraft(draft: ContractDraft): ContractDraft {
  return {
    ...draft,
    title: draft.title.trim(),
    contractType: draft.contractType.trim(),
    value: draft.value.trim(),
    paymentTerm: draft.paymentTerm.trim(),
    content: draft.content.trim(),
    templateCode: draft.sourceMode === 'blank' ? '' : draft.templateCode,
    services: draft.services.map((item) => ({ ...item, areaCode: item.requiresArea ? item.areaCode : '' })),
  };
}

function activeAreaCodes(): Set<string> {
  return new Set(mockGetAreaTree().filter((area) => area.status === 'active').map((area) => area.code));
}

function actionAuthorize(userId: string, signedInAt: string, permission: Permission): AuthUser {
  return authorize(userId, signedInAt, permission, (code, sessionStatus) => new ContractActionError(code, { sessionStatus }));
}

/** Phạm vi truy cập theo vai trò (SYS-CTR-02 A1–A3); BE thật kiểm tra lại ở mọi API. */
function scopeOf(user: AuthUser): ContractScope {
  if (user.roles.includes('TP_KD')) return 'department';
  if (user.roles.includes('GD')) return 'granted';
  if (user.roles.includes('NV_PC')) return 'assigned';
  return 'own';
}

function canView(contract: Contract, user: AuthUser): boolean {
  if (contract.ownerId === user.id) return true;
  switch (scopeOf(user)) {
    case 'department':
      return contract.departmentCode === user.department;
    case 'granted':
    case 'assigned':
      // Ban Giám đốc và Pháp chế theo dõi hồ sơ đã vào quy trình phê duyệt.
      return contract.rounds.length > 0 && contract.status !== 'draft' && contract.status !== 'cancelled';
    default:
      return false;
  }
}

function findOrThrow(code: string): Contract {
  const contract = allContracts().find((item) => item.code === code);
  if (!contract) throw new ContractActionError('NOT_FOUND');
  return contract;
}

function save(contract: Contract, idempotencyKey?: string) {
  mockStore.saveContract(contract, idempotencyKey);
}

function toListItem(contract: Contract): ContractListItem {
  return {
    code: contract.code,
    title: contract.title,
    contractType: contract.contractType,
    customerCode: contract.customerCode,
    customerName: contract.customerName,
    effectiveFrom: contract.effectiveFrom,
    effectiveTo: contract.effectiveTo,
    status: contract.status,
    ownerName: contract.ownerName,
    updatedAt: contract.updatedAt,
    stepLabel: stepLabelOf(contract),
    areaCodes: contractAreaCodes(contract),
  };
}

/** So khớp không phân biệt hoa/thường và dấu tiếng Việt. */
function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

export function mockGetContractFormOptions() {
  return {
    customers: mockGetCustomerOptions().filter((customer) => customer.status === 'active'),
    areas: mockGetAreaTree().filter((area) => area.status === 'active'),
    templates: CONTRACT_TEMPLATES,
    services: CONTRACT_SERVICE_CATALOG,
    contractTypes: CONTRACT_TYPES,
  };
}

export function mockGetListFilterOptions() {
  return { areas: mockGetAreaTree(), contractTypes: CONTRACT_TYPES, coordinationDepartments: COORDINATION_DEPARTMENTS };
}

export function mockGetContract(code: string): Contract | undefined {
  return allContracts().find((contract) => contract.code === code);
}

/** SYS-CTR-01: kiểm tra lại quyền, khách hàng/khu vực và dữ liệu ngay trước khi tạo hồ sơ Nháp. */
export function mockCreateContract(request: CreateContractRequest): CreateContractResult {
  const { userId, signedInAt, idempotencyKey } = request;
  const user = authorize(userId, signedInAt, 'contracts.create', (code, sessionStatus) => {
    if (code === 'FORBIDDEN') {
      mockStore.audit({ action: 'CONTRACT_CREATE_REJECTED', username: '', detail: `Không có quyền tạo hợp đồng (${userId})` });
    }
    return new CreateContractError(code, { sessionStatus });
  });

  const processedCode = mockStore.getContractCodeByRequest(idempotencyKey);
  if (processedCode) return { contract: mockGetContract(processedCode)!, replayed: true };

  const draft = normalizeDraft(request.draft);
  const fieldErrors = validateContractDraft(draft);
  if (Object.keys(fieldErrors).length > 0) throw new CreateContractError('VALIDATION', { fieldErrors });

  const customer = mockGetCustomer(draft.customerCode);
  if (!customer || customer.status !== 'active') {
    mockStore.audit({
      action: 'CONTRACT_CREATE_REJECTED',
      username: user.username,
      detail: `Khách hàng ${draft.customerCode || '(trống)'} không còn hợp lệ`,
    });
    throw new CreateContractError('CUSTOMER_INACTIVE', {
      fieldErrors: { customerCode: 'Khách hàng không còn ở trạng thái Hoạt động. Chọn khách hàng khác.' },
    });
  }

  const activeAreas = activeAreaCodes();
  const invalidAreas = draft.services.filter((item) => item.requiresArea && !activeAreas.has(item.areaCode));
  if (invalidAreas.length > 0) {
    throw new CreateContractError('AREA_INACTIVE', {
      fieldErrors: {
        serviceAreas: Object.fromEntries(invalidAreas.map((item) => [item.id, 'Khu vực không còn Hoạt động. Chọn khu vực khác.'])),
      },
    });
  }

  if (
    draft.title.toUpperCase().startsWith(SIMULATED_CONTRACT_SAVE_ERROR_PREFIX) &&
    mockStore.takeOnce(`contract-save:${idempotencyKey}`)
  ) {
    mockStore.audit({ action: 'CONTRACT_CREATE_ERROR', username: user.username, detail: 'Lỗi lưu hồ sơ; không tạo bản ghi dở dang' });
    throw new CreateContractError('SAVE_FAILED');
  }

  const now = new Date().toISOString();
  const contract: Contract = {
    ...draft,
    code: nextContractCode(),
    value: parseContractValue(draft.value),
    status: 'draft',
    customerName: customer.name,
    ownerId: user.id,
    ownerName: user.fullName,
    departmentCode: user.department,
    createdAt: now,
    updatedAt: now,
    version: 1,
    attachments: [],
    rounds: [],
  };
  save(contract, idempotencyKey);
  mockStore.audit({ action: 'CONTRACT_CREATED', username: user.username, detail: `Tạo ${contract.code} – ${contract.title}` });
  return { contract, replayed: false };
}

/** 01.10 / 03.2: tệp chỉ được thêm/xóa khi hồ sơ có mã, do người phụ trách, ở Nháp hoặc Yêu cầu chỉnh sửa. */
export function mockSetContractAttachments(request: SetContractAttachmentsRequest): Contract {
  const user = authorize(request.userId, request.signedInAt, 'contracts.create', (code, sessionStatus) =>
    new CreateContractError(code, { sessionStatus }),
  );
  const current = mockGetContract(request.code);
  if (!current) throw new CreateContractError('NOT_FOUND');
  if (current.ownerId !== user.id || !EDITABLE_STATUSES.includes(current.status)) throw new CreateContractError('FORBIDDEN');
  const next = { ...current, attachments: request.attachments, updatedAt: new Date().toISOString() };
  save(next);
  mockStore.audit({
    action: 'CONTRACT_ATTACHMENTS_UPDATED',
    username: user.username,
    detail: `${request.code}: ${request.attachments.length} tệp đính kèm`,
  });
  return next;
}

type ListRequest = { userId: string; signedInAt: string; query: ContractListQuery; variant: 'all' | 'tracking'; retry?: boolean };

/** SYS-CTR-02: chỉ trả về hồ sơ trong phạm vi truy cập; điều kiện lọc gồm khu vực thực hiện (AC-06). */
export function mockListContracts({ userId, signedInAt, query, variant, retry }: ListRequest): ContractListResult {
  const user = actionAuthorize(userId, signedInAt, 'contracts.view');
  if (query.keyword.trim().toUpperCase() === SIMULATED_CONTRACT_SAVE_ERROR_PREFIX && !retry) throw new ContractActionError('LOAD_FAILED');
  const keyword = fold(query.keyword.trim());
  const matched = allContracts()
    .filter((contract) => canView(contract, user))
    .filter((contract) => variant !== 'tracking' || contract.rounds.length > 0)
    .filter((contract) => !query.status || contract.status === query.status)
    .filter((contract) => !query.contractType || contract.contractType === query.contractType)
    .filter((contract) => !query.areaCode || contract.services.some((item) => item.areaCode === query.areaCode || item.areaCode.startsWith(`${query.areaCode}-`)))
    .filter((contract) => !keyword || fold(`${contract.code} ${contract.title} ${contract.customerName} ${contract.customerCode}`).includes(keyword))
    .sort((a, b) => b.code.localeCompare(a.code));
  const start = (query.page - 1) * query.size;
  return { items: matched.slice(start, start + query.size).map(toListItem), total: matched.length, page: query.page, size: query.size, scope: scopeOf(user) };
}

/** Ẩn ý kiến phối hợp nội bộ của Pháp chế với người ngoài Pháp chế (SYS-CTR-11 A9). */
function sanitizeFor(contract: Contract, user: AuthUser): Contract {
  if (user.roles.includes('NV_PC')) return contract;
  return {
    ...contract,
    rounds: contract.rounds.map((round) => ({
      ...round,
      log: round.log.map((entry) => (entry.internal ? { ...entry, note: undefined } : entry)),
      coordinations: round.coordinations.map((item) => ({ ...item, content: '', reply: item.reply ? '' : undefined })),
    })),
  };
}

/** SYS-CTR-06 bước 2: kiểm tra quyền xem và truy xuất đúng hồ sơ; không trả nội dung ngoài phạm vi. */
export function mockGetContractDetail({ userId, signedInAt, code, retry }: { userId: string; signedInAt: string; code: string; retry?: boolean }): Contract {
  const user = actionAuthorize(userId, signedInAt, 'contracts.view');
  if (code === SIMULATED_LOAD_ERROR_CODE && !retry) throw new ContractActionError('LOAD_FAILED');
  const contract = findOrThrow(code);
  if (!canView(contract, user)) throw new ContractActionError('FORBIDDEN');
  return sanitizeFor(contract, user);
}

function ownerAction(userId: string, signedInAt: string, code: string, allowed: ContractStatus[]) {
  const user = actionAuthorize(userId, signedInAt, 'contracts.create');
  const contract = findOrThrow(code);
  if (contract.ownerId !== user.id) throw new ContractActionError('NOT_OWNER', { status: contract.status });
  if (!allowed.includes(contract.status)) throw new ContractActionError('STATUS', { status: contract.status });
  return { user, contract };
}

/** SYS-CTR-03 bước 8–9: kiểm tra lại quyền, trạng thái, phiên bản rồi lưu; trạng thái giữ nguyên. */
export function mockUpdateContract(request: UpdateContractRequest): Contract {
  let { user, contract } = ownerAction(request.userId, request.signedInAt, request.code, EDITABLE_STATUSES);
  const draft = normalizeDraft(request.draft);
  if (draft.title.toUpperCase().startsWith(SIMULATED_CONFLICT_PREFIX) && mockStore.takeOnce(`contract-conflict:${contract.code}:${request.baseVersion}`)) {
    // Giả lập phiên làm việc khác vừa lưu hồ sơ (E4).
    contract = { ...contract, version: contract.version + 1, updatedAt: new Date().toISOString() };
    save(contract);
  }
  if (contract.version !== request.baseVersion) throw new ContractActionError('CONFLICT');
  const fieldErrors = validateContractDraft(draft);
  if (Object.keys(fieldErrors).length > 0) throw new ContractActionError('VALIDATION', { fieldErrors });
  if (draft.customerCode !== contract.customerCode && mockGetCustomer(draft.customerCode)?.status !== 'active') {
    throw new ContractActionError('VALIDATION', { fieldErrors: { customerCode: 'Khách hàng không còn ở trạng thái Hoạt động. Chọn khách hàng khác.' } });
  }
  const activeAreas = activeAreaCodes();
  const invalidAreas = draft.services.filter((item) => item.requiresArea && !activeAreas.has(item.areaCode));
  if (invalidAreas.length > 0) {
    throw new ContractActionError('VALIDATION', {
      fieldErrors: { serviceAreas: Object.fromEntries(invalidAreas.map((item) => [item.id, 'Khu vực không còn Hoạt động. Chọn khu vực khác.'])) },
    });
  }
  if (draft.title.toUpperCase().startsWith(SIMULATED_CONTRACT_SAVE_ERROR_PREFIX) && mockStore.takeOnce(`contract-update:${contract.code}:${contract.version}`)) {
    mockStore.audit({ action: 'CONTRACT_UPDATE_REJECTED', username: user.username, detail: `${contract.code}: lỗi lưu, giữ dữ liệu cũ` });
    throw new ContractActionError('SAVE_FAILED');
  }
  const customer = mockGetCustomer(draft.customerCode);
  const next: Contract = {
    ...contract,
    ...draft,
    value: parseContractValue(draft.value),
    customerName: customer?.name ?? contract.customerName,
    version: contract.version + 1,
    updatedAt: new Date().toISOString(),
  };
  save(next);
  mockStore.audit({ action: 'CONTRACT_UPDATED', username: user.username, detail: `${contract.code} v${next.version}` });
  return next;
}

/** Thông tin bắt buộc để trình (CTR-02, SYS-CTR-04 bước 4); trả về danh sách mục còn thiếu. */
function missingForSubmit(contract: Contract): string[] {
  const errors = validateContractDraft({ ...contract, value: String(contract.value) });
  const labels: Record<string, string> = {
    customerCode: 'Khách hàng',
    templateCode: 'Mẫu hợp đồng',
    title: 'Tên hợp đồng',
    contractType: 'Loại hợp đồng',
    effectiveFrom: 'Ngày bắt đầu hiệu lực',
    effectiveTo: 'Ngày kết thúc hiệu lực hợp lệ',
    value: 'Giá trị hợp đồng',
    paymentTerm: 'Điều khoản thanh toán',
    services: 'Ít nhất một hạng mục dịch vụ',
    content: 'Nội dung hợp đồng',
  };
  const missing = Object.keys(errors).filter((key) => key in labels).map((key) => labels[key]);
  const noArea = contract.services.filter((item) => item.requiresArea && !item.areaCode).map((item) => `Khu vực thực hiện của "${item.serviceName}"`);
  if (contract.attachments.length === 0) missing.push('Tệp hợp đồng hoặc tài liệu đính kèm (ít nhất 1 tệp)');
  return [...missing, ...noArea];
}

function salesReviewerFor(contract: Contract) {
  const scope = DEPARTMENT_WORKFLOW_SCOPE[contract.departmentCode];
  const config = scope ? mockFindActiveWorkflow('contract', scope) : undefined;
  const ids = config?.stages.find((stage) => stage.key === 'sales')?.participants ?? [];
  const person = ids.map((id) => WORKFLOW_PEOPLE.find((item) => item.id === id)).find((item) => item?.active);
  return { config, person };
}

function precheckSubmit(contract: Contract) {
  const missing = missingForSubmit(contract);
  if (missing.length > 0) throw new ContractActionError('MISSING', { items: missing });
  const activeAreas = activeAreaCodes();
  const suspended = contract.services.filter((item) => item.requiresArea && item.areaCode && !activeAreas.has(item.areaCode));
  if (suspended.length > 0) throw new ContractActionError('AREA_INACTIVE', { items: suspended.map((item) => `${item.serviceName} · ${item.areaCode}`) });
  const { config, person } = salesReviewerFor(contract);
  if (!config || !person) throw new ContractActionError('NO_APPROVER');
  return { config, person };
}

/** SYS-CTR-04 bước 3–5: kiểm tra trước khi hiển thị hộp thoại xác nhận. */
export function mockCheckSubmit({ userId, signedInAt, code }: { userId: string; signedInAt: string; code: string }): SubmitCheck {
  const { contract } = ownerAction(userId, signedInAt, code, EDITABLE_STATUSES);
  const { config, person } = precheckSubmit(contract);
  return { salesReviewer: person.name, configLabel: `${config.code} · phiên bản ${config.version}`, resubmit: contract.status === 'revision-requested' };
}

/**
 * SYS-CTR-04 bước 7–9: tạo lượt duyệt theo cấu hình đang áp dụng và giao bước đầu cho Trưởng phòng KD.
 * Cùng Idempotency-Key chỉ tạo một lượt; trình lại sau chỉnh sửa (A1) tạo lượt mới, giữ lượt cũ trong lịch sử.
 */
export function mockSubmitContract(request: SubmitContractRequest): { contract: Contract; replayed: boolean } {
  const processed = mockStore.getContractCodeByRequest(request.idempotencyKey);
  if (processed) {
    actionAuthorize(request.userId, request.signedInAt, 'contracts.create');
    return { contract: findOrThrow(processed), replayed: true };
  }
  const { user, contract } = ownerAction(request.userId, request.signedInAt, request.code, EDITABLE_STATUSES);
  let checked;
  try {
    checked = precheckSubmit(contract);
  } catch (error) {
    mockStore.audit({ action: 'CONTRACT_SUBMIT_REJECTED', username: user.username, detail: `${contract.code}: ${(error as Error).message}` });
    throw error;
  }
  if (contract.title.toUpperCase().startsWith(SIMULATED_CONTRACT_SAVE_ERROR_PREFIX) && mockStore.takeOnce(`contract-submit:${request.idempotencyKey}`)) {
    throw new ContractActionError('SAVE_FAILED');
  }
  const now = new Date().toISOString();
  const steps: ApprovalStep[] = STEP_ORDER.map((key) => ({ key, label: STEP_LABELS[key], state: 'waiting' }));
  Object.assign(steps[0], { assigneeId: checked.person.id, assigneeName: checked.person.name, assignedAt: now, state: 'pending-accept' });
  const round: ApprovalRound = {
    no: contract.rounds.length + 1,
    submittedById: user.id,
    submittedByName: user.fullName,
    submittedAt: now,
    contractVersion: contract.version,
    configCode: checked.config.code,
    configVersion: checked.config.version,
    result: 'in-progress',
    steps,
    log: [{ at: now, stepKey: 'sales', actorName: user.fullName, action: 'submit', from: contract.status, to: 'submitted', version: contract.version, note: contract.status === 'revision-requested' ? 'Trình lại sau khi chỉnh sửa theo yêu cầu.' : undefined }],
    coordinations: [],
  };
  const next: Contract = { ...contract, status: 'submitted', rounds: [...contract.rounds, round], revisionRequest: undefined, updatedAt: now };
  save(next, request.idempotencyKey);
  mockStore.audit({ action: 'CONTRACT_SUBMITTED', username: user.username, detail: `${contract.code} lượt ${round.no} → ${checked.person.name}` });
  return { contract: next, replayed: false };
}

/** SYS-CTR-05: chỉ người phụ trách hủy hồ sơ Nháp, bắt buộc lý do; lưu người hủy, thời điểm, lý do. */
export function mockCancelContract(request: CancelContractRequest): Contract {
  const { user, contract } = ownerAction(request.userId, request.signedInAt, request.code, ['draft']);
  const reason = request.reason.trim();
  if (!reason) throw new ContractActionError('VALIDATION');
  if (reason.toUpperCase().startsWith(SIMULATED_CONTRACT_SAVE_ERROR_PREFIX) && mockStore.takeOnce(`contract-cancel:${contract.code}`)) {
    mockStore.audit({ action: 'CONTRACT_CANCEL_REJECTED', username: user.username, detail: `${contract.code}: lỗi cập nhật trạng thái` });
    throw new ContractActionError('SAVE_FAILED');
  }
  const now = new Date().toISOString();
  const next: Contract = { ...contract, status: 'cancelled', cancellation: { byName: user.fullName, at: now, reason }, version: contract.version + 1, updatedAt: now };
  save(next);
  mockStore.audit({ action: 'CONTRACT_CANCELLED', username: user.username, detail: `${contract.code}: ${reason}` });
  return next;
}

const STEP_PERMISSION: Record<ApprovalStepKey, Permission> = {
  sales: 'approvals.approve',
  legal: 'approvals.review-legal',
  board: 'approvals.approve',
};

/** SYS-CTR-07 bước 5–6: Trưởng phòng được giao tiếp nhận; hồ sơ Submitted → Under Review. */
export function mockAcceptReview(request: AcceptReviewRequest): Contract {
  const user = actionAuthorize(request.userId, request.signedInAt, 'approvals.approve');
  const contract = findOrThrow(request.code);
  const round = latestRound(contract);
  const step = activeStep(round);
  if (!round || step?.key !== 'sales' || step.state !== 'pending-accept' || contract.status !== 'submitted') {
    throw new ContractActionError('STEP_DONE', { status: contract.status });
  }
  if (step.assigneeId !== user.id) throw new ContractActionError('NOT_ASSIGNEE', { status: contract.status });
  const now = new Date().toISOString();
  const steps = round.steps.map((item) => (item.key === 'sales' ? { ...item, state: 'reviewing' as const, acceptedAt: now } : item));
  const log: ApprovalLogEntry[] = [...round.log, { at: now, stepKey: 'sales', actorName: user.fullName, action: 'accept', from: 'submitted', to: 'under-review', version: contract.version }];
  const next: Contract = { ...contract, status: 'under-review', rounds: replaceRound(contract, { ...round, steps, log }), updatedAt: now };
  save(next);
  mockStore.audit({ action: 'CONTRACT_REVIEW_ACCEPTED', username: user.username, detail: `${contract.code} lượt ${round.no}` });
  return next;
}

function replaceRound(contract: Contract, round: ApprovalRound): ApprovalRound[] {
  return contract.rounds.map((item) => (item.no === round.no ? round : item));
}

function boardAssignee(contract: Contract) {
  const scope = DEPARTMENT_WORKFLOW_SCOPE[contract.departmentCode];
  const config = scope ? mockFindActiveWorkflow('contract', scope) : undefined;
  const ids = config?.stages.find((stage) => stage.key === 'board')?.participants ?? [];
  return ids.map((id) => WORKFLOW_PEOPLE.find((item) => item.id === id)).find((item) => item?.active);
}

function legalAssignee(contract: Contract) {
  const scope = DEPARTMENT_WORKFLOW_SCOPE[contract.departmentCode];
  const config = scope ? mockFindActiveWorkflow('contract', scope) : undefined;
  // Luân phiên rút gọn cho prototype: giao người đầu tiên còn hoạt động trong danh sách.
  const ids = config?.stages.find((stage) => stage.key === 'legal')?.participants ?? [];
  return ids.map((id) => WORKFLOW_PEOPLE.find((item) => item.id === id)).find((item) => item?.active);
}

/**
 * SYS-CTR-07 / 08 / 09: ghi nhận quyết định tại bước đang giữ hồ sơ. Kiểm tra người được giao, bước hiện tại,
 * ý kiến/lý do bắt buộc và phiên bản hồ sơ; chỉ một quyết định hợp lệ cho mỗi bước.
 */
export function mockDecideReview(request: DecideReviewRequest): DecideReviewResult {
  const user = actionAuthorize(request.userId, request.signedInAt, STEP_PERMISSION[request.step]);
  const contract = findOrThrow(request.code);
  const round = latestRound(contract);
  const current = activeStep(round);
  if (!round || round.no !== request.roundNo || !current) throw new ContractActionError('STEP_DONE', { status: contract.status });
  if (current.key !== request.step) {
    const ahead = STEP_ORDER.indexOf(request.step) > STEP_ORDER.indexOf(current.key);
    throw new ContractActionError(ahead ? 'STEP_NOT_READY' : 'STEP_DONE', { status: contract.status });
  }
  if (current.assigneeId !== user.id) throw new ContractActionError('NOT_ASSIGNEE', { status: contract.status });
  if (current.state === 'pending-accept') throw new ContractActionError('STEP_NOT_READY', { status: contract.status });
  const comment = request.comment.trim();
  if (!comment) throw new ContractActionError('VALIDATION');
  if (request.viewedVersion !== contract.version || round.contractVersion !== contract.version) throw new ContractActionError('VERSION_MISMATCH');
  if (comment.toUpperCase().startsWith(SIMULATED_CONTRACT_SAVE_ERROR_PREFIX) && mockStore.takeOnce(`decide:${contract.code}:${round.no}:${request.step}`)) {
    mockStore.audit({ action: 'CONTRACT_DECISION_REJECTED', username: user.username, detail: `${contract.code}: lỗi lưu quyết định` });
    throw new ContractActionError('SAVE_FAILED');
  }

  const now = new Date().toISOString();
  const notificationFailed = comment.toUpperCase().startsWith(SIMULATED_NOTIFY_ERROR_PREFIX);
  const index = STEP_ORDER.indexOf(request.step);
  const decided = { ...current, decision: request.decision, decidedById: user.id, decidedByName: user.fullName, decidedAt: now, comment, reviewedVersion: contract.version };
  let steps = round.steps.map((item) => (item.key === request.step ? decided : item));
  const log = [...round.log];
  let status: ContractStatus = contract.status;
  let result = round.result;
  let endedAt: string | undefined;
  let pendingTask: string | undefined;
  let extra: Partial<Contract> = {};

  if (request.decision === 'approve') {
    steps = steps.map((item) => (item.key === request.step ? { ...item, state: 'done' as const } : item));
    if (request.step === 'board') {
      status = 'approved';
      result = 'completed';
      endedAt = now;
      log.push({ at: now, stepKey: 'board', actorName: user.fullName, action: 'approve', from: 'under-review', to: 'approved', note: comment, version: contract.version });
      if (notificationFailed) pendingTask = 'Chuyển hồ sơ sang ký kết chưa thành công – chờ xử lý lại.';
    } else {
      log.push({ at: now, stepKey: request.step, actorName: user.fullName, action: 'approve', from: 'under-review', to: 'under-review', note: comment, version: contract.version });
      const nextKey = STEP_ORDER[index + 1];
      const person = nextKey === 'legal' ? legalAssignee(contract) : boardAssignee(contract);
      log.push({ at: now, stepKey: nextKey, actorName: nextKey === 'legal' ? 'Hệ thống' : user.fullName, action: nextKey === 'legal' ? 'handoff-legal' : 'handoff-board', from: 'under-review', to: 'under-review', version: contract.version });
      steps = steps.map((item) =>
        item.key !== nextKey ? item : person
          ? { ...item, assigneeId: person.id, assigneeName: person.name, assignedAt: now, state: 'reviewing' as const }
          : { ...item, assignedAt: now, state: 'unassigned' as const },
      );
      if (!person) pendingTask = `Bước ${STEP_LABELS[nextKey]} đang chờ phân công; đã thông báo đầu mối có thẩm quyền.`;
      else if (notificationFailed) pendingTask = `Thông báo đến ${person.name} chưa gửi được – đã lưu tác vụ gửi lại.`;
    }
  } else {
    status = request.decision === 'revision' ? 'revision-requested' : 'rejected';
    result = request.decision === 'revision' ? 'revision' : 'rejected';
    endedAt = now;
    steps = steps.map((item, i) => (item.key === request.step ? { ...item, state: 'stopped' as const } : i > index ? { ...item, state: 'skipped' as const } : item));
    log.push({ at: now, stepKey: request.step, actorName: user.fullName, action: request.decision === 'revision' ? 'request-revision' : 'reject', from: 'under-review', to: status, note: comment, version: contract.version });
    const record = { stepLabel: STEP_LABELS[request.step], byName: user.fullName, at: now };
    extra = request.decision === 'revision' ? { revisionRequest: { ...record, content: comment } } : { rejection: { ...record, reason: comment } };
    if (notificationFailed) pendingTask = 'Thông báo kết quả đến người phụ trách chưa gửi được – đã lưu tác vụ gửi lại.';
  }

  const next: Contract = { ...contract, ...extra, status, rounds: replaceRound(contract, { ...round, steps, log, result, endedAt }), updatedAt: now, pendingTask };
  save(next);
  mockStore.audit({ action: 'CONTRACT_DECISION', username: user.username, detail: `${contract.code} · ${STEP_LABELS[request.step]} · ${request.decision}` });
  return { contract: sanitizeFor(next, user), notificationFailed, pendingTask };
}

/** 09 A3.3 / 07.13: xử lý lại phần việc chưa thành công mà không phê duyệt lại hay tạo trùng lượt. */
export function mockRetryPendingTask({ userId, signedInAt, code }: { userId: string; signedInAt: string; code: string }): Contract {
  const user = actionAuthorize(userId, signedInAt, 'contracts.view');
  const contract = findOrThrow(code);
  if (!canView(contract, user)) throw new ContractActionError('FORBIDDEN');
  const next = { ...contract, pendingTask: undefined };
  save(next);
  return sanitizeFor(next, user);
}

function legalStepFor(code: string, userId: string, signedInAt: string) {
  const user = actionAuthorize(userId, signedInAt, 'approvals.review-legal');
  const contract = findOrThrow(code);
  const round = latestRound(contract);
  const step = activeStep(round);
  if (!round || step?.key !== 'legal') throw new ContractActionError('STEP_DONE', { status: contract.status });
  if (step.assigneeId !== user.id) throw new ContractActionError('NOT_ASSIGNEE', { status: contract.status });
  return { user, contract, round };
}

/** SYS-CTR-08 A1.2: yêu cầu phối hợp phòng ban chuyên môn, nêu nội dung cần xác minh. */
export function mockRequestCoordination(request: CoordinationRequest): Contract {
  const { user, contract, round } = legalStepFor(request.code, request.userId, request.signedInAt);
  if (!request.department || !request.content.trim()) throw new ContractActionError('VALIDATION');
  const now = new Date().toISOString();
  const coordination = { id: `${round.no}-${round.coordinations.length + 1}`, department: request.department, content: request.content.trim(), requestedByName: user.fullName, requestedAt: now };
  const log: ApprovalLogEntry[] = [...round.log, { at: now, stepKey: 'legal', actorName: user.fullName, action: 'coordinate', from: contract.status, to: contract.status, note: `${request.department}: ${coordination.content}`, version: contract.version, internal: true }];
  const next: Contract = { ...contract, rounds: replaceRound(contract, { ...round, log, coordinations: [...round.coordinations, coordination] }), updatedAt: now };
  save(next);
  mockStore.audit({ action: 'CONTRACT_COORDINATION', username: user.username, detail: `${contract.code} → ${request.department}` });
  return next;
}

/** SYS-CTR-08 A1.3–A1.4: ghi nhận phản hồi của phòng ban để Pháp chế đối chiếu. */
export function mockReplyCoordination(request: CoordinationReplyRequest): Contract {
  const { user, contract, round } = legalStepFor(request.code, request.userId, request.signedInAt);
  if (!request.reply.trim()) throw new ContractActionError('VALIDATION');
  const now = new Date().toISOString();
  const target = round.coordinations.find((item) => item.id === request.id);
  if (!target) throw new ContractActionError('NOT_FOUND');
  const coordinations = round.coordinations.map((item) => (item.id === request.id ? { ...item, reply: request.reply.trim(), repliedByName: `Đầu mối ${item.department}`, repliedAt: now } : item));
  const log: ApprovalLogEntry[] = [...round.log, { at: now, stepKey: 'legal', actorName: `Đầu mối ${target.department}`, action: 'coordination-reply', from: contract.status, to: contract.status, note: request.reply.trim(), version: contract.version, internal: true }];
  const next: Contract = { ...contract, rounds: replaceRound(contract, { ...round, log, coordinations }), updatedAt: now };
  save(next);
  mockStore.audit({ action: 'CONTRACT_COORDINATION', username: user.username, detail: `${contract.code}: phản hồi ${target.department}` });
  return next;
}

type InboxRequest = { userId: string; signedInAt: string; step: ApprovalStepKey; done: boolean };

/** 07.1 / 08.1 / 09.1: hồ sơ được giao cho người dùng tại bước; `done` cho danh sách đã xử lý. */
export function mockListApprovalInbox({ userId, signedInAt, step, done }: InboxRequest): ApprovalInboxItem[] {
  const user = actionAuthorize(userId, signedInAt, STEP_PERMISSION[step]);
  const index = STEP_ORDER.indexOf(step);
  return allContracts()
    .flatMap((contract) => {
      const rounds = done ? contract.rounds : [latestRound(contract)].filter(Boolean) as ApprovalRound[];
      return rounds
        .filter((round) => {
          const item = round.steps.find((s) => s.key === step);
          return done ? item?.decidedById === user.id : activeStep(round)?.key === step && item?.assigneeId === user.id;
        })
        .map((round) => {
          const item = round.steps.find((s) => s.key === step)!;
          const previous = index > 0 ? round.steps[index - 1] : undefined;
          return {
            ...toListItem(contract),
            value: contract.value,
            submittedAt: round.submittedAt,
            previousStep: previous?.decidedByName ? `${previous.label}: ${previous.decidedByName}` : undefined,
            assignedAt: item.assignedAt,
            decidedAt: item.decidedAt,
            decision: item.decision,
          };
        });
    })
    .sort((a, b) => (b.decidedAt ?? b.assignedAt ?? '').localeCompare(a.decidedAt ?? a.assignedAt ?? ''));
}
