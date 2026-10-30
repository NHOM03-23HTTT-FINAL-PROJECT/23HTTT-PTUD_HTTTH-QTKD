/** Kết quả gửi mã OTP – giống nhau dù tài khoản có tồn tại hay không. */
export type OtpDispatch = {
  expiresAt: number;
  resendAvailableAt: number;
  /** Chỉ có trong prototype: mã đã "gửi" để hiển thị hộp thư giả lập. */
  devCode?: string;
};

export type VerifyResult = {
  resetToken: string;
  /** Định danh hiển thị ở bước 3 ("Thiết lập mật khẩu mới cho tài khoản …"). */
  accountLabel: string;
};

export type ResetPasswordRequest = {
  resetToken: string;
  newPassword: string;
};

export type ResetResult = {
  identifier: string;
};

export type RecoveryErrorCode =
  | 'SUSPENDED' // E6 / E7
  | 'EMAIL_FAILED' // E3
  | 'EXPIRED' // E5
  | 'INVALID_CODE' // E4
  | 'WEAK_PASSWORD' // E8
  | 'SAME_AS_CURRENT' // E8
  | 'SAVE_FAILED' // E9
  | 'TOKEN_EXPIRED';

export class RecoveryError extends Error {
  readonly code: RecoveryErrorCode;
  readonly remainingAttempts?: number;
  readonly until?: number;

  constructor(code: RecoveryErrorCode, extra: { remainingAttempts?: number; until?: number } = {}) {
    super(code);
    this.name = 'RecoveryError';
    this.code = code;
    this.remainingAttempts = extra.remainingAttempts;
    this.until = extra.until;
  }
}
