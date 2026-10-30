import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { Button } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { useToast } from '@/components/feedback/Toast';
import { InputField } from '@/components/form/InputField';
import { Icon } from '@/components/icon/Icon';
import { describePath } from '@/constants/navigation';
import { describeRecord, REDIRECT_PARAM, ROUTES, safeRedirect } from '@/constants/routes';
import { useNow } from '@/hooks/useNow';
import { AuthLayout } from '@/layouts/AuthLayout';
import { signOutNotice, type SignOutNotice } from '@/lib/auth/signOutNotice';
import { formatCountdown, formatDateTime } from '@/utils/format';
import { LoginError, type LoginErrorCode, type LoginSuccess } from '../types/auth';
import { RememberCheckbox } from '../components/RememberCheckbox';
import type { PasswordResetState } from './ForgotPasswordPage';
import './LoginPage.css';

type FieldErrors = { identifier?: string; password?: string };

type Failure = {
  code: LoginErrorCode;
  remainingAttempts?: number;
  lockedUntil?: number;
};

function successDescription({ previousLogin }: LoginSuccess) {
  if (!previousLogin) return 'Đây là lần đăng nhập đầu tiên của bạn.';
  return `Lần đăng nhập trước: ${formatDateTime(previousLogin.at)} · ${previousLogin.client}`;
}

/** UC-CHUNG-01 · Đăng nhập – các trạng thái 01.0 → 01.8 trên Figma. */
export function LoginPage() {
  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = safeRedirect(searchParams.get(REDIRECT_PARAM));
  const resetState = useLocation().state as PasswordResetState | null;
  // Lý do phiên trước kết thúc (03.3 → 03.5): đọc một lần, xóa sau khi hiển thị.
  const [notice] = useState(() => signOutNotice.peek());

  const [identifier, setIdentifier] = useState(resetState?.identifier ?? notice?.identifier ?? '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const identifierRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const lockedUntil = failure?.code === 'LOCKED' ? failure.lockedUntil : undefined;
  const now = useNow(lockedUntil ? 1000 : null, lockedUntil);
  const isLocked = Boolean(lockedUntil && lockedUntil > now);

  // Hết thời gian khóa: bỏ thông báo, cho phép đăng nhập lại.
  useEffect(() => {
    if (lockedUntil && lockedUntil <= now) setFailure(null);
  }, [lockedUntil, now]);

  useEffect(() => {
    signOutNotice.clear();
    (identifierRef.current?.value ? passwordRef : identifierRef).current?.focus();
  }, []);

  function handleIdentifierChange(value: string) {
    setIdentifier(value);
    setFieldErrors((errors) => ({ ...errors, identifier: undefined }));
    // Thông báo trước đó gắn với tài khoản cũ; đổi tài khoản thì bỏ.
    setFailure(null);
  }

  function handlePasswordChange(value: string) {
    setPassword(value);
    setFieldErrors((errors) => ({ ...errors, password: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || isLocked) return;

    // E1: báo lỗi tại từng trường còn trống, không gửi yêu cầu.
    const errors: FieldErrors = {};
    if (!identifier.trim()) errors.identifier = 'Vui lòng nhập tên đăng nhập hoặc email công ty.';
    if (!password) errors.password = 'Vui lòng nhập mật khẩu.';
    if (errors.identifier || errors.password) {
      setFieldErrors(errors);
      setFailure(null);
      (errors.identifier ? identifierRef : passwordRef).current?.focus();
      return;
    }

    setSubmitting(true);
    setFailure(null);
    try {
      const result = await login({ identifier, password, remember });
      showToast({ title: 'Đăng nhập thành công', description: successDescription(result) });
      navigate(redirect ?? ROUTES.dashboard, { replace: true });
    } catch (error) {
      const failureState: Failure =
        error instanceof LoginError
          ? { code: error.code, remainingAttempts: error.remainingAttempts, lockedUntil: error.lockedUntil }
          : { code: 'SYSTEM_ERROR' };
      setFailure(failureState);
      // E6 giữ nguyên dữ liệu đã nhập; các trường hợp còn lại xóa ô mật khẩu để nhập lại.
      if (failureState.code !== 'SYSTEM_ERROR') setPassword('');
      setSubmitting(false);
      if (failureState.code === 'INVALID_CREDENTIALS') {
        window.setTimeout(() => passwordRef.current?.focus());
      }
    }
  }

  const fieldsDisabled = submitting;

  return (
    <AuthLayout>
      <form className="auth-form" noValidate onSubmit={handleSubmit} aria-busy={submitting}>
        <div className="auth-form__heading">
          <h2 className="auth-form__title">Đăng nhập</h2>
          <p className="auth-form__subtitle">Dùng tài khoản nội bộ do Quản trị hệ thống cấp.</p>
        </div>

        {failure ? (
          <FailureAlert failure={failure} />
        ) : resetState?.passwordReset ? (
          <Alert tone="success" title="Đặt lại mật khẩu thành công">
            Vui lòng đăng nhập bằng mật khẩu mới. Các phiên đăng nhập cũ đã bị đăng xuất; tài khoản đang tạm khóa (nếu
            có) đã được mở khóa.
          </Alert>
        ) : notice ? (
          <SignOutAlert notice={notice} redirect={redirect} />
        ) : (
          redirect && <RedirectNotice redirect={redirect} />
        )}

        <InputField
          ref={identifierRef}
          label="Tên đăng nhập hoặc email công ty"
          required
          icon="user"
          name="username"
          autoComplete="username"
          placeholder="Nhập tên đăng nhập hoặc email công ty"
          value={identifier}
          onChange={(e) => handleIdentifierChange(e.target.value)}
          error={fieldErrors.identifier}
          disabled={fieldsDisabled}
        />

        <InputField
          ref={passwordRef}
          label="Mật khẩu"
          required
          icon="lock"
          name="password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          placeholder="Nhập mật khẩu"
          value={password}
          onChange={(e) => handlePasswordChange(e.target.value)}
          error={fieldErrors.password}
          disabled={fieldsDisabled || isLocked}
          trailing={
            <button
              type="button"
              className="field__trailing"
              onClick={() => setShowPassword((v) => !v)}
              disabled={fieldsDisabled}
              aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              aria-pressed={showPassword}
            >
              <Icon name={showPassword ? 'eye-off' : 'eye'} />
            </button>
          }
        />

        <div className="login-options">
          <RememberCheckbox checked={remember} onChange={setRemember} disabled={fieldsDisabled} />
          <Link to={ROUTES.forgotPassword} state={{ identifier: identifier.trim() }} className="login-options__forgot">
            Quên mật khẩu?
          </Link>
        </div>

        {isLocked && lockedUntil && (
          <div className="login-countdown" role="timer" aria-live="off">
            <Icon name="clock" />
            <p>
              Có thể đăng nhập lại sau {formatCountdown(lockedUntil - now)} · hoặc dùng "Quên mật khẩu?" để mở khóa
            </p>
          </div>
        )}

        <Button
          type="submit"
          block
          disabled={submitting || isLocked}
          className={submitting ? 'login-submit login-submit--busy' : isLocked ? 'login-submit login-submit--locked' : 'login-submit'}
        >
          {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </Button>

        <p className="auth-form__footnote">
          Chưa có tài khoản? Liên hệ Quản trị hệ thống để được cấp tài khoản và phân quyền.
        </p>
      </form>
    </AuthLayout>
  );
}

function FailureAlert({ failure }: { failure: Failure }) {
  switch (failure.code) {
    case 'INVALID_CREDENTIALS':
      return (
        <Alert tone="danger" title="Tên đăng nhập hoặc mật khẩu không chính xác">
          Bạn còn {failure.remainingAttempts} lần thử. Sau 5 lần sai liên tiếp, tài khoản sẽ bị tạm khóa 15 phút.
        </Alert>
      );
    case 'LOCKED':
      return (
        <Alert tone="warning" title="Tài khoản đã bị tạm khóa">
          Tài khoản đã bị tạm khóa do đăng nhập sai quá số lần cho phép. Vui lòng thử lại sau 15 phút hoặc liên hệ
          Quản trị hệ thống.
        </Alert>
      );
    case 'DISABLED':
      return (
        <Alert tone="danger" title="Không thể đăng nhập">
          Tài khoản đã bị vô hiệu hóa, vui lòng liên hệ Quản trị hệ thống.
        </Alert>
      );
    case 'NO_ROLE':
      return (
        <Alert tone="warning" title="Không thể đăng nhập">
          Tài khoản chưa được phân quyền, vui lòng liên hệ Quản trị hệ thống.
        </Alert>
      );
    case 'SYSTEM_ERROR':
      return (
        <Alert tone="danger" title="Chưa đăng nhập được">
          Hệ thống tạm thời không xử lý được yêu cầu đăng nhập, vui lòng thử lại sau.
        </Alert>
      );
  }
}

/** UC-CHUNG-03 · Thông báo khi phiên trước kết thúc (frame 03.3 → 03.5). */
function SignOutAlert({ notice, redirect }: { notice: SignOutNotice; redirect: string | null }) {
  switch (notice.reason) {
    case 'logout':
      return (
        <Alert tone="success" title="Bạn đã đăng xuất thành công">
          Phiên làm việc đã kết thúc trên thiết bị này.
        </Alert>
      );
    case 'expired':
      return (
        <Alert tone="info" title="Phiên làm việc đã hết hạn, vui lòng đăng nhập lại">
          Sau khi đăng nhập, bạn sẽ được đưa về trang đang làm: {describePath(redirect ?? ROUTES.dashboard)}.
        </Alert>
      );
    case 'password-changed':
      return (
        <Alert tone="warning" title="Phiên đăng nhập đã kết thúc">
          Mật khẩu tài khoản vừa được thay đổi. Vui lòng đăng nhập lại bằng mật khẩu mới. Nếu bạn không thực hiện thay
          đổi này, hãy liên hệ Quản trị hệ thống.
        </Alert>
      );
    case 'locked':
      return (
        <Alert tone="warning" title="Tài khoản đã bị tạm khóa">
          Bạn đã nhập sai mật khẩu hiện tại 5 lần liên tiếp nên đã bị đăng xuất. Vui lòng thử lại sau 15 phút hoặc
          dùng 'Quên mật khẩu?'.
        </Alert>
      );
    case 'disabled':
      return (
        <Alert tone="danger" title="Không thể đăng nhập">
          Tài khoản đã bị vô hiệu hóa, vui lòng liên hệ Quản trị hệ thống.
        </Alert>
      );
    case 'no-role':
      return (
        <Alert tone="warning" title="Không thể đăng nhập">
          Tài khoản chưa được phân quyền, vui lòng liên hệ Quản trị hệ thống.
        </Alert>
      );
  }
}

/** 01.0 · Mở đường dẫn cần xác thực khi chưa đăng nhập. */
function RedirectNotice({ redirect }: { redirect: string }) {
  const record = describeRecord(redirect);
  const fromEmail = new URLSearchParams(redirect.split('?')[1] ?? '').get('src') === 'email';

  return (
    <Alert tone="info" title="Vui lòng đăng nhập để tiếp tục">
      {record
        ? `Bạn đang mở hồ sơ ${record.code} ${fromEmail ? 'từ email thông báo' : 'từ đường dẫn'}. Sau khi đăng nhập, hệ thống sẽ đưa bạn đến đúng hồ sơ này.`
        : 'Sau khi đăng nhập, hệ thống sẽ đưa bạn đến đúng trang đã yêu cầu.'}
    </Alert>
  );
}
