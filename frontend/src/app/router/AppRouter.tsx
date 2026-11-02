import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { IS_MOCK_AUTH } from '@/features/auth/api/authApi';
import { ACCOUNT_NAV, WORKSPACE_NAV } from '@/constants/navigation';
import { ROUTES } from '@/constants/routes';
import { ChangePasswordPage } from '@/features/auth/pages/ChangePasswordPage';
import { ForcedPasswordChangePage } from '@/features/auth/pages/ForcedPasswordChangePage';
import { AreaCreatePage } from '@/features/areas/pages/AreaCreatePage';
import { AreaDetailPage } from '@/features/areas/pages/AreaDetailPage';
import { AreaEditPage } from '@/features/areas/pages/AreaEditPage';
import { AreaLookupPage } from '@/features/areas/pages/AreaLookupPage';
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { CustomerCreatePage } from '@/features/customers/pages/CustomerCreatePage';
import { CustomerDetailPage } from '@/features/customers/pages/CustomerDetailPage';
import { CustomerEditPage } from '@/features/customers/pages/CustomerEditPage';
import { CustomerListPage } from '@/features/customers/pages/CustomerListPage';
import { CustomerReactivatePage } from '@/features/customers/pages/CustomerReactivatePage';
import { CustomerSuspendPage } from '@/features/customers/pages/CustomerSuspendPage';
import { ApprovalInboxPage } from '@/features/contracts/pages/ApprovalInboxPage';
import { ContractCreatePage } from '@/features/contracts/pages/ContractCreatePage';
import { ContractDetailPage } from '@/features/contracts/pages/ContractDetailPage';
import { ContractReviewPage } from '@/features/contracts/pages/ContractReviewPage';
import { CoordinationInboxPage } from '@/features/contracts/pages/LegalCoordinationPanel';
import { ContractEditPage } from '@/features/contracts/pages/ContractEditPage';
import { ContractListPage } from '@/features/contracts/pages/ContractListPage';
import { ContractProgressPage } from '@/features/contracts/pages/ContractProgressPage';
import { WorkflowConfigFormPage, WorkflowConfigListPage } from '@/features/contracts/pages/WorkflowConfigPages';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { MainLayout } from '@/layouts/MainLayout';
import { PublicOnly, RequireAuth } from './guards';
import { BusinessRoute } from './BusinessRoute';
import { NavPlaceholderPage, NotFoundPage, RecordPlaceholderPage } from './PlaceholderPages';

/** Đường dẫn trong menu đã có màn hình thật, không dùng trang giữ chỗ. */
const IMPLEMENTED_PATHS = new Set<string>([
  '/phe-duyet/phoi-hop',
  ROUTES.changePassword,
  ROUTES.customers,
  ROUTES.customerCreate,
  ROUTES.areas,
  ROUTES.areaCreate,
  ROUTES.areaLookup,
  ROUTES.areaHierarchy,
  ROUTES.contractCreate,
  ROUTES.contracts,
  ROUTES.contractRevision,
  ROUTES.approvalSales,
  ROUTES.approvalLegal,
  ROUTES.approvalLegalDone,
  ROUTES.approvalBoard,
  ROUTES.approvalTracking,
  ROUTES.workflows,
]);

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
      <AppRoutes />
    </BrowserRouter>
  );
}

export function AppRoutes() {
  return (
      <Routes>
        <Route element={<PublicOnly />}>
          <Route path={ROUTES.login} element={<LoginPage />} />
          <Route path={ROUTES.forgotPassword} element={IS_MOCK_AUTH ? <ForgotPasswordPage /> : <Navigate to={ROUTES.login} replace />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route path={ROUTES.forcedPasswordChange} element={<ForcedPasswordChangePage />} />
          <Route element={<MainLayout />}>
            <Route path={ROUTES.dashboard} element={<DashboardPage />} />
            <Route path={ROUTES.changePassword} element={<ChangePasswordPage />} />
            <Route
              path={ROUTES.customers}
              element={
                <BusinessRoute permission="customers.view" label="Danh sách khách hàng">
                  <CustomerListPage />
                </BusinessRoute>
              }
            />
            <Route
              path={ROUTES.customerCreate}
              element={
                <BusinessRoute permission="customers.create" label="Tạo khách hàng">
                  <CustomerCreatePage />
                </BusinessRoute>
              }
            />
            <Route
              path="/khach-hang/:code"
              element={
                <BusinessRoute permission="customers.view" label="Hồ sơ khách hàng">
                  <CustomerDetailPage />
                </BusinessRoute>
              }
            />
            <Route
              path="/khach-hang/:code/chinh-sua"
              element={
                <BusinessRoute permission="customers.update" label="Chỉnh sửa khách hàng">
                  <CustomerEditPage />
                </BusinessRoute>
              }
            />
            <Route
              path="/khach-hang/:code/tam-ngung"
              element={
                <BusinessRoute permission="customers.change-status" label="Tạm ngưng khách hàng">
                  <CustomerSuspendPage />
                </BusinessRoute>
              }
            />
            <Route
              path="/khach-hang/:code/kich-hoat-lai"
              element={
                <BusinessRoute permission="customers.change-status" label="Kích hoạt lại khách hàng">
                  <CustomerReactivatePage />
                </BusinessRoute>
              }
            />
            <Route
              path={ROUTES.areas}
              element={
                <BusinessRoute permission="areas.view" label="Danh sách khu vực">
                  <AreaLookupPage key="list" variant="list" />
                </BusinessRoute>
              }
            />
            <Route
              path={ROUTES.areaLookup}
              element={
                <BusinessRoute permission="areas.view" label="Tra cứu khu vực">
                  <AreaLookupPage key="lookup" variant="lookup" />
                </BusinessRoute>
              }
            />
            <Route
              path={ROUTES.areaHierarchy}
              element={
                <BusinessRoute permission="areas.view" label="Sơ đồ phân cấp">
                  <AreaLookupPage key="hierarchy" variant="hierarchy" />
                </BusinessRoute>
              }
            />
            <Route
              path={ROUTES.areaCreate}
              element={
                <BusinessRoute permission="areas.create" label="Tạo khu vực">
                  <AreaCreatePage />
                </BusinessRoute>
              }
            />
            <Route
              path="/khu-vuc/:code"
              element={
                <BusinessRoute permission="areas.view" label="Chi tiết khu vực">
                  <AreaDetailPage />
                </BusinessRoute>
              }
            />
            <Route
              path="/khu-vuc/:code/chinh-sua"
              element={
                <BusinessRoute permission="areas.update" label="Chỉnh sửa khu vực">
                  <AreaEditPage />
                </BusinessRoute>
              }
            />
            <Route
              path={ROUTES.contractCreate}
              element={
                <BusinessRoute permission="contracts.create" label="Tạo hợp đồng">
                  <ContractCreatePage />
                </BusinessRoute>
              }
            />
            <Route
              path={ROUTES.contracts}
              element={
                <BusinessRoute permission="contracts.view" label="Danh sách hợp đồng">
                  <ContractListPage key="all" />
                </BusinessRoute>
              }
            />
            <Route
              path={ROUTES.contractRevision}
              element={
                <BusinessRoute permission="contracts.create" label="Hợp đồng cần chỉnh sửa">
                  <ContractListPage key="revision" variant="revision" />
                </BusinessRoute>
              }
            />
            <Route
              path="/hop-dong/:code"
              element={
                <BusinessRoute permission="contracts.view" label="Hồ sơ hợp đồng">
                  <ContractDetailPage />
                </BusinessRoute>
              }
            />
            <Route
              path="/hop-dong/:code/chinh-sua"
              element={
                <BusinessRoute permission="contracts.create" label="Chỉnh sửa hợp đồng">
                  <ContractEditPage />
                </BusinessRoute>
              }
            />
            <Route
              path="/hop-dong/:code/tien-do"
              element={
                <BusinessRoute permission="contracts.view" label="Tiến độ và lịch sử phê duyệt">
                  <ContractProgressPage />
                </BusinessRoute>
              }
            />
            <Route
              path={ROUTES.approvalSales}
              element={
                <BusinessRoute apiReady permission="approvals.approve" label="Hồ sơ chờ tôi duyệt">
                  <ApprovalInboxPage key="sales" step="sales" />
                </BusinessRoute>
              }
            />
            <Route
              path={ROUTES.approvalLegal}
              element={
                <BusinessRoute apiReady permission="approvals.review-legal" label="Chờ rà soát pháp lý">
                  <ApprovalInboxPage key="legal" step="legal" />
                </BusinessRoute>
              }
            />
            <Route
              path={ROUTES.approvalLegalDone}
              element={
                <BusinessRoute apiReady permission="approvals.review-legal" label="Đã rà soát">
                  <ApprovalInboxPage key="legal-done" step="legal" done />
                </BusinessRoute>
              }
            />
            <Route
              path={ROUTES.approvalBoard}
              element={
                <BusinessRoute apiReady permission="approvals.approve" label="Hồ sơ chờ phê duyệt">
                  <ApprovalInboxPage key="board" step="board" />
                </BusinessRoute>
              }
            />
            <Route
              path={ROUTES.approvalTracking}
              element={
                <BusinessRoute permission="approvals.track" label="Theo dõi tiến độ">
                  <ContractListPage key="tracking" variant="tracking" />
                </BusinessRoute>
              }
            />
            <Route
              path={ROUTES.workflows}
              element={
                <BusinessRoute permission="workflows.manage" label="Quy trình phê duyệt">
                  <WorkflowConfigListPage />
                </BusinessRoute>
              }
            />
            <Route
              path={ROUTES.workflowCreate}
              element={
                <BusinessRoute permission="workflows.manage" label="Tạo cấu hình người tham gia">
                  <WorkflowConfigFormPage key="new" />
                </BusinessRoute>
              }
            />
            <Route
              path="/quan-tri/quy-trinh/:code/cap-nhat"
              element={
                <BusinessRoute permission="workflows.manage" label="Cập nhật cấu hình người tham gia">
                  <WorkflowConfigFormPage key="edit" />
                </BusinessRoute>
              }
            />
            <Route path="/phe-duyet/ho-so/:id" element={<ContractReviewPage />} />
            <Route path="/phe-duyet/phoi-hop" element={<BusinessRoute apiReady label="Phối hợp phòng ban"><CoordinationInboxPage /></BusinessRoute>} />
            <Route path="/bang-thanh-toan/:code" element={<RecordPlaceholderPage kind="payment" />} />
            {NAV_PATHS.map((path) => (
              <Route key={path} path={path} element={<NavPlaceholderPage />} />
            ))}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
  );
}
