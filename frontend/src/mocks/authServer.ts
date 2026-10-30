import {
  ChangePasswordError,
  LoginError,
  type AuthUser,
  type ChangePasswordRequest,
  type ChangePasswordResult,
  type LoginRequest,
  type LoginSuccess,
  type SessionCheck,
} from '@/features/auth/types/auth';
import { meetsPolicy } from '@/features/auth/utils/passwordPolicy';
import { describeClient } from '@/utils/client';
import { mockStore } from './mockStore';
import { SEED_ACCOUNTS, type SeedAccount } from './seed/users';

/** Chính sách khóa theo ghi chú màn 01.3/01.4: sai 5 lần liên tiếp → tạm khóa 15 phút. */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

export function normalizeIdentifier(identifier: string) {
  return identifier.trim().toLowerCase();
}

export function findAccount(identifier: string): SeedAccount | undefined {
  const key = normalizeIdentifier(identifier);
  return SEED_ACCOUNTS.find((a) => a.username === key || a.email === key);
}

/** Mật khẩu hiện tại: mật khẩu đã đặt lại (nếu có) hoặc mật khẩu mẫu. */
export function currentPassword(account: SeedAccount): string {
  return mockStore.getPassword(account.id) ?? account.password;
}

function toAuthUser(account: SeedAccount): AuthUser {
  const { id, username, email, fullName, department, roles } = account;
  // Mật khẩu tạm hết hiệu lực bắt buộc đổi khi người dùng đã tự đổi/đặt lại mật khẩu.
  const mustChangePassword = Boolean(account.mustChangePassword && !mockStore.getPasswordChangedAt(id));
  return { id, username, email, fullName, department, roles, mustChangePassword };
}

/**
 * Giả lập API đăng nhập theo các bước của UC-CHUNG-01.
 * Bộ đếm sai được tính theo định danh đã nhập, kể cả khi tài khoản không tồn tại,
 * để thông báo lỗi không tiết lộ tài khoản có tồn tại hay không (E2.1).
 */
export function mockLogin({ identifier, password }: LoginRequest): LoginSuccess {
  const account = findAccount(identifier);
  const attemptKey = account?.username ?? normalizeIdentifier(identifier);
  const attempt = mockStore.getAttempt(attemptKey);
  const now = Date.now();

  // E3: đang trong thời gian tạm khóa.
  if (attempt.lockedUntil && attempt.lockedUntil > now) {
    mockStore.audit({ action: 'LOGIN_REJECTED', username: attemptKey, detail: 'Tài khoản đang tạm khóa' });
    throw new LoginError('LOCKED', { lockedUntil: attempt.lockedUntil });
  }

  // Hết thời gian khóa thì bắt đầu đếm lại.
  const failedCount = attempt.lockedUntil ? 0 : attempt.failedCount;

  // E2 / E2.1 / E2.2: sai thông tin đăng nhập.
  if (!account || currentPassword(account) !== password) {
    const nextCount = failedCount + 1;
    if (nextCount >= MAX_FAILED_ATTEMPTS) {
      const lockedUntil = now + LOCK_DURATION_MS;
      mockStore.setAttempt(attemptKey, { failedCount: nextCount, lockedUntil });
      mockStore.audit({ action: 'LOGIN_REJECTED', username: attemptKey, detail: `Sai mật khẩu ${nextCount} lần, tạm khóa 15 phút` });
      throw new LoginError('LOCKED', { lockedUntil });
    }
    mockStore.setAttempt(attemptKey, { failedCount: nextCount });
    mockStore.audit({ action: 'LOGIN_FAILED', username: attemptKey, detail: `Sai thông tin đăng nhập lần ${nextCount}` });
    throw new LoginError('INVALID_CREDENTIALS', { remainingAttempts: MAX_FAILED_ATTEMPTS - nextCount });
  }

  // E4: tài khoản vô hiệu hóa.
  if (account.status === 'disabled') {
    mockStore.audit({ action: 'LOGIN_REJECTED', username: account.username, detail: 'Tài khoản vô hiệu hóa' });
    throw new LoginError('DISABLED');
  }

  // E5: đúng mật khẩu nhưng chưa được gán vai trò – không tạo phiên.
  if (account.roles.length === 0) {
    mockStore.audit({ action: 'LOGIN_REJECTED', username: account.username, detail: 'Tài khoản chưa được phân quyền' });
    throw new LoginError('NO_ROLE');
  }

  // E6: lỗi truy cập dữ liệu / thiết lập phiên – không phát hành phiên.
  if (account.simulateSystemError) {
    mockStore.audit({ action: 'LOGIN_ERROR', username: account.username, detail: 'Lỗi giả lập khi thiết lập phiên' });
    throw new LoginError('SYSTEM_ERROR');
  }

  const previousLogin = mockStore.getLastLogin(account.id);
  const signedInAt = new Date(now).toISOString();
  mockStore.setAttempt(account.username, { failedCount: 0 });
  mockStore.setLastLogin(account.id, { at: signedInAt, client: describeClient() });
  mockStore.audit({ action: 'LOGIN_SUCCESS', username: account.username, detail: 'Đăng nhập thành công' });

  return { user: toAuthUser(account), signedInAt, previousLogin };
}

/**
 * Kiểm tra phiên ở mỗi "request" (UC-CHUNG-03 A3): phiên bị thu hồi khi mật khẩu được đổi/đặt lại sau thời
 * điểm đăng nhập, khi tài khoản bị vô hiệu hóa hoặc bị gỡ hết vai trò.
 */
export function mockCheckSession(userId: string, signedInAt: string): SessionCheck {
  const account = SEED_ACCOUNTS.find((a) => a.id === userId);
  if (!account || account.status !== 'active') return { status: 'disabled' };
  if (account.roles.length === 0) return { status: 'no-role' };
  const revokedBefore = mockStore.getRevokedBefore(userId);
  if (revokedBefore && Date.parse(signedInAt) < revokedBefore) {
    // Bị thu hồi do tạm khóa (04.7) hay do mật khẩu được đổi/đặt lại (03.5).
    const lockedUntil = mockStore.getAttempt(account.username).lockedUntil;
    return { status: lockedUntil && lockedUntil > Date.now() ? 'locked' : 'password-changed' };
  }
  return { status: 'active', user: toAuthUser(account) };
}

/** Thông tin bảo mật hiển thị ở cột phụ màn đổi mật khẩu (04.1). */
export function mockGetPasswordChangedAt(userId: string): string | null {
  const account = SEED_ACCOUNTS.find((a) => a.id === userId);
  return mockStore.getPasswordChangedAt(userId) ?? account?.passwordChangedAt ?? null;
}

/**
 * UC-CHUNG-04 bước 4–8. Sai mật khẩu hiện tại dùng chung bộ đếm với đăng nhập: lần thứ 5 tạm khóa tài khoản
 * 15 phút và thu hồi mọi phiên (04.7). Thành công: lưu mật khẩu mới, gỡ cờ mật khẩu tạm, thu hồi các phiên khác
 * và cấp lại token (mốc đăng nhập mới) cho phiên hiện tại.
 */
export function mockChangePassword({
  userId,
  signedInAt,
  currentPassword: typedCurrent,
  newPassword,
}: ChangePasswordRequest): ChangePasswordResult {
  if (mockCheckSession(userId, signedInAt).status !== 'active') throw new ChangePasswordError('SESSION_ENDED');
  const account = SEED_ACCOUNTS.find((a) => a.id === userId)!;
  const now = Date.now();

  if (typedCurrent !== currentPassword(account)) {
    const attempt = mockStore.getAttempt(account.username);
    const failedCount = (attempt.lockedUntil ? 0 : attempt.failedCount) + 1;
    if (failedCount >= MAX_FAILED_ATTEMPTS) {
      mockStore.setAttempt(account.username, { failedCount, lockedUntil: now + LOCK_DURATION_MS });
      mockStore.revokeSessions(userId, now + 1);
      mockStore.audit({
        action: 'LOGIN_REJECTED',
        username: account.username,
        detail: 'Sai mật khẩu hiện tại 5 lần khi đổi mật khẩu, tạm khóa 15 phút',
      });
      throw new ChangePasswordError('LOCKED');
    }
    mockStore.setAttempt(account.username, { failedCount });
    mockStore.audit({ action: 'PASSWORD_CHANGE_FAILED', username: account.username, detail: `Sai mật khẩu hiện tại lần ${failedCount}` });
    throw new ChangePasswordError('WRONG_CURRENT', MAX_FAILED_ATTEMPTS - failedCount);
  }

  if (!meetsPolicy(newPassword)) throw new ChangePasswordError('WEAK_PASSWORD');
  if (newPassword === typedCurrent) throw new ChangePasswordError('SAME_AS_CURRENT');

  // E4: lỗi khi lưu – hoàn tác toàn bộ, giữ mật khẩu cũ và phiên hiện tại.
  if (account.simulateSaveError && mockStore.takeOnce(`change:${account.username}`)) {
    mockStore.audit({ action: 'PASSWORD_CHANGE_ERROR', username: account.username, detail: 'Lỗi khi lưu, đã hoàn tác' });
    throw new ChangePasswordError('SAVE_FAILED');
  }

  const changedAt = new Date(now).toISOString();
  mockStore.setPassword(userId, newPassword, changedAt);
  mockStore.setAttempt(account.username, { failedCount: 0 });
  mockStore.revokeSessions(userId, now);
  mockStore.audit({ action: 'PASSWORD_CHANGED', username: account.username, detail: 'Đổi mật khẩu, thu hồi các phiên khác' });
  return { signedInAt: changedAt, passwordChangedAt: changedAt };
}

/** Bước 3–5: vô hiệu hóa phiên phía server và ghi nhật ký. */
export function mockLogout(userId: string, reason: 'logout' | 'expired') {
  const account = SEED_ACCOUNTS.find((a) => a.id === userId);
  mockStore.audit({
    action: reason === 'logout' ? 'LOGOUT' : 'SESSION_EXPIRED',
    username: account?.username ?? userId,
    detail: reason === 'logout' ? 'Đăng xuất' : 'Hết phiên do không thao tác',
  });
}
