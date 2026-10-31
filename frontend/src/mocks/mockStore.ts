import type { Area, AreaService, AreaStaff } from '@/features/areas/types/area';
import type { LoginTrace } from '@/features/auth/types/auth';
import type { Customer } from '@/features/customers/types/customer';
import type { Contract } from '@/features/contracts/types/contract';
import { SEED_ACCOUNTS } from './seed/users';

/*
 * Trạng thái phía "server" giả lập, lưu trong localStorage để giữ bộ đếm sai mật khẩu,
 * thời điểm khóa, lần đăng nhập trước, mật khẩu đã đặt lại và OTP qua các lần tải lại trang.
 */
const STORE_KEY = 'qtkd.mock.v1';

export type LoginAttemptState = {
  failedCount: number;
  lockedUntil?: number;
};

/** Trạng thái quên mật khẩu theo từng định danh (UC-CHUNG-02). */
export type RecoveryState = {
  /** Không có mã khi tài khoản không tồn tại/vô hiệu hóa – vẫn giữ nhịp thời gian để không lộ thông tin. */
  code?: string;
  expiresAt?: number;
  failedCount: number;
  /** Thời điểm các lần gửi mã trong cửa sổ 15 phút. */
  sentAt: number[];
  suspendedUntil?: number;
  resetToken?: string;
  resetTokenExpiresAt?: number;
};

export type AuditEvent = {
  at: string;
  action:
    | 'LOGIN_SUCCESS'
    | 'LOGIN_FAILED'
    | 'LOGIN_REJECTED'
    | 'LOGIN_ERROR'
    | 'OTP_SENT'
    | 'OTP_FAILED'
    | 'RECOVERY_SUSPENDED'
    | 'PASSWORD_RESET'
    | 'PASSWORD_RESET_ERROR'
    | 'LOGOUT'
    | 'SESSION_EXPIRED'
    | 'PASSWORD_CHANGED'
    | 'PASSWORD_CHANGE_FAILED'
    | 'PASSWORD_CHANGE_ERROR'
    | 'CUSTOMER_CREATED'
    | 'CUSTOMER_CREATE_REJECTED'
    | 'CUSTOMER_CREATE_ERROR'
    | 'CUSTOMER_UPDATED'
    | 'CUSTOMER_UPDATE_REJECTED'
    | 'CUSTOMER_UPDATE_ERROR'
    | 'CUSTOMER_SUSPENDED'
    | 'CUSTOMER_REACTIVATED'
    | 'CUSTOMER_STATUS_ERROR'
    | 'PAYMENT_DISCREPANCY_REPORTED'
    | 'AREA_CREATED'
    | 'AREA_CREATE_REJECTED'
    | 'AREA_CREATE_ERROR'
    | 'AREA_HIERARCHY_UPDATED'
    | 'AREA_HIERARCHY_REJECTED'
    | 'AREA_UPDATED'
    | 'AREA_UPDATE_REJECTED'
    | 'AREA_PROFILE_EXPORTED'
    | 'AREA_STAFF_ASSIGNED'
    | 'AREA_STAFF_ENDED'
    | 'AREA_SERVICES_UPDATED'
    | 'AREA_STATUS_CHANGED'
    | 'AREA_OPERATION_REJECTED'
    | 'CONTRACT_CREATED'
    | 'CONTRACT_CREATE_REJECTED'
    | 'CONTRACT_CREATE_ERROR'
    | 'CONTRACT_ATTACHMENTS_UPDATED';
  username: string;
  detail: string;
};

type MockState = {
  attempts: Record<string, LoginAttemptState>;
  lastLogins: Record<string, LoginTrace>;
  /** Mật khẩu đã đổi so với dữ liệu mẫu, theo userId. */
  passwords: Record<string, string>;
  /** Phiên đăng nhập trước thời điểm này bị thu hồi (đặt lại/đổi mật khẩu), theo userId. */
  revokedBefore: Record<string, number>;
  /** Lần đổi/đặt lại mật khẩu gần nhất (ISO), theo userId; cũng gỡ cờ bắt buộc đổi mật khẩu tạm. */
  passwordChangedAt: Record<string, string>;
  recovery: Record<string, RecoveryState>;
  /** Các lỗi giả lập chỉ xảy ra một lần (ví dụ email lỗi ở lần gửi đầu). */
  simulatedOnce: Record<string, boolean>;
  audit: AuditEvent[];
  /** Khách hàng tạo hoặc đã cập nhật trong prototype; bản ở đây thay cho bản trong `seed/customers`. */
  customers: Customer[];
  /** Idempotency-Key của yêu cầu tạo/cập nhật khách hàng → mã khách hàng. */
  customerRequests: Record<string, string>;
  /** Khu vực tạo hoặc đã cập nhật trong prototype; bản ở đây thay cho bản trong `seed/areas`. */
  areas: Area[];
  /** Idempotency-Key của yêu cầu tạo/đổi cấp cha khu vực → mã khu vực. */
  areaRequests: Record<string, string>;
  /** Danh sách dịch vụ/nhân sự đã đổi trong prototype theo AreaId; thay cho bản trong `seed/areaRecords`. */
  areaRecordOverrides: Record<string, { services?: AreaService[]; staff?: AreaStaff[] }>;
  /** Hợp đồng nháp tạo trong prototype SYS-CTR-01. */
  contracts: Contract[];
  /** Idempotency-Key của yêu cầu tạo hợp đồng → mã hợp đồng. */
  contractRequests: Record<string, string>;
};

const MAX_AUDIT_EVENTS = 200;

function createInitialState(): MockState {
  const now = Date.now();
  const state: MockState = {
    attempts: {},
    lastLogins: {},
    passwords: {},
    revokedBefore: {},
    passwordChangedAt: {},
    recovery: {},
    simulatedOnce: {},
    audit: [],
    customers: [],
    customerRequests: {},
    areas: [],
    areaRequests: {},
    areaRecordOverrides: {},
    contracts: [],
    contractRequests: {},
  };
  for (const account of SEED_ACCOUNTS) {
    if (account.lastLogin) state.lastLogins[account.id] = account.lastLogin;
    if (account.seedLockSeconds) {
      state.attempts[account.username] = { failedCount: 5, lockedUntil: now + account.seedLockSeconds * 1000 };
    }
  }
  return state;
}

let memoryState: MockState | null = null;

// Tab khác thay đổi dữ liệu giả lập (ví dụ đặt lại mật khẩu) → đọc lại để thấy phiên bị thu hồi.
window.addEventListener('storage', (event) => {
  if (event.key === STORE_KEY) memoryState = null;
});

function readState(): MockState {
  if (memoryState) return memoryState;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    // Gộp với giá trị mặc định để dữ liệu lưu từ phiên bản cũ vẫn đọc được.
    memoryState = raw ? { ...createInitialState(), ...(JSON.parse(raw) as Partial<MockState>) } : createInitialState();
  } catch {
    memoryState = createInitialState();
  }
  return memoryState;
}

function writeState(state: MockState) {
  memoryState = state;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    // Trình duyệt chặn localStorage: vẫn chạy được với trạng thái trong bộ nhớ.
  }
}

function update(patch: (state: MockState) => Partial<MockState>) {
  const state = readState();
  writeState({ ...state, ...patch(state) });
}

export const mockStore = {
  getAttempt(username: string): LoginAttemptState {
    return readState().attempts[username] ?? { failedCount: 0 };
  },
  setAttempt(username: string, attempt: LoginAttemptState) {
    update((s) => ({ attempts: { ...s.attempts, [username]: attempt } }));
  },
  getLastLogin(userId: string): LoginTrace | null {
    return readState().lastLogins[userId] ?? null;
  },
  setLastLogin(userId: string, trace: LoginTrace) {
    update((s) => ({ lastLogins: { ...s.lastLogins, [userId]: trace } }));
  },
  getPassword(userId: string): string | undefined {
    return readState().passwords[userId];
  },
  /** Lưu mật khẩu mới cùng thời điểm đổi (một lần ghi – tương ứng một giao dịch ở BE). */
  setPassword(userId: string, password: string, changedAt: string) {
    update((s) => ({
      passwords: { ...s.passwords, [userId]: password },
      passwordChangedAt: { ...s.passwordChangedAt, [userId]: changedAt },
    }));
  },
  getPasswordChangedAt(userId: string): string | undefined {
    return readState().passwordChangedAt[userId];
  },
  getRevokedBefore(userId: string): number | undefined {
    return readState().revokedBefore[userId];
  },
  revokeSessions(userId: string, before: number) {
    update((s) => ({ revokedBefore: { ...s.revokedBefore, [userId]: before } }));
  },
  getRecovery(key: string): RecoveryState {
    return readState().recovery[key] ?? { failedCount: 0, sentAt: [] };
  },
  setRecovery(key: string, recovery: RecoveryState | null) {
    update((s) => {
      const next = { ...s.recovery };
      if (recovery) next[key] = recovery;
      else delete next[key];
      return { recovery: next };
    });
  },
  findRecoveryByToken(token: string): [string, RecoveryState] | undefined {
    return Object.entries(readState().recovery).find(([, r]) => r.resetToken === token);
  },
  /** Lỗi/sự kiện giả lập với khóa này đã xảy ra chưa. */
  hasTaken(key: string): boolean {
    return Boolean(readState().simulatedOnce[key]);
  },
  /** Trả về true đúng một lần cho mỗi khóa – dùng cho lỗi giả lập chỉ xảy ra lần đầu. */
  takeOnce(key: string): boolean {
    if (readState().simulatedOnce[key]) return false;
    update((s) => ({ simulatedOnce: { ...s.simulatedOnce, [key]: true } }));
    return true;
  },
  getStoredCustomers(): Customer[] {
    return readState().customers;
  },
  getCustomerCodeByRequest(idempotencyKey: string): string | undefined {
    return readState().customerRequests[idempotencyKey];
  },
  /**
   * Lưu hồ sơ (kèm lịch sử trong hồ sơ) và khóa yêu cầu trong một lần ghi – tương ứng một giao dịch ở BE.
   * Không có `idempotencyKey` khi ghi do giả lập người dùng khác.
   */
  saveCustomer(customer: Customer, idempotencyKey?: string) {
    update((s) => ({
      customers: [...s.customers.filter((c) => c.code !== customer.code), customer],
      customerRequests: idempotencyKey
        ? { ...s.customerRequests, [idempotencyKey]: customer.code }
        : s.customerRequests,
    }));
  },
  getStoredAreas(): Area[] {
    return readState().areas;
  },
  getAreaCodeByRequest(idempotencyKey: string): string | undefined {
    return readState().areaRequests[idempotencyKey];
  },
  /**
   * Lưu một hoặc nhiều khu vực (khu vực được tạo/sửa cùng các phân khu con được đồng bộ đường dẫn) và khóa yêu cầu
   * trong một lần ghi – tương ứng một giao dịch ở BE.
   */
  saveAreas(areas: Area[], request?: { idempotencyKey: string; code: string }) {
    // Theo AreaId: đổi mã khu vực (04.8) thay đúng bản ghi cũ, không tạo bản thứ hai.
    const ids = new Set(areas.map((a) => a.id));
    update((s) => ({
      areas: [...s.areas.filter((a) => !ids.has(a.id)), ...areas],
      areaRequests: request ? { ...s.areaRequests, [request.idempotencyKey]: request.code } : s.areaRequests,
    }));
  },
  getAreaRecordOverride(areaId: string): { services?: AreaService[]; staff?: AreaStaff[] } {
    return readState().areaRecordOverrides[areaId] ?? {};
  },
  /** Lưu danh sách dịch vụ/nhân sự mới cùng hồ sơ khu vực (mục lịch sử) trong một lần ghi. */
  saveAreaRecords(areaId: string, patch: { services?: AreaService[]; staff?: AreaStaff[] }, area?: Area) {
    update((s) => ({
      areaRecordOverrides: { ...s.areaRecordOverrides, [areaId]: { ...s.areaRecordOverrides[areaId], ...patch } },
      areas: area ? [...s.areas.filter((a) => a.id !== area.id), area] : s.areas,
    }));
  },
  getStoredContracts(): Contract[] {
    return readState().contracts;
  },
  getContractCodeByRequest(idempotencyKey: string): string | undefined {
    return readState().contractRequests[idempotencyKey];
  },
  /** Lưu hồ sơ và khóa yêu cầu trong cùng một lần ghi giả lập. */
  saveContract(contract: Contract, idempotencyKey?: string) {
    update((s) => ({
      contracts: [...s.contracts.filter((item) => item.code !== contract.code), contract],
      contractRequests: idempotencyKey
        ? { ...s.contractRequests, [idempotencyKey]: contract.code }
        : s.contractRequests,
    }));
  },
  audit(event: Omit<AuditEvent, 'at'>) {
    update((s) => ({ audit: [{ ...event, at: new Date().toISOString() }, ...s.audit].slice(0, MAX_AUDIT_EVENTS) }));
  },
};
