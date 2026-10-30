import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ACCOUNT_NAV, WORKSPACE_NAV } from '@/constants/navigation';
import { ROUTES } from '@/constants/routes';
import { ChangePasswordPage } from '@/features/auth/pages/ChangePasswordPage';
import { ForcedPasswordChangePage } from '@/features/auth/pages/ForcedPasswordChangePage';
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { MainLayout } from '@/layouts/MainLayout';
import { PublicOnly, RequireAuth } from './guards';
import { NavPlaceholderPage, NotFoundPage, RecordPlaceholderPage } from './PlaceholderPages';

/**
 * Mọi đường dẫn có trong menu chưa có màn hình thật, đăng ký tĩnh để ưu tiên hơn route hồ sơ `/hop-dong/:code`.
 */
const NAV_PATHS = [
  ...new Set([
    ...Object.values(WORKSPACE_NAV).flatMap((groups) => groups.flatMap((g) => g.items.map((i) => i.path))),
    ...Object.values(ACCOUNT_NAV).map((i) => i.path),
  ]),
].filter((path) => path !== ROUTES.changePassword);

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
