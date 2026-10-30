import type { FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useEndSession } from '@/app/providers/SessionProvider';
import { Button } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { useToast } from '@/components/feedback/Toast';
import { REDIRECT_PARAM, ROUTES, safeRedirect } from '@/constants/routes';
import { AuthLayout } from '@/layouts/AuthLayout';
import { ChangePasswordAlertBanner, ChangePasswordFields } from '../components/ChangePasswordFields';
import { useChangePasswordForm } from '../hooks/useChangePasswordForm';
import './ForcedPasswordChangePage.css';

/**
 * UC-CHUNG-01 A2 / UC-CHUNG-04 A1 (frame 04.6): đăng nhập bằng mật khẩu tạm → phiên chỉ được vào màn này,
 * không có Sidebar. Đổi thành công → trang làm việc theo vai trò; "Hủy và đăng xuất" → UC-CHUNG-03.
 */
export function ForcedPasswordChangePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const endSession = useEndSession();

  const form = useChangePasswordForm({
    onSuccess: () => {
      showToast({ title: 'Đổi mật khẩu thành công', description: 'Bạn có thể bắt đầu sử dụng hệ thống.' });
      navigate(safeRedirect(searchParams.get(REDIRECT_PARAM)) ?? ROUTES.dashboard, { replace: true });
    },
    onLocked: () => endSession('locked'),
    onSessionEnded: () => endSession('password-changed'),
  });

  if (!user) return null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void form.submit();
  }

  return (
    <AuthLayout>
      <form className="auth-form" noValidate onSubmit={handleSubmit} aria-busy={form.submitting}>
        <div className="auth-form__heading">
          <h2 className="auth-form__title">Đặt mật khẩu mới để tiếp tục</h2>
          <p className="auth-form__subtitle">Tài khoản {user.email}</p>
        </div>

        {form.alert && form.alert.kind !== 'success' ? (
          <ChangePasswordAlertBanner alert={form.alert} />
        ) : (
          <Alert tone="info" title="Bạn đang dùng mật khẩu tạm do Quản trị hệ thống cấp">
            Vì lý do bảo mật, cần đổi mật khẩu trước khi sử dụng các chức năng khác.
          </Alert>
        )}

        <ChangePasswordFields
          values={form.values}
          errors={form.errors}
          onChange={form.setField}
          disabled={form.submitting}
          currentLabel="Mật khẩu tạm hiện tại"
          showPolicy={false}
        />

        <Button type="submit" block disabled={form.submitting} className={form.submitting ? 'forced-busy' : undefined}>
          {form.submitting ? 'Đang lưu…' : 'Lưu và tiếp tục'}
        </Button>
        <button type="button" className="forced-cancel" onClick={() => endSession('logout')} disabled={form.submitting}>
          Hủy và đăng xuất
        </button>
      </form>
    </AuthLayout>
  );
}
