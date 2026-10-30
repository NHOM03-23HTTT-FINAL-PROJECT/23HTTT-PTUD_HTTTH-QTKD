import type { DepartmentCode, RoleCode } from '@/constants/roles';

export type AuthUser = {
  id: string;
  username: string;
  email: string;
  fullName: string;
  department: DepartmentCode;
  roles: RoleCode[];
  /** Đăng nhập bằng mật khẩu tạm: phiên chỉ được vào màn đổi mật khẩu bắt buộc (UC-CHUNG-01 A2). */
  mustChangePassword: boolean;
};

/** Lần đăng nhập trước, hiển thị trong toast "Đăng nhập thành công". */
export type LoginTrace = {
  at: string;
  client: string;
};

export type LoginRequest = {
  identifier: string;
  password: string;
};

export type LoginSuccess = {
  user: AuthUser;
  signedInAt: string;
  previousLogin: LoginTrace | null;
};

/** Kết quả kiểm tra phiên ở mỗi request (UC-CHUNG-03 A3). */
export type SessionCheck =
  | { status: 'active'; user: AuthUser }
  | { status: 'password-changed' | 'locked' | 'disabled' | 'no-role' };

export type ChangePasswordRequest = {
  userId: string;
  signedInAt: string;
  currentPassword: string;
  newPassword: string;
};

export type ChangePasswordResult = {
  /** Token mới cấp lại cho phiên hiện tại; các phiên khác bị thu hồi. */
  signedInAt: string;
  passwordChangedAt: string;
};

export type ChangePasswordErrorCode =
  | 'WRONG_CURRENT' // E2
  | 'LOCKED' // E2 – lần sai thứ 5 (04.7)
  | 'WEAK_PASSWORD' // E3
  | 'SAME_AS_CURRENT' // E3
  | 'SAVE_FAILED' // E4
  | 'SESSION_ENDED';

export class ChangePasswordError extends Error {
  readonly code: ChangePasswordErrorCode;
  readonly remainingAttempts?: number;

  constructor(code: ChangePasswordErrorCode, remainingAttempts?: number) {
    super(code);
    this.name = 'ChangePasswordError';
    this.code = code;
    this.remainingAttempts = remainingAttempts;
  }
}

export type LoginErrorCode =
  | 'INVALID_CREDENTIALS' // E2 / E2.1
  | 'LOCKED' // E2.2 / E3
  | 'DISABLED' // E4
  | 'NO_ROLE' // E5
  | 'SYSTEM_ERROR'; // E6

export class LoginError extends Error {
  readonly code: LoginErrorCode;
  readonly remainingAttempts?: number;
  readonly lockedUntil?: number;

  constructor(code: LoginErrorCode, extra: { remainingAttempts?: number; lockedUntil?: number } = {}) {
    super(code);
    this.name = 'LoginError';
    this.code = code;
    this.remainingAttempts = extra.remainingAttempts;
    this.lockedUntil = extra.lockedUntil;
  }
}
