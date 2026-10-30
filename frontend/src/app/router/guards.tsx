import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import type { Permission } from '@/constants/roles';
import { REDIRECT_PARAM, ROUTES, safeRedirect } from '@/constants/routes';
import type { ForbiddenRedirectState } from '@/features/dashboard/pages/DashboardPage';

function withRedirect(path: string, target: string) {
  return target === ROUTES.dashboard ? path : `${path}?${REDIRECT_PARAM}=${encodeURIComponent(target)}`;
}

/**
 * Chưa đăng nhập → về trang đăng nhập, giữ lại đường dẫn đã yêu cầu (01.0 / A3).
 * Đăng nhập bằng mật khẩu tạm → chỉ được vào màn đổi mật khẩu bắt buộc (01 A2 / 04 A1).
 */
export function RequireAuth() {
  const { user } = useAuth();
  const location = useLocation();
  const target = location.pathname + location.search;
  const onForcedPage = location.pathname === ROUTES.forcedPasswordChange;

  if (!user) return <Navigate to={withRedirect(ROUTES.login, target)} replace />;
  if (user.mustChangePassword && !onForcedPage) {
    return <Navigate to={withRedirect(ROUTES.forcedPasswordChange, target)} replace />;
  }
  if (!user.mustChangePassword && onForcedPage) return <Navigate to={ROUTES.dashboard} replace />;
  return <Outlet />;
}

/** Đã đăng nhập thì không ở lại trang đăng nhập/quên mật khẩu. */
export function PublicOnly() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  if (user) {
    return <Navigate to={safeRedirect(searchParams.get(REDIRECT_PARAM)) ?? ROUTES.dashboard} replace />;
  }
  return <Outlet />;
}

/**
 * Không có quyền với trang đã yêu cầu → chuyển về trang làm việc theo vai trò kèm cảnh báo (01.9).
 * Đây chỉ là kiểm tra hiển thị phía FE; BE vẫn phải tự kiểm tra quyền khi có API.
 */
export function RequirePermission({
  permission,
  label,
  children,
}: {
  permission?: Permission;
  label: string;
  children: ReactNode;
}) {
  const { can } = useAuth();

  if (permission && !can(permission)) {
    const state: ForbiddenRedirectState = { forbidden: label };
    return <Navigate to={ROUTES.dashboard} replace state={state} />;
  }
  return <>{children}</>;
}
