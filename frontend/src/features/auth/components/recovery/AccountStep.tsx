import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/button/Button';
import { InputField } from '@/components/form/InputField';
import { ROUTES } from '@/constants/routes';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AccountStepProps = {
  identifier: string;
  onIdentifierChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
};

/** Bước 1 – Nhập tài khoản (frame 02.1, lỗi E1 ở 02.2). */
export function AccountStep({ identifier, onIdentifierChange, onSubmit, busy }: AccountStepProps) {
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = identifier.trim();
    // E1: báo lỗi ngay tại trường nhập, không gửi yêu cầu.
    const message = !value
      ? 'Vui lòng nhập tên đăng nhập hoặc email công ty.'
      : value.includes('@') && !EMAIL_PATTERN.test(value)
        ? 'Email công ty không đúng định dạng (ví dụ: ten.ho@abc-logistics.vn).'
        : undefined;
    setError(message);
    if (message) {
      inputRef.current?.focus();
      return;
    }
    onSubmit();
  }

  return (
    <form className="recovery-step" noValidate onSubmit={handleSubmit} aria-busy={busy}>
      <InputField
        ref={inputRef}
        label="Tên đăng nhập hoặc email công ty"
        required
        icon="mail"
        name="username"
        autoComplete="username"
        placeholder="Nhập tên đăng nhập hoặc email công ty"
        value={identifier}
        onChange={(e) => {
          onIdentifierChange(e.target.value);
          setError(undefined);
        }}
        error={error}
        disabled={busy}
      />
      <Button type="submit" block disabled={busy} className={busy ? 'recovery-busy' : undefined}>
        {busy ? 'Đang gửi mã…' : 'Gửi mã xác thực'}
      </Button>
      <div className="recovery-links">
        {/* A3: hủy – mật khẩu không đổi. */}
        <Link to={ROUTES.login} className="recovery-links__primary">
          ← Quay lại đăng nhập
        </Link>
      </div>
    </form>
  );
}
