import { meetsPolicy } from '@/features/auth/utils/passwordPolicy';
import {
  RecoveryError,
  type OtpDispatch,
  type ResetPasswordRequest,
  type ResetResult,
  type VerifyResult,
} from '@/features/auth/types/passwordRecovery';
import { currentPassword, findAccount, normalizeIdentifier } from './authServer';
import { mockStore, type RecoveryState } from './mockStore';

/** Tham số theo ghi chú UC-CHUNG-02 trên Figma. */
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_FAILED = 5;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_RESENDS = 3;
export const SEND_WINDOW_MS = 15 * 60 * 1000;
export const SUSPEND_MS = 15 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;

function randomDigits(length: number) {
  const values = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(values, (v) => String(v % 10)).join('');
}

function recoveryKey(identifier: string) {
  return findAccount(identifier)?.username ?? normalizeIdentifier(identifier);
}

function assertNotSuspended(state: RecoveryState, now: number) {
  if (state.suspendedUntil && state.suspendedUntil > now) {
    throw new RecoveryError('SUSPENDED', { until: state.suspendedUntil });
  }
}

function suspend(key: string, now: number, reason: string): never {
  const until = now + SUSPEND_MS;
  mockStore.setRecovery(key, { failedCount: 0, sentAt: [], suspendedUntil: until });
  mockStore.audit({ action: 'RECOVERY_SUSPENDED', username: key, detail: reason });
  throw new RecoveryError('SUSPENDED', { until });
}

/**
 * Bước 5–7: tạo OTP mới, vô hiệu hóa mã cũ, gửi email. Kết quả trả về giống nhau dù tài khoản
 * có tồn tại hay không (E2); chỉ khi thật sự gửi mới có `devCode` để hiển thị hộp thư giả lập.
 */
export function mockSendOtp(identifier: string): OtpDispatch {
  const key = recoveryKey(identifier);
  const account = findAccount(identifier);
  const now = Date.now();
  const previous = mockStore.getRecovery(key);
  assertNotSuspended(previous, now);

  const recentSends = previous.sentAt.filter((t) => now - t < SEND_WINDOW_MS);
  const lastSentAt = recentSends[recentSends.length - 1];

  // Gửi lại trong 60 giây: giữ mã đang hiệu lực thay vì tạo mã mới.
  if (lastSentAt && now - lastSentAt < RESEND_COOLDOWN_MS && previous.expiresAt && previous.expiresAt > now) {
    return { expiresAt: previous.expiresAt, resendAvailableAt: lastSentAt + RESEND_COOLDOWN_MS, devCode: previous.code };
  }

  // E7: gửi lại quá 3 lần trong 15 phút.
  if (recentSends.length > MAX_RESENDS) suspend(key, now, 'Gửi lại mã quá 3 lần trong 15 phút');

  const sentAt = [...recentSends, now];
  const canReceive = Boolean(account && account.status === 'active');

  // E3: dịch vụ email lỗi (giả lập ở lần gửi đầu của tài khoản kiểm thử) – mã cũ bị vô hiệu hóa.
  if (account?.simulateSystemError && mockStore.takeOnce(`email:${account.username}`)) {
    mockStore.setRecovery(key, { failedCount: 0, sentAt });
    mockStore.audit({ action: 'OTP_FAILED', username: key, detail: 'Dịch vụ email lỗi, chưa gửi được mã' });
    throw new RecoveryError('EMAIL_FAILED');
  }

  const code = canReceive ? randomDigits(6) : undefined;
  const expiresAt = now + OTP_TTL_MS;
  mockStore.setRecovery(key, { code, expiresAt, failedCount: 0, sentAt });
  mockStore.audit({
    action: 'OTP_SENT',
    username: key,
    detail: canReceive ? 'Đã gửi mã xác thực' : 'Không gửi mã (tài khoản không tồn tại hoặc vô hiệu hóa)',
  });
  return { expiresAt, resendAvailableAt: now + RESEND_COOLDOWN_MS, devCode: code };
}

/** Bước 8: kiểm tra OTP; đúng thì phát token đặt lại ngắn hạn. */
export function mockVerifyOtp(identifier: string, code: string): VerifyResult {
  const key = recoveryKey(identifier);
  const now = Date.now();
  const state = mockStore.getRecovery(key);
  assertNotSuspended(state, now);

  // E5: mã quá 5 phút.
  if (!state.expiresAt || state.expiresAt <= now) throw new RecoveryError('EXPIRED');

  if (!state.code || state.code !== code) {
    const failedCount = state.failedCount + 1;
    // E6: sai quá 5 lần.
    if (failedCount >= OTP_MAX_FAILED) suspend(key, now, 'Nhập sai mã xác thực 5 lần');
    mockStore.setRecovery(key, { ...state, failedCount });
    throw new RecoveryError('INVALID_CODE', { remainingAttempts: OTP_MAX_FAILED - failedCount });
  }

  const account = findAccount(identifier)!;
  const resetToken = crypto.randomUUID();
  mockStore.setRecovery(key, {
    failedCount: 0,
    sentAt: state.sentAt,
    resetToken,
    resetTokenExpiresAt: now + RESET_TOKEN_TTL_MS,
  });
  return { resetToken, accountLabel: account.email };
}

/**
 * Bước 11–13: kiểm tra chính sách, lưu mật khẩu mới, vô hiệu hóa OTP, thu hồi mọi phiên và mở khóa
 * đăng nhập. Lỗi khi lưu (E9) hoàn tác toàn bộ: không đổi gì và token vẫn dùng lại được.
 */
export function mockResetPassword({ resetToken, newPassword }: ResetPasswordRequest): ResetResult {
  const now = Date.now();
  const entry = mockStore.findRecoveryByToken(resetToken);
  if (!entry || !entry[1].resetTokenExpiresAt || entry[1].resetTokenExpiresAt <= now) {
    throw new RecoveryError('TOKEN_EXPIRED');
  }
  const [key] = entry;
  const account = findAccount(key)!;

  if (!meetsPolicy(newPassword)) throw new RecoveryError('WEAK_PASSWORD');
  if (newPassword === currentPassword(account)) throw new RecoveryError('SAME_AS_CURRENT');

  if (account.simulateSystemError && mockStore.takeOnce(`reset:${account.username}`)) {
    mockStore.audit({ action: 'PASSWORD_RESET_ERROR', username: key, detail: 'Lỗi khi lưu, đã hoàn tác' });
    throw new RecoveryError('SAVE_FAILED');
  }

  mockStore.setPassword(account.id, newPassword, new Date(now).toISOString());
  mockStore.setRecovery(key, null);
  mockStore.setAttempt(account.username, { failedCount: 0 });
  mockStore.revokeSessions(account.id, now);
  mockStore.audit({ action: 'PASSWORD_RESET', username: key, detail: 'Đặt lại mật khẩu qua OTP' });
  return { identifier: account.username };
}
