import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Alert } from '@/components/feedback/Alert';
import { ROUTES } from '@/constants/routes';
import { useNow } from '@/hooks/useNow';
import { AuthLayout } from '@/layouts/AuthLayout';
import { passwordRecoveryApi } from '../api/passwordRecoveryApi';
import { AccountStep } from '../components/recovery/AccountStep';
import { NewPasswordStep } from '../components/recovery/NewPasswordStep';
import { OtpStep, type OtpStatus } from '../components/recovery/OtpStep';
import { RecoveryStepper } from '../components/RecoveryStepper';
import { RecoveryError, type OtpDispatch } from '../types/passwordRecovery';
import './ForgotPasswordPage.css';

type Flow =
  | { step: 'account' }
  | { step: 'otp'; dispatch: OtpDispatch | null; status: OtpStatus }
  | { step: 'password'; resetToken: string; accountLabel: string };

/** State gửi sang trang đăng nhập sau khi đặt lại thành công (frame 02.11). */
export type PasswordResetState = { passwordReset?: boolean; identifier?: string };

const STEP_INDEX = { account: 0, otp: 1, password: 2 } as const;

function subtitle(flow: Flow) {
  if (flow.step === 'account') {
    return 'Nhập tên đăng nhập hoặc email công ty. Mã xác thực sẽ được gửi đến email công ty đã đăng ký.';
  }
  if (flow.step === 'otp') return 'Nhập mã 6 chữ số vừa được gửi đến email công ty của bạn.';
  return `Thiết lập mật khẩu mới cho tài khoản ${flow.accountLabel}.`;
}

/** Ánh xạ lỗi khi gửi mã sang trạng thái bước 2 (E3, E6/E7). */
function statusFromSendError(error: unknown): OtpStatus {
  if (error instanceof RecoveryError && error.code === 'SUSPENDED' && error.until) {
    return { kind: 'suspended', until: error.until };
  }
  return { kind: 'email-failed' };
}

/** UC-CHUNG-02 · Quên mật khẩu – 3 bước có chỉ báo tiến trình (frame 02.1 → 02.11). */
export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = (location.state as { identifier?: string } | null)?.identifier ?? '';

  const [identifier, setIdentifier] = useState(prefill);
  const [flow, setFlow] = useState<Flow>({ step: 'account' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [sameAsCurrent, setSameAsCurrent] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const now = useNow(flow.step === 'otp' ? 1000 : null, flow);

  async function sendCode() {
    setBusy(true);
    setSessionExpired(false);
    setCode('');
    try {
      const dispatch = await passwordRecoveryApi.sendOtp(identifier);
      setFlow({ step: 'otp', dispatch, status: { kind: 'sent' } });
    } catch (error) {
      setFlow({ step: 'otp', dispatch: null, status: statusFromSendError(error) });
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (flow.step !== 'otp') return;
    setBusy(true);
    try {
      const result = await passwordRecoveryApi.verifyOtp(identifier, code);
      setSameAsCurrent(false);
      setSaveFailed(false);
      setFlow({ step: 'password', resetToken: result.resetToken, accountLabel: result.accountLabel });
    } catch (error) {
      setCode('');
      if (error instanceof RecoveryError && error.code === 'INVALID_CODE') {
        setFlow({ ...flow, status: { kind: 'invalid', remainingAttempts: error.remainingAttempts ?? 0 } });
      } else if (error instanceof RecoveryError && error.code === 'EXPIRED' && flow.dispatch) {
        setFlow({ ...flow, dispatch: { ...flow.dispatch, expiresAt: Date.now() } });
      } else {
        setFlow({ ...flow, status: statusFromSendError(error) });
      }
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(newPassword: string) {
    if (flow.step !== 'password') return;
    setBusy(true);
    setSaveFailed(false);
    try {
      const result = await passwordRecoveryApi.resetPassword({ resetToken: flow.resetToken, newPassword });
      const state: PasswordResetState = { passwordReset: true, identifier: result.identifier };
      navigate(ROUTES.login, { replace: true, state });
    } catch (error) {
      const codeOf = error instanceof RecoveryError ? error.code : 'SAVE_FAILED';
      if (codeOf === 'SAME_AS_CURRENT' || codeOf === 'WEAK_PASSWORD') {
        setSameAsCurrent(codeOf === 'SAME_AS_CURRENT');
      } else if (codeOf === 'TOKEN_EXPIRED') {
        setSessionExpired(true);
        setFlow({ step: 'account' });
      } else {
        setSaveFailed(true);
      }
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <div className="auth-form">
        <div className="auth-form__heading">
          <h2 className="auth-form__title">Quên mật khẩu</h2>
          <p className="auth-form__subtitle">{subtitle(flow)}</p>
        </div>
        <RecoveryStepper current={STEP_INDEX[flow.step]} />

        {flow.step === 'account' && (
          <>
            {sessionExpired && (
              <Alert tone="warning" title="Phiên đặt lại mật khẩu đã hết hạn">
                Vui lòng nhập lại tài khoản để nhận mã xác thực mới.
              </Alert>
            )}
            <AccountStep identifier={identifier} onIdentifierChange={setIdentifier} onSubmit={sendCode} busy={busy} />
          </>
        )}

        {flow.step === 'otp' && (
          <OtpStep
            dispatch={flow.dispatch}
            status={flow.status}
            code={code}
            onCodeChange={setCode}
            now={now}
            busy={busy}
            onVerify={verifyCode}
            onResend={sendCode}
            onBack={() => setFlow({ step: 'account' })}
          />
        )}

        {flow.step === 'password' && (
          <NewPasswordStep
            busy={busy}
            sameAsCurrent={sameAsCurrent}
            saveFailed={saveFailed}
            onPasswordEdited={() => setSameAsCurrent(false)}
            onSubmit={resetPassword}
          />
        )}
      </div>
    </AuthLayout>
  );
}
