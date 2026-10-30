import { useEffect, useRef, type FormEvent } from 'react';
import { ButtonLink, Button } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { OtpInput, type OtpInputHandle } from '@/components/form/OtpInput';
import { Icon } from '@/components/icon/Icon';
import { ROUTES } from '@/constants/routes';
import { formatCountdown } from '@/utils/format';
import type { OtpDispatch } from '../../types/passwordRecovery';

export const OTP_LENGTH = 6;

export type OtpStatus =
  | { kind: 'sent' }
  | { kind: 'invalid'; remainingAttempts: number } // E4
  | { kind: 'email-failed' } // E3
  | { kind: 'suspended'; until: number }; // E6 / E7

type OtpStepProps = {
  dispatch: OtpDispatch | null;
  status: OtpStatus;
  code: string;
  onCodeChange: (code: string) => void;
  now: number;
  busy: boolean;
  onVerify: () => void;
  onResend: () => void;
  onBack: () => void;
};

/** Bước 2 – Nhập mã OTP (frame 02.3 → 02.7). */
export function OtpStep({ dispatch, status, code, onCodeChange, now, busy, onVerify, onResend, onBack }: OtpStepProps) {
  const otpRef = useRef<OtpInputHandle>(null);
  const suspended = status.kind === 'suspended';
  const emailFailed = status.kind === 'email-failed';
  // E5: mã quá 5 phút.
  const expired = !suspended && !emailFailed && Boolean(dispatch && dispatch.expiresAt <= now);
  const canEnter = !suspended && !emailFailed && !expired;
  const resendIn = dispatch ? Math.ceil((dispatch.resendAvailableAt - now) / 1000) : 0;

  useEffect(() => {
    if (canEnter && !busy) otpRef.current?.focus();
  }, [canEnter, busy, status]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!canEnter) {
      if (!suspended) onResend();
      return;
    }
    if (code.length === OTP_LENGTH) onVerify();
  }

  return (
    <form className="recovery-step" noValidate onSubmit={handleSubmit} aria-busy={busy}>
      <OtpStatusAlert status={status} expired={expired} />

      <OtpInput
        ref={otpRef}
        label="Mã xác thực (6 chữ số)"
        length={OTP_LENGTH}
        value={suspended || emailFailed ? '' : code}
        onChange={onCodeChange}
        disabled={!canEnter || busy}
      />

      {suspended ? (
        <div className="recovery-countdown">
          <Icon name="clock" />
          <p>Có thể thử lại sau {formatCountdown(status.until - now)}</p>
        </div>
      ) : (
        dispatch && (
          <div className="recovery-countdown">
            <Icon name="clock" />
            <p>{expired ? 'Mã đã hết hạn' : `Mã hết hạn sau ${formatCountdown(dispatch.expiresAt - now)}`}</p>
          </div>
        )
      )}

      {suspended ? (
        <ButtonLink to={ROUTES.login} block>
          Quay lại đăng nhập
        </ButtonLink>
      ) : canEnter ? (
        <Button
          type="submit"
          block
          disabled={busy || code.length < OTP_LENGTH}
          className={busy ? 'recovery-busy' : code.length < OTP_LENGTH ? 'recovery-incomplete' : undefined}
        >
          {busy ? 'Đang xác nhận…' : 'Xác nhận'}
        </Button>
      ) : (
        <Button type="submit" block disabled={busy} className={busy ? 'recovery-busy' : undefined}>
          {busy ? 'Đang gửi mã…' : 'Gửi lại mã'}
        </Button>
      )}

      {!suspended && (
        <div className="recovery-links">
          {/* A1: quay lại bước 1. */}
          <button type="button" className="recovery-links__primary" onClick={onBack} disabled={busy}>
            ← Quay lại
          </button>
          {canEnter &&
            (resendIn > 0 ? (
              <span className="recovery-links__muted">Gửi lại mã sau {resendIn} giây</span>
            ) : (
              <button type="button" className="recovery-links__action" onClick={onResend} disabled={busy}>
                Gửi lại mã
              </button>
            ))}
        </div>
      )}

      {canEnter && dispatch?.devCode && (
        <p className="recovery-mailbox">
          <strong>Hộp thư giả lập (chỉ có trong prototype):</strong> mã xác thực là{' '}
          <span className="recovery-mailbox__code">{dispatch.devCode}</span>
        </p>
      )}
    </form>
  );
}

function OtpStatusAlert({ status, expired }: { status: OtpStatus; expired: boolean }) {
  if (status.kind === 'suspended') {
    return (
      <Alert tone="danger" title="Tạm ngưng chức năng quên mật khẩu">
        Bạn đã nhập sai mã quá 5 lần hoặc yêu cầu gửi mã quá số lần cho phép, vui lòng thử lại sau 15 phút.
      </Alert>
    );
  }
  if (status.kind === 'email-failed') {
    return (
      <Alert tone="danger" title="Chưa gửi được mã xác thực, vui lòng thử lại">
        Dịch vụ gửi email tạm thời gián đoạn. Bạn có thể gửi lại mã ngay.
      </Alert>
    );
  }
  if (expired) {
    return (
      <Alert tone="warning" title="Mã xác thực đã hết hạn">
        Vui lòng gửi lại mã để nhận mã xác thực mới.
      </Alert>
    );
  }
  if (status.kind === 'invalid') {
    return (
      <Alert tone="danger" title="Mã xác thực không chính xác">
        Bạn còn {status.remainingAttempts} lần thử. Có thể nhập lại hoặc gửi lại mã mới.
      </Alert>
    );
  }
  return (
    <Alert tone="info" title="Nếu tài khoản tồn tại, mã xác thực đã được gửi đến email đăng ký">
      Mã gồm 6 chữ số, hiệu lực 5 phút. Vui lòng kiểm tra cả thư mục Spam.
    </Alert>
  );
}
