import { mergePermissions, type Permission } from '@/constants/roles';
import type { AuthUser } from '@/features/auth/types/auth';
import {
  CreateCustomerError,
  UpdateCustomerError,
  type CreateCustomerRequest,
  type CreateCustomerResult,
  type Customer,
  type CustomerHistoryEntry,
  type EditableCustomerDraft,
  type UpdateCustomerRequest,
  type UpdateCustomerResult,
} from '@/features/customers/types/customer';
import { diffCustomer, EDITABLE_FIELDS, toEditableDraft } from '@/features/customers/utils/customerChanges';
import { normalizeSearchText, validateCustomerQuery } from '@/features/customers/utils/customerSearch';
import {
  CustomerSearchError,
  type CustomerSearchRequest,
  type CustomerSearchResult,
} from '@/features/customers/types/customerList';
import { normalizeCustomerDraft, validateCustomerDraft } from '@/features/customers/utils/customerValidation';
import { mockCheckSession } from './authServer';
import { mockStore } from './mockStore';
import {
  CUSTOMER_GROUPS,
  SEED_CUSTOMERS,
  SERVICE_GROUPS,
  SIMULATED_CONCURRENT_EDIT,
  SIMULATED_LOST_RESPONSE_PREFIX,
  SIMULATED_SAVE_ERROR_PREFIX,
  SIMULATED_UPDATE_CONFLICT_CODE,
  SIMULATED_UPDATE_LOST_RESPONSE_CODE,
  SIMULATED_UPDATE_SAVE_ERROR_CODE,
} from './seed/customers';

/** Bản đã lưu trong prototype thay cho bản mẫu cùng mã. */
function allCustomers(): Customer[] {
  const stored = mockStore.getStoredCustomers();
  const storedCodes = new Set(stored.map((c) => c.code));
  return [...SEED_CUSTOMERS.filter((c) => !storedCodes.has(c.code)), ...stored];
}

/** Danh mục khách hàng hiện hành cho các phân hệ liên kết; nơi gọi vẫn phải tự lọc trạng thái theo nghiệp vụ. */
export function mockGetCustomerOptions(): Customer[] {
  return allCustomers();
}

/** Mã khách hàng tăng dần dạng KH-000312, không dùng lại mã đã cấp. */
function nextCustomerCode(): string {
  const max = Math.max(0, ...allCustomers().map((c) => Number(c.code.slice(3))));
  return `KH-${String(max + 1).padStart(6, '0')}`;
}

export function mockGetCustomer(code: string): Customer | undefined {
  return allCustomers().find((c) => c.code === code);
}

export function mockGetCustomerFormOptions() {
  return { customerGroups: CUSTOMER_GROUPS, serviceGroups: SERVICE_GROUPS };
}

/** Kiểm tra phiên và quyền tại thời điểm lưu, không dựa vào việc FE đã hiển thị biểu mẫu. */
export function authorize<E extends Error>(
  userId: string,
  signedInAt: string,
  permission: Permission,
  fail: (code: 'SESSION_ENDED' | 'FORBIDDEN', sessionStatus?: Exclude<ReturnType<typeof mockCheckSession>['status'], 'active'>) => E,
): AuthUser {
  const session = mockCheckSession(userId, signedInAt);
  if (session.status !== 'active') throw fail('SESSION_ENDED', session.status);
  if (!mergePermissions(session.user.roles).has(permission)) throw fail('FORBIDDEN');
  return session.user;
}

/**
 * Giả lập API tạo khách hàng theo UC-CUS-01: kiểm tra phiên và quyền, idempotency, kiểm tra lại dữ liệu,
 * MST duy nhất (kể cả khách Tạm ngưng), rồi lưu hồ sơ + lịch sử tạo trong một lần ghi.
 */
export function mockCreateCustomer({ userId, signedInAt, idempotencyKey, draft }: CreateCustomerRequest): CreateCustomerResult {
  // A2 / A5: phiên hết hạn/bị thu hồi hoặc mất quyền → không lưu.
  const user = authorize(userId, signedInAt, 'customers.create', (code, sessionStatus) => {
    if (code === 'FORBIDDEN') {
      mockStore.audit({ action: 'CUSTOMER_CREATE_REJECTED', username: '', detail: `Không có quyền tạo khách hàng (${userId})` });
    }
    return new CreateCustomerError(code, { sessionStatus });
  });

  // A6.2 / A6.4: cùng một lần gửi (bấm Lưu nhiều lần, thử lại sau mất kết nối) chỉ xử lý một lần.
  const processedCode = mockStore.getCustomerCodeByRequest(idempotencyKey);
  if (processedCode) return { customer: mockGetCustomer(processedCode)!, replayed: true };

  const data = normalizeCustomerDraft(draft);
  const fieldErrors = validateCustomerDraft(data);
  if (Object.keys(fieldErrors).length > 0) throw new CreateCustomerError('VALIDATION', { fieldErrors });

  // A5.3 / A5.6 / A6.1: MST là khóa duy nhất, kiểm tra ngay trước khi ghi.
  const duplicate = allCustomers().find((c) => c.taxCode === data.taxCode);
  if (duplicate) {
    mockStore.audit({
      action: 'CUSTOMER_CREATE_REJECTED',
      username: user.username,
      detail: `MST ${data.taxCode} đã thuộc ${duplicate.code}`,
    });
    const { code, name, status, taxCode } = duplicate;
    throw new CreateCustomerError('DUPLICATE_TAX_CODE', { existing: { code, name, status, taxCode } });
  }

  // A6.3: lỗi ghi hồ sơ/lịch sử → hoàn tác, không lưu gì.
  if (data.taxCode.startsWith(SIMULATED_SAVE_ERROR_PREFIX) && mockStore.takeOnce(`customer-save:${idempotencyKey}`)) {
    mockStore.audit({ action: 'CUSTOMER_CREATE_ERROR', username: user.username, detail: 'Lỗi lưu hồ sơ, đã hoàn tác' });
    throw new CreateCustomerError('SAVE_FAILED');
  }

  const now = new Date().toISOString();
  const customer: Customer = {
    ...data,
    code: nextCustomerCode(),
    status: 'active',
    ownerId: user.id,
    ownerName: user.fullName,
    version: 1,
    createdAt: now,
    createdBy: user.fullName,
    history: [{ action: 'Tạo hồ sơ khách hàng', by: user.fullName, at: now, version: 1, requestId: idempotencyKey }],
  };
  mockStore.saveCustomer(customer, idempotencyKey);
  mockStore.audit({ action: 'CUSTOMER_CREATED', username: user.username, detail: `Tạo ${customer.code} – ${customer.name}` });

  // A6.4: hồ sơ đã lưu nhưng phản hồi không tới được trình duyệt.
  if (data.taxCode.startsWith(SIMULATED_LOST_RESPONSE_PREFIX) && mockStore.takeOnce(`customer-lost:${idempotencyKey}`)) {
    throw new CreateCustomerError('NETWORK');
  }

  return { customer, replayed: false };
}

/** Ghi một phiên bản mới gồm thông tin đã sửa và mục lịch sử tương ứng trong cùng một lần ghi. */
function applyUpdate(
  current: Customer,
  edited: EditableCustomerDraft,
  meta: { by: string; reason: string; requestId?: string },
): Customer {
  const changes = diffCustomer(toEditableDraft(current), edited);
  const after = Object.fromEntries(changes.map((change) => [change.field, change.after]));
  const entry: CustomerHistoryEntry = {
    action: 'Cập nhật thông tin',
    by: meta.by,
    at: new Date().toISOString(),
    fromVersion: current.version,
    version: current.version + 1,
    changes,
    reason: meta.reason,
    requestId: meta.requestId,
  };
  const next: Customer = { ...current, ...after, version: entry.version, history: [...current.history, entry] };
  mockStore.saveCustomer(next, meta.requestId);
  return next;
}

/**
 * Giả lập API cập nhật khách hàng theo UC-CUS-02: kiểm tra phiên/quyền, idempotency, trường chỉ đọc,
 * phiên bản đang sửa (optimistic locking), dữ liệu và lý do, rồi ghi phiên bản mới + lịch sử thay đổi.
 */
export function mockUpdateCustomer(request: UpdateCustomerRequest): UpdateCustomerResult {
  const { userId, signedInAt, idempotencyKey, code, baseVersion, draft, reason } = request;
  const user = authorize(userId, signedInAt, 'customers.update', (errorCode, sessionStatus) => {
    if (errorCode === 'FORBIDDEN') {
      mockStore.audit({ action: 'CUSTOMER_UPDATE_REJECTED', username: '', detail: `Không có quyền cập nhật ${code}` });
    }
    return new UpdateCustomerError(errorCode, { sessionStatus });
  });

  // A6.3: thử lại sau mất kết nối → trả kết quả đã ghi, không áp lại trên phiên bản mới.
  if (mockStore.getCustomerCodeByRequest(idempotencyKey) === code) {
    const customer = mockGetCustomer(code)!;
    const entry = customer.history.find((h) => h.requestId === idempotencyKey);
    return { customer, changedFields: entry?.changes?.map((c) => c.field) ?? [], replayed: true };
  }

  let current = mockGetCustomer(code);
  if (!current) throw new UpdateCustomerError('NOT_FOUND');

  // A5.4: yêu cầu cố sửa mã KH/MST/trạng thái/người phụ trách → từ chối toàn bộ.
  const allowed = new Set<string>(EDITABLE_FIELDS);
  if (Object.keys(draft).some((key) => !allowed.has(key))) {
    mockStore.audit({ action: 'CUSTOMER_UPDATE_REJECTED', username: user.username, detail: `Sửa trường chỉ đọc của ${code}` });
    throw new UpdateCustomerError('IMMUTABLE_FIELD');
  }

  // Giả lập người khác lưu trước (02.4).
  if (code === SIMULATED_UPDATE_CONFLICT_CODE && mockStore.takeOnce(`customer-conflict:${code}`)) {
    current = applyUpdate(current, { ...toEditableDraft(current), ...SIMULATED_CONCURRENT_EDIT.draft }, SIMULATED_CONCURRENT_EDIT);
  }

  // A5.3: phiên bản đã thay đổi → không ghi đè.
  if (current.version !== baseVersion) {
    const last = current.history[current.history.length - 1];
    mockStore.audit({ action: 'CUSTOMER_UPDATE_REJECTED', username: user.username, detail: `${code}: phiên bản ${baseVersion} đã cũ` });
    throw new UpdateCustomerError('CONFLICT', { conflict: { latest: current, updatedBy: last.by, updatedAt: last.at } });
  }

  const fieldErrors = validateCustomerDraft({ ...draft, taxCode: current.taxCode });
  if (Object.keys(fieldErrors).length > 0 || !reason.trim()) {
    throw new UpdateCustomerError('VALIDATION', { fieldErrors });
  }

  // A6.1: không khác bản đang lưu → không tạo phiên bản/lịch sử giả.
  if (diffCustomer(toEditableDraft(current), draft).length === 0) throw new UpdateCustomerError('NO_CHANGES');

  // A6.2: lỗi ghi dữ liệu/lịch sử → hoàn tác.
  if (code === SIMULATED_UPDATE_SAVE_ERROR_CODE && mockStore.takeOnce(`customer-update-save:${idempotencyKey}`)) {
    mockStore.audit({ action: 'CUSTOMER_UPDATE_ERROR', username: user.username, detail: `Lỗi lưu ${code}, đã hoàn tác` });
    throw new UpdateCustomerError('SAVE_FAILED');
  }

  const customer = applyUpdate(current, draft, { by: user.fullName, reason: reason.trim(), requestId: idempotencyKey });
  const changedFields = customer.history[customer.history.length - 1].changes!.map((c) => c.field);
  mockStore.audit({
    action: 'CUSTOMER_UPDATED',
    username: user.username,
    detail: `${code} v${baseVersion} → v${customer.version}: ${changedFields.join(', ')}`,
  });

  // A6.3: đã ghi nhưng phản hồi không tới được trình duyệt.
  if (code === SIMULATED_UPDATE_LOST_RESPONSE_CODE && mockStore.takeOnce(`customer-update-lost:${idempotencyKey}`)) {
    throw new UpdateCustomerError('NETWORK');
  }

  return { customer, changedFields, replayed: false };
}

/*
 * Phạm vi khách hàng của người tra cứu. Đặc tả chưa chốt quy tắc phân công (theo nhân viên phụ trách, khu vực hay
 * phòng), nên prototype cho xem toàn bộ; BE phải lọc theo phạm vi trước khi đếm và phân trang (A1).
 */
function isInScope(_user: AuthUser, _customer: Customer): boolean {
  return true;
}

/** Từ khóa dùng để giả lập lỗi tải danh sách ở lần tra cứu đầu (05.4 – A4.2), như frame trên Figma. */
const SIMULATED_SEARCH_FAILURE_KEYWORD = '0318';

/** UC-CUS-05: tra cứu khách hàng theo mã/tên/MST (khớp một phần), trạng thái, sắp xếp và phân trang. */
export function mockSearchCustomers(request: CustomerSearchRequest): CustomerSearchResult {
  const user = authorize(request.userId, request.signedInAt, 'customers.view', (code, sessionStatus) => new CustomerSearchError(code, { sessionStatus }));
  // A4.1: tham số không hợp lệ thì không chạy truy vấn (không trả danh sách không giới hạn).
  if (validateCustomerQuery(request).length > 0) throw new CustomerSearchError('INVALID_QUERY');
  if (request.keyword.trim() === SIMULATED_SEARCH_FAILURE_KEYWORD && !request.retry) {
    throw new CustomerSearchError('LOAD_FAILED', { reference: 'CUS-LIST-503' });
  }

  const keyword = normalizeSearchText(request.keyword);
  const compact = keyword.replace(/[\s-]/g, '');
  const updatedAt = (c: Customer) => c.history[c.history.length - 1]?.at ?? c.createdAt;
  const matches = allCustomers()
    .filter((c) => isInScope(user, c))
    .filter((c) => request.status === 'all' || c.status === request.status)
    .filter(
      (c) =>
        !keyword ||
        normalizeSearchText(c.name).includes(keyword) ||
        c.code.toLowerCase().replace('-', '').includes(compact) ||
        c.taxCode.includes(compact),
    )
    .sort((a, b) => {
      if (request.sort === 'name-asc') return a.name.localeCompare(b.name, 'vi');
      if (request.sort === 'code-asc') return a.code.localeCompare(b.code);
      return updatedAt(b).localeCompare(updatedAt(a));
    });

  const pages = Math.max(1, Math.ceil(matches.length / request.size));
  const page = Math.min(request.page, pages);
  return {
    items: matches.slice((page - 1) * request.size, page * request.size).map((c) => ({
      code: c.code,
      name: c.name,
      address: c.address,
      taxCode: c.taxCode,
      status: c.status,
      updatedAt: updatedAt(c),
    })),
    total: matches.length,
    page,
    size: request.size,
  };
}
