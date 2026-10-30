import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useSession, useUnsavedChanges } from '@/app/providers/SessionProvider';
import { Button } from '@/components/button/Button';
import { ROUTES } from '@/constants/routes';
import { formatDateTime } from '@/utils/format';
import { authApi } from '../api/authApi';
import { ChangePasswordAlertBanner, ChangePasswordFields } from '../components/ChangePasswordFields';
import { useChangePasswordForm } from '../hooks/useChangePasswordForm';
import './ChangePasswordPage.css';

const FORM_ID = 'change-password-form';

const SECURITY_NOTES = [
  'Không dùng lại mật khẩu của hệ thống khác.',
  'Sai mật khẩu hiện tại 5 lần liên tiếp, tài khoản bị tạm khóa 15 phút và bị đăng xuất.',
  'Hệ thống không bao giờ yêu cầu gửi mật khẩu qua email hay điện thoại.',
];

/** UC-CHUNG-04 · Đổi mật khẩu – frame 04.1 → 04.5 (lần sai thứ 5 → 04.7). */
export function ChangePasswordPage() {
  const { user } = useAuth();
  const { endSession } = useSession();
  const navigate = useNavigate();
  const [changedAt, setChangedAt] = useState(() => (user ? authApi.getPasswordChangedAt(user.id) : null));

  const form = useChangePasswordForm({
    onSuccess: (result) => setChangedAt(result.passwordChangedAt),
    onLocked: () => endSession('locked'),
    onSessionEnded: () => endSession('password-changed'),
  });
  const { values } = form;
  useUnsavedChanges(values.current || values.next || values.confirm ? 'Đổi mật khẩu' : null);

  if (!user) return null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void form.submit();
  }

  const accountFields = [
    { label: 'Tên đăng nhập', value: user.username },
    { label: 'Email công ty', value: user.email },
    { label: 'Phòng ban · Vai trò', value: `${user.departmentInfo.shortName} · ${user.primaryRole.name}` },
    { label: 'Đổi mật khẩu gần nhất', value: changedAt ? formatDateTime(changedAt) : 'Chưa đổi kể từ khi được cấp' },
  ];

  return (
    <>
      <nav className="breadcrumb" aria-label="Đường dẫn">
        <span>Tài khoản</span>
        <span className="breadcrumb__separator">/</span>
        <span className="breadcrumb__current" aria-current="page">
          Đổi mật khẩu
        </span>
      </nav>

      <div className="page-header">
        <div className="page-header__title">
          <h1>Đổi mật khẩu</h1>
          <p>Sau khi đổi, các phiên đăng nhập của tài khoản trên thiết bị khác sẽ bị đăng xuất.</p>
        </div>
        <div className="page-header__actions">
          <Button variant="secondary" onClick={() => navigate(ROUTES.dashboard)} disabled={form.submitting}>
            Hủy
          </Button>
          <Button type="submit" form={FORM_ID} disabled={form.submitting} className={form.submitting ? 'is-busy' : undefined}>
            {form.submitting ? 'Đang lưu…' : 'Lưu'}
          </Button>
        </div>
      </div>

      <ChangePasswordAlertBanner alert={form.alert} />

      <div className="change-password">
        <form id={FORM_ID} className="change-password__form" noValidate onSubmit={handleSubmit} aria-busy={form.submitting}>
          <div className="change-password__heading">
            <h2>Mật khẩu</h2>
            <p>Nhập mật khẩu hiện tại để xác minh, sau đó đặt mật khẩu mới theo chính sách.</p>
          </div>
          <ChangePasswordFields
            values={values}
            errors={form.errors}
            onChange={form.setField}
            disabled={form.submitting}
            currentLabel="Mật khẩu hiện tại"
            showPolicy
          />
        </form>

        <aside className="change-password__side">
          <section className="side-card">
            <h2 className="side-card__title">Thông tin tài khoản</h2>
            <p className="side-card__subtitle">Chỉ đọc – do Quản trị hệ thống quản lý.</p>
            {accountFields.map((field) => (
              <div key={field.label} className="side-card__item">
                <span className="side-card__label">{field.label}</span>
                <span className="side-card__value">{field.value}</span>
              </div>
            ))}
          </section>
          <section className="side-card">
            <h2 className="side-card__title">Lưu ý bảo mật</h2>
            <ul className="side-card__notes">
              {SECURITY_NOTES.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
