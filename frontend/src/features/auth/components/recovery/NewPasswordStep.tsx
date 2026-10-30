import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { InputField } from '@/components/form/InputField';
import { Icon } from '@/components/icon/Icon';
import { ROUTES } from '@/constants/routes';
import { meetsPolicy } from '../../utils/passwordPolicy';
import { PasswordPolicy, PasswordStrength } from '../PasswordRules';

type NewPasswordStepProps = {
  busy: boolean;
  /** Server báo trùng mật khẩu hiện tại (E8). */
  sameAsCurrent: boolean;
  /** Lỗi khi lưu (E9) – mật khẩu cũ vẫn giữ nguyên. */
  saveFailed: boolean;
  onPasswordEdited: () => void;
  onSubmit: (password: string) => void;
};

type FieldErrors = { password?: string; confirm?: string };

const POLICY_ERROR = 'Mật khẩu chưa đạt chính sách – xem các tiêu chí bên dưới.';

/** Bước 3 – Mật khẩu mới (frame 02.8 → 02.10). */
export function NewPasswordStep({ busy, sameAsCurrent, saveFailed, onPasswordEdited, onSubmit }: NewPasswordStepProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    passwordRef.current?.focus();
  }, []);

  useEffect(() => {
    if (sameAsCurrent) {
      setErrors((e) => ({ ...e, password: POLICY_ERROR }));
      passwordRef.current?.focus();
    }
  }, [sameAsCurrent]);

  // Kiểm tra hai trường khớp nhau theo thời gian thực khi đã nhập đủ độ dài.
  const confirmReady = confirm.length > 0 && confirm.length >= password.length;
  const confirmMatches = confirmReady && confirm === password;
  const confirmError = errors.confirm ?? (confirmReady && !confirmMatches ? 'Mật khẩu xác nhận không khớp.' : undefined);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    // E8: chỉ rõ từng lỗi, không gửi yêu cầu khi chưa hợp lệ.
    const next: FieldErrors = {
      password: !password ? 'Vui lòng nhập mật khẩu mới.' : !meetsPolicy(password) ? POLICY_ERROR : undefined,
      confirm: !confirm
        ? 'Vui lòng nhập lại mật khẩu mới.'
        : confirm !== password
          ? 'Mật khẩu xác nhận không khớp.'
          : undefined,
    };
    setErrors(next);
    if (next.password || next.confirm) {
      if (next.password) passwordRef.current?.focus();
      return;
    }
    onSubmit(password);
  }

  function toggle(visible: boolean, setVisible: (v: boolean) => void, label: string) {
    return (
      <button
        type="button"
        className="field__trailing"
        onClick={() => setVisible(!visible)}
        disabled={busy}
        aria-label={visible ? `Ẩn ${label}` : `Hiện ${label}`}
        aria-pressed={visible}
      >
        <Icon name={visible ? 'eye-off' : 'eye'} />
      </button>
    );
  }

  return (
    <form className="recovery-step" noValidate onSubmit={handleSubmit} aria-busy={busy}>
      {saveFailed && (
        <Alert tone="danger" title="Không thể đặt lại mật khẩu, vui lòng thử lại.">
          Mật khẩu cũ vẫn được giữ nguyên; chưa có phiên nào bị thu hồi.
        </Alert>
      )}

      <InputField
        ref={passwordRef}
        label="Mật khẩu mới"
        required
        icon="lock"
        name="new-password"
        type={showPassword ? 'text' : 'password'}
        autoComplete="new-password"
        placeholder="Nhập mật khẩu mới"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setErrors((er) => ({ ...er, password: undefined }));
          onPasswordEdited();
        }}
        error={errors.password}
        disabled={busy}
        trailing={toggle(showPassword, setShowPassword, 'mật khẩu mới')}
      />

      <PasswordStrength password={password} />
      <PasswordPolicy
        password={password}
        notCurrent={{ label: 'Không trùng mật khẩu hiện tại', state: sameAsCurrent ? 'fail' : 'pending' }}
      />

      <InputField
        label="Xác nhận mật khẩu mới"
        required
        icon="lock"
        name="confirm-password"
        type={showConfirm ? 'text' : 'password'}
        autoComplete="new-password"
        placeholder="Nhập lại mật khẩu mới"
        value={confirm}
        onChange={(e) => {
          setConfirm(e.target.value);
          setErrors((er) => ({ ...er, confirm: undefined }));
        }}
        error={confirmError}
        success={confirmMatches ? 'Mật khẩu xác nhận đã khớp.' : undefined}
        disabled={busy}
        trailing={toggle(showConfirm, setShowConfirm, 'mật khẩu xác nhận')}
      />

      <Button type="submit" block disabled={busy} className={busy ? 'recovery-busy' : undefined}>
        {busy ? 'Đang lưu…' : 'Đặt lại mật khẩu'}
      </Button>
      <div className="recovery-links">
        <Link to={ROUTES.login} className="recovery-links__primary">
          ← Quay lại đăng nhập
        </Link>
      </div>
    </form>
  );
}
