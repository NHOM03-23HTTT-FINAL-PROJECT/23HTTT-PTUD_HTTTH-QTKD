import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ACCOUNT_NAV, WORKSPACE_NAV } from '@/constants/navigation';
import { ROUTES } from '@/constants/routes';
import { ChangePasswordPage } from '@/features/auth/pages/ChangePasswordPage';
import { ForcedPasswordChangePage } from '@/features/auth/pages/ForcedPasswordChangePage';
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { CustomerCreatePage } from '@/features/customers/pages/CustomerCreatePage';
import { CustomerDetailPage } from '@/features/customers/pages/CustomerDetailPage';
import { CustomerEditPage } from '@/features/customers/pages/CustomerEditPage';
import { CustomerListPage } from '@/features/customers/pages/CustomerListPage';
import { CustomerReactivatePage } from '@/features/customers/pages/CustomerReactivatePage';
import { CustomerSuspendPage } from '@/features/customers/pages/CustomerSuspendPage';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { MainLayout } from '@/layouts/MainLayout';
import { PublicOnly, RequireAuth, RequirePermission } from './guards';
import { NavPlaceholderPage, NotFoundPage, RecordPlaceholderPage } from './PlaceholderPages';

/** Đường dẫn trong menu đã có màn hình thật, không dùng trang giữ chỗ. */
const IMPLEMENTED_PATHS = new Set<string>([ROUTES.changePassword, ROUTES.customers, ROUTES.customerCreate]);

/**
 * Mọi đường dẫn có trong menu chưa có màn hình thật, đăng ký tĩnh để ưu tiên hơn route hồ sơ `/hop-dong/:code`.
 */
const NAV_PATHS = [
  ...new Set([
    ...Object.values(WORKSPACE_NAV).flatMap((groups) => groups.flatMap((g) => g.items.map((i) => i.path))),
    ...Object.values(ACCOUNT_NAV).map((i) => i.path),
  ]),
].filter((path) => !IMPLEMENTED_PATHS.has(path));

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicOnly />}>
          <Route path={ROUTES.login} element={<LoginPage />} />
          <Route path={ROUTES.forgotPassword} element={<ForgotPasswordPage />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route path={ROUTES.forcedPasswordChange} element={<ForcedPasswordChangePage />} />
          <Route element={<MainLayout />}>
            <Route path={ROUTES.dashboard} element={<DashboardPage />} />
            <Route path={ROUTES.changePassword} element={<ChangePasswordPage />} />
            <Route
              path={ROUTES.customers}
              element={
                <RequirePermission permission="customers.view" label="Danh sách khách hàng">
                  <CustomerListPage />
                </RequirePermission>
              }
            />
            <Route
              path={ROUTES.customerCreate}
              element={
                <RequirePermission permission="customers.create" label="Tạo khách hàng">
                  <CustomerCreatePage />
                </RequirePermission>
              }
            />
            <Route
              path="/khach-hang/:code"
              element={
                <RequirePermission permission="customers.view" label="Hồ sơ khách hàng">
                  <CustomerDetailPage />
                </RequirePermission>
              }
            />
            <Route
              path="/khach-hang/:code/chinh-sua"
              element={
                <RequirePermission permission="customers.update" label="Chỉnh sửa khách hàng">
                  <CustomerEditPage />
                </RequirePermission>
              }
            />
            <Route
              path="/khach-hang/:code/tam-ngung"
              element={
                <RequirePermission permission="customers.change-status" label="Tạm ngưng khách hàng">
                  <CustomerSuspendPage />
                </RequirePermission>
              }
            />
            <Route
              path="/khach-hang/:code/kich-hoat-lai"
              element={
                <RequirePermission permission="customers.change-status" label="Kích hoạt lại khách hàng">
                  <CustomerReactivatePage />
                </RequirePermission>
              }
            />
            <Route path="/hop-dong/:code" element={<RecordPlaceholderPage kind="contract" />} />
            <Route path="/bang-thanh-toan/:code" element={<RecordPlaceholderPage kind="payment" />} />
            {NAV_PATHS.map((path) => (
              <Route key={path} path={path} element={<NavPlaceholderPage />} />
            ))}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
