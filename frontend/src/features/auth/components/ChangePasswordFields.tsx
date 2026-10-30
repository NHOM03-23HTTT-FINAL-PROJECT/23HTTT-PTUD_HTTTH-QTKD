import { useState } from 'react';
import { Alert } from '@/components/feedback/Alert';
import { InputField } from '@/components/form/InputField';
import { Icon } from '@/components/icon/Icon';
import type { ChangePasswordAlert, PasswordField } from '../hooks/useChangePasswordForm';
import { PasswordPolicy, PasswordStrength } from './PasswordRules';

type ChangePasswordFieldsProps = {
  values: Record<PasswordField, string>;
  errors: Partial<Record<PasswordField, string>>;
  onChange: (field: PasswordField, value: string) => void;
  disabled: boolean;
  currentLabel: string;
  showPolicy: boolean;
};

/** Ba trường mật khẩu kèm độ mạnh và chính sách (frame 04.1, 04.6). */
export function ChangePasswordFields({ values, errors, onChange, disabled, currentLabel, showPolicy }: ChangePasswordFieldsProps) {
  const [visible, setVisible] = useState<Record<PasswordField, boolean>>({ current: false, next: false, confirm: false });

  function toggle(field: PasswordField, label: string) {
    const shown = visible[field];
    return (
      <button
        type="button"
        className="field__trailing"
        onClick={() => setVisible((v) => ({ ...v, [field]: !v[field] }))}
        disabled={disabled}
        aria-label={shown ? `Ẩn ${label}` : `Hiện ${label}`}
        aria-pressed={shown}
      >
        <Icon name={shown ? 'eye-off' : 'eye'} />
      </button>
    );
  }

  // Tiêu chí "Khác mật khẩu hiện tại" so được ngay vì người dùng đã nhập mật khẩu hiện tại.
  const notCurrentState = !values.next || !values.current ? 'pending' : values.next === values.current ? 'fail' : 'pass';
  const confirmReady = values.confirm.length > 0 && values.confirm.length >= values.next.length;
  const confirmMatches = confirmReady && values.confirm === values.next;
  const confirmError = errors.confirm ?? (confirmReady && !confirmMatches ? 'Mật khẩu xác nhận không khớp.' : undefined);

  return (
    <>
      <InputField
        label={currentLabel}
        required
        icon="lock"
        name="current-password"
        type={visible.current ? 'text' : 'password'}
        autoComplete="current-password"
        placeholder={`Nhập ${currentLabel.toLowerCase()}`}
        value={values.current}
        onChange={(e) => onChange('current', e.target.value)}
        error={errors.current}
        disabled={disabled}
        trailing={toggle('current', currentLabel.toLowerCase())}
      />
      <InputField
        label="Mật khẩu mới"
        required
        icon="lock"
        name="new-password"
        type={visible.next ? 'text' : 'password'}
        autoComplete="new-password"
        placeholder="Nhập mật khẩu mới"
        value={values.next}
        onChange={(e) => onChange('next', e.target.value)}
        error={errors.next}
        disabled={disabled}
        trailing={toggle('next', 'mật khẩu mới')}
      />
      <PasswordStrength password={values.next} />
      {showPolicy && (
        <PasswordPolicy password={values.next} notCurrent={{ label: 'Khác mật khẩu hiện tại', state: notCurrentState }} />
      )}
      <InputField
        label="Xác nhận mật khẩu mới"
        required
        icon="lock"
        name="confirm-password"
        type={visible.confirm ? 'text' : 'password'}
        autoComplete="new-password"
        placeholder="Nhập lại mật khẩu mới"
        value={values.confirm}
        onChange={(e) => onChange('confirm', e.target.value)}
        error={confirmError}
        success={confirmMatches ? 'Mật khẩu xác nhận đã khớp.' : undefined}
        disabled={disabled}
        trailing={toggle('confirm', 'mật khẩu xác nhận')}
      />
    </>
  );
}

/** Thông báo kết quả theo frame 04.2 → 04.5. */
export function ChangePasswordAlertBanner({ alert }: { alert: ChangePasswordAlert | null }) {
  if (!alert) return null;
  switch (alert.kind) {
    case 'invalid':
      return (
        <Alert tone="danger" title={`Chưa thể đổi mật khẩu – ${alert.count} trường cần kiểm tra`}>
          Vui lòng nhập mật khẩu hiện tại và đặt mật khẩu mới đạt chính sách.
        </Alert>
      );
    case 'wrong-current':
      return (
        <Alert tone="danger" title="Mật khẩu hiện tại không chính xác">
          Bạn còn {alert.remainingAttempts} lần thử. Sai 5 lần liên tiếp, tài khoản sẽ bị tạm khóa 15 phút và bạn sẽ
          bị đăng xuất.
        </Alert>
      );
    case 'save-failed':
      return (
        <Alert tone="danger" title="Không thể đổi mật khẩu, vui lòng thử lại.">
          Mật khẩu cũ và phiên làm việc hiện tại được giữ nguyên.
        </Alert>
      );
    case 'success':
      return (
        <Alert tone="success" title="Đổi mật khẩu thành công">
          Các phiên đăng nhập khác của tài khoản đã bị đăng xuất; phiên hiện tại được cấp lại token mới.
        </Alert>
      );
  }
}
