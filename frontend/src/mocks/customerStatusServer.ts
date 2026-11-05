import type { Customer, CustomerHistoryEntry } from '@/features/customers/types/customer';
import {
  StatusChangeError,
  type Department,
  type DepartmentNotice,
  type ImpactPlanItem,
  type ReactivateCustomerRequest,
  type ReactivationCheck,
  type ReactivationContext,
  type ReactivationRecord,
  type StatusChangeResult,
  type SuspendCustomerRequest,
  type SuspensionRecord,
  type SuspensionReview,
} from '@/features/customers/types/customerStatus';
import { authorize, mockGetCustomer } from './customersServer';
import { mockStore } from './mockStore';
import {
  SEED_IMPACTS,
  SEED_REACTIVATION_CHECKS,
  SIMULATED_NOTICE_FAILURE_CODE,
  SIMULATED_REACTIVATION_LOAD_FAILURE_CODE,
  SIMULATED_REVIEW_FAILURE_CODE,
  SIMULATED_SUSPEND_LOST_RESPONSE_CODE,
  SIMULATED_SUSPEND_SAVE_ERROR_CODE,
  SUSPENSION_REASON_GROUPS,
} from './seed/customerStatus';

const TITLE_BY_ROLE = 'Trưởng phòng Kinh doanh';

export function mockGetSuspensionReasonGroups() {
  return SUSPENSION_REASON_GROUPS;
}

function statusError(code: 'SESSION_ENDED' | 'FORBIDDEN', sessionStatus?: StatusChangeError['sessionStatus']) {
  return new StatusChangeError(code, { sessionStatus });
}

function requireCustomer(code: string): Customer {
  const customer = mockGetCustomer(code);
  if (!customer) throw new StatusChangeError('NOT_FOUND');
  return customer;
}

/** Bước 2 UC-CUS-03: rà soát hồ sơ/công việc còn mở. `retry` là lần tải lại sau khi một nhóm dữ liệu bị lỗi. */
export function mockGetSuspensionReview(code: string, retry: boolean): SuspensionReview {
  requireCustomer(code);
  const items = SEED_IMPACTS[code] ?? [];
  if (code === SIMULATED_REVIEW_FAILURE_CODE && !retry) {
    return { items: items.filter((i) => i.kind !== 'job'), failedKinds: ['job'], failedAt: new Date().toISOString() };
  }
  return { items, failedKinds: [] };
}

function statusEntry(customer: Customer, entry: Omit<CustomerHistoryEntry, 'version' | 'fromVersion'>): CustomerHistoryEntry {
  return { ...entry, fromVersion: customer.version, version: customer.version + 1 };
}

/**
 * UC-CUS-03: kiểm tra quyền, trạng thái, phiên bản, lý do và phương án; chuyển Hoạt động → Tạm ngưng cùng lý do,
 * căn cứ, phương án và lịch sử trong một lần ghi; ghi nhận yêu cầu thông báo các bộ phận liên quan.
 */
export function mockSuspendCustomer(request: SuspendCustomerRequest): StatusChangeResult {
  const { userId, signedInAt, idempotencyKey, code, baseVersion } = request;
  const user = authorize(userId, signedInAt, 'customers.change-status', statusError);

  if (mockStore.getCustomerCodeByRequest(idempotencyKey) === code) return { customer: requireCustomer(code), replayed: true };

  const current = requireCustomer(code);
  // A2 / AC-12: đã Tạm ngưng thì không tạo thêm lần chuyển trạng thái.
  if (current.status === 'suspended') throw new StatusChangeError('ALREADY_IN_STATUS', { currentStatus: current.status });
  // A7.1: dữ liệu đã đổi kể từ khi mở thao tác.
  if (current.version !== baseVersion) throw new StatusChangeError('CONFLICT');

  if (!SUSPENSION_REASON_GROUPS.some((g) => g.code === request.reasonGroup) || !request.reason.trim()) {
    throw new StatusChangeError('VALIDATION');
  }
  const review = mockGetSuspensionReview(code, true);
  const plan: ImpactPlanItem[] = review.items.map((item) => {
    const option = request.plan.find((p) => p.id === item.id)?.option;
    if (!option || !item.options.includes(option)) throw new StatusChangeError('REVIEW_INCOMPLETE');
    return { id: item.id, kind: item.kind, code: item.code, department: item.department, planNote: item.planNote, option };
  });

  // A8.1: lỗi lưu trạng thái/lịch sử → hoàn tác, khách hàng giữ Hoạt động.
  if (code === SIMULATED_SUSPEND_SAVE_ERROR_CODE && mockStore.takeOnce(`customer-suspend-save:${idempotencyKey}`)) {
    mockStore.audit({ action: 'CUSTOMER_STATUS_ERROR', username: user.username, detail: `Lỗi tạm ngưng ${code}, đã hoàn tác` });
    throw new StatusChangeError('SAVE_FAILED');
  }

  const at = new Date().toISOString();
  const departments = [...new Set(plan.map((p) => p.department).filter((d): d is Department => d !== 'Kinh doanh'))];
  // A9: gửi thông báo lỗi không hoàn tác quyết định, chỉ ghi nhận để gửi lại.
  const notices: DepartmentNotice[] = (departments.length ? departments : (['Kế toán'] as Department[])).map((department) => ({
    department,
    status: code === SIMULATED_NOTICE_FAILURE_CODE && department === 'Pháp chế' ? 'retry' : 'sent',
    at,
  }));
  const suspension: SuspensionRecord = {
    reasonGroup: request.reasonGroup,
    reason: request.reason.trim(),
    evidence: request.evidence,
    decidedBy: user.fullName,
    decidedByTitle: TITLE_BY_ROLE,
    at,
    plan,
    coordinationNote: request.coordinationNote.trim(),
    notices,
  };
  const entry = statusEntry(current, {
    action: 'Tạm ngưng khách hàng',
    by: user.fullName,
    at,
    reason: suspension.reason,
    statusChange: { from: 'active', to: 'suspended' },
    requestId: idempotencyKey,
  });
  const customer: Customer = { ...current, status: 'suspended', version: entry.version, suspension, history: [...current.history, entry] };
  mockStore.saveCustomer(customer, idempotencyKey);
  mockStore.audit({ action: 'CUSTOMER_SUSPENDED', username: user.username, detail: `${code}: Hoạt động → Tạm ngưng` });

  // A8.2: đã ghi nhưng mất kết nối trước khi nhận kết quả.
  if (code === SIMULATED_SUSPEND_LOST_RESPONSE_CODE && mockStore.takeOnce(`customer-suspend-lost:${idempotencyKey}`)) {
    throw new StatusChangeError('NETWORK');
  }
  return { customer, replayed: false };
}

const CHECK_LABELS: Record<ReactivationCheck['id'], { met: string; unmet: string; owner: Department }> = {
  debt: { met: 'Không có công nợ quá hạn', unmet: 'Công nợ quá hạn chưa có xác nhận xử lý', owner: 'Kế toán' },
  dispute: { met: 'Không còn tranh chấp hợp đồng', unmet: 'Tranh chấp hợp đồng chưa được giải quyết', owner: 'Pháp chế' },
  operation: { met: 'Không còn vấn đề vận hành tồn đọng', unmet: 'Vấn đề vận hành chưa được giải quyết', owner: 'Khai thác' },
};

const CAUSE_CHECK: Record<string, ReactivationCheck['id']> = {
  CONG_NO: 'debt',
  VI_PHAM_HD: 'dispute',
  TRANH_CHAP: 'dispute',
  VAN_HANH: 'operation',
};

/**
 * Điều kiện kích hoạt lại. Khách hàng trong dữ liệu mẫu đã có xác nhận của các bộ phận; khách tạm ngưng trong
 * prototype chỉ có điều kiện tương ứng nguyên nhân là "Chưa đạt" cho tới khi bộ phận phụ trách xác nhận.
 */
function reactivationChecks(customer: Customer): ReactivationCheck[] {
  // Xác nhận trong dữ liệu mẫu chỉ áp dụng cho lượt tạm ngưng có sẵn (mục lịch sử mẫu không có requestId).
  const lastSuspend = [...customer.history].reverse().find((h) => h.statusChange?.to === 'suspended');
  const seeded = SEED_REACTIVATION_CHECKS[customer.code];
  if (seeded && !lastSuspend?.requestId) return seeded;
  const cause = CAUSE_CHECK[customer.suspension?.reasonGroup ?? ''];
  return (Object.keys(CHECK_LABELS) as ReactivationCheck['id'][]).map((id) => {
    const labels = CHECK_LABELS[id];
    return id === cause
      ? { id, label: labels.unmet, status: 'unmet', detail: `Chưa có xác nhận của ${labels.owner}` }
      : { id, label: labels.met, status: 'met', detail: 'Không phát sinh trong lượt tạm ngưng này' };
  });
}

/** UC-CUS-04 bước 2: lý do tạm ngưng hiện hành và điều kiện cần kiểm tra. `retry` là lần tải lại sau lỗi (04.6). */
export function mockGetReactivationContext(code: string, retry: boolean): ReactivationContext {
  const customer = requireCustomer(code);
  if (customer.status !== 'suspended' || !customer.suspension) {
    throw new StatusChangeError('ALREADY_IN_STATUS', { currentStatus: customer.status });
  }
  if (code === SIMULATED_REACTIVATION_LOAD_FAILURE_CODE && !retry) throw new StatusChangeError('LOAD_FAILED');
  return { suspension: customer.suspension, checks: reactivationChecks(customer) };
}

/**
 * UC-CUS-04: kiểm tra quyền, trạng thái, phiên bản, điều kiện (hoặc quyết định ngoại lệ cho công nợ – A4.3), lý do
 * và căn cứ; chuyển Tạm ngưng → Hoạt động, gỡ hạn chế giao dịch mới. Hợp đồng/hồ sơ đã phát sinh giữ nguyên.
 */
export function mockReactivateCustomer(request: ReactivateCustomerRequest): StatusChangeResult {
  const { userId, signedInAt, idempotencyKey, code, baseVersion } = request;
  const user = authorize(userId, signedInAt, 'customers.change-status', statusError);

  if (mockStore.getCustomerCodeByRequest(idempotencyKey) === code) return { customer: requireCustomer(code), replayed: true };

  const current = requireCustomer(code);
  // A2: đã Hoạt động thì không ghi lịch sử trùng.
  if (current.status === 'active') throw new StatusChangeError('ALREADY_IN_STATUS', { currentStatus: current.status });
  if (current.version !== baseVersion) throw new StatusChangeError('CONFLICT');
  if (!request.reason.trim() || request.evidence.length === 0) throw new StatusChangeError('VALIDATION');

  // A4.1 / A4.2: điều kiện chưa đạt; chỉ công nợ được chấp thuận theo quyết định ngoại lệ.
  const exception = request.exception?.decisionNo.trim() && request.exception.content.trim() ? request.exception : undefined;
  const blocked = reactivationChecks(current).some((c) => c.status === 'unmet' && !(c.id === 'debt' && exception));
  if (blocked) throw new StatusChangeError('CONDITIONS_NOT_MET');

  const at = new Date().toISOString();
  const reactivation: ReactivationRecord = {
    reason: request.reason.trim(),
    evidence: request.evidence,
    decidedBy: user.fullName,
    decidedByTitle: TITLE_BY_ROLE,
    at,
    exception,
    notices: (['Khai thác', 'Kế toán', 'Pháp chế'] as Department[]).map((department) => ({ department, status: 'sent', at })),
  };
  const entry = statusEntry(current, {
    action: 'Kích hoạt lại khách hàng',
    by: user.fullName,
    at,
    reason: exception ? `${reactivation.reason} (ngoại lệ: ${exception.decisionNo})` : reactivation.reason,
    statusChange: { from: 'suspended', to: 'active' },
    requestId: idempotencyKey,
  });
  const customer: Customer = {
    ...current,
    status: 'active',
    version: entry.version,
    suspension: undefined,
    reactivation,
    history: [...current.history, entry],
  };
  mockStore.saveCustomer(customer, idempotencyKey);
  mockStore.audit({ action: 'CUSTOMER_REACTIVATED', username: user.username, detail: `${code}: Tạm ngưng → Hoạt động` });
  return { customer, replayed: false };
}
