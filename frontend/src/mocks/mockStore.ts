import type { LoginTrace } from '@/features/auth/types/auth';
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
    | 'PASSWORD_CHANGE_ERROR';
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
  /** Trả về true đúng một lần cho mỗi khóa – dùng cho lỗi giả lập chỉ xảy ra lần đầu. */
  takeOnce(key: string): boolean {
    if (readState().simulatedOnce[key]) return false;
    update((s) => ({ simulatedOnce: { ...s.simulatedOnce, [key]: true } }));
    return true;
  },
  audit(event: Omit<AuditEvent, 'at'>) {
    update((s) => ({ audit: [{ ...event, at: new Date().toISOString() }, ...s.audit].slice(0, MAX_AUDIT_EVENTS) }));
  },
};
