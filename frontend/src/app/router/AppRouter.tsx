import { BrowserRouter, Route, Routes } from 'react-router-dom';
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
import { ContractEditPage } from '@/features/contracts/pages/ContractEditPage';
import { ContractListPage } from '@/features/contracts/pages/ContractListPage';
import { ContractProgressPage } from '@/features/contracts/pages/ContractProgressPage';
import { WorkflowConfigFormPage, WorkflowConfigListPage } from '@/features/contracts/pages/WorkflowConfigPages';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { MainLayout } from '@/layouts/MainLayout';
import { PublicOnly, RequireAuth, RequirePermission } from './guards';
import { NavPlaceholderPage, NotFoundPage, RecordPlaceholderPage } from './PlaceholderPages';

/** Đường dẫn trong menu đã có màn hình thật, không dùng trang giữ chỗ. */
const IMPLEMENTED_PATHS = new Set<string>([
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
            <Route
              path={ROUTES.areas}
              element={
                <RequirePermission permission="areas.view" label="Danh sách khu vực">
                  <AreaLookupPage key="list" variant="list" />
                </RequirePermission>
              }
            />
            <Route
              path={ROUTES.areaLookup}
              element={
                <RequirePermission permission="areas.view" label="Tra cứu khu vực">
                  <AreaLookupPage key="lookup" variant="lookup" />
                </RequirePermission>
              }
            />
            <Route
              path={ROUTES.areaHierarchy}
              element={
                <RequirePermission permission="areas.view" label="Sơ đồ phân cấp">
                  <AreaLookupPage key="hierarchy" variant="hierarchy" />
                </RequirePermission>
              }
            />
            <Route
              path={ROUTES.areaCreate}
              element={
                <RequirePermission permission="areas.create" label="Tạo khu vực">
                  <AreaCreatePage />
                </RequirePermission>
              }
            />
            <Route
              path="/khu-vuc/:code"
              element={
                <RequirePermission permission="areas.view" label="Chi tiết khu vực">
                  <AreaDetailPage />
                </RequirePermission>
              }
            />
            <Route
              path="/khu-vuc/:code/chinh-sua"
              element={
                <RequirePermission permission="areas.update" label="Chỉnh sửa khu vực">
                  <AreaEditPage />
                </RequirePermission>
              }
            />
            <Route
              path={ROUTES.contractCreate}
              element={
                <RequirePermission permission="contracts.create" label="Tạo hợp đồng">
                  <ContractCreatePage />
                </RequirePermission>
              }
            />
            <Route
              path={ROUTES.contracts}
              element={
                <RequirePermission permission="contracts.view" label="Danh sách hợp đồng">
                  <ContractListPage key="all" />
                </RequirePermission>
              }
            />
            <Route
              path={ROUTES.contractRevision}
              element={
                <RequirePermission permission="contracts.create" label="Hợp đồng cần chỉnh sửa">
                  <ContractListPage key="revision" variant="revision" />
                </RequirePermission>
              }
            />
            <Route
              path="/hop-dong/:code"
              element={
                <RequirePermission permission="contracts.view" label="Hồ sơ hợp đồng">
                  <ContractDetailPage />
                </RequirePermission>
              }
            />
            <Route
              path="/hop-dong/:code/chinh-sua"
              element={
                <RequirePermission permission="contracts.create" label="Chỉnh sửa hợp đồng">
                  <ContractEditPage />
                </RequirePermission>
              }
            />
            <Route
              path="/hop-dong/:code/tien-do"
              element={
                <RequirePermission permission="contracts.view" label="Tiến độ và lịch sử phê duyệt">
                  <ContractProgressPage />
                </RequirePermission>
              }
            />
            <Route
              path={ROUTES.approvalSales}
              element={
                <RequirePermission permission="approvals.approve" label="Hồ sơ chờ tôi duyệt">
                  <ApprovalInboxPage key="sales" step="sales" />
                </RequirePermission>
              }
            />
            <Route
              path={ROUTES.approvalLegal}
              element={
                <RequirePermission permission="approvals.review-legal" label="Chờ rà soát pháp lý">
                  <ApprovalInboxPage key="legal" step="legal" />
                </RequirePermission>
              }
            />
            <Route
              path={ROUTES.approvalLegalDone}
              element={
                <RequirePermission permission="approvals.review-legal" label="Đã rà soát">
                  <ApprovalInboxPage key="legal-done" step="legal" done />
                </RequirePermission>
              }
            />
            <Route
              path={ROUTES.approvalBoard}
              element={
                <RequirePermission permission="approvals.approve" label="Hồ sơ chờ phê duyệt">
                  <ApprovalInboxPage key="board" step="board" />
                </RequirePermission>
              }
            />
            <Route
              path={ROUTES.approvalTracking}
              element={
                <RequirePermission permission="approvals.track" label="Theo dõi tiến độ">
                  <ContractListPage key="tracking" variant="tracking" />
                </RequirePermission>
              }
            />
            <Route
              path={ROUTES.workflows}
              element={
                <RequirePermission permission="workflows.manage" label="Quy trình phê duyệt">
                  <WorkflowConfigListPage />
                </RequirePermission>
              }
            />
            <Route
              path={ROUTES.workflowCreate}
              element={
                <RequirePermission permission="workflows.manage" label="Tạo cấu hình người tham gia">
                  <WorkflowConfigFormPage key="new" />
                </RequirePermission>
              }
            />
            <Route
              path="/quan-tri/quy-trinh/:code/cap-nhat"
              element={
                <RequirePermission permission="workflows.manage" label="Cập nhật cấu hình người tham gia">
                  <WorkflowConfigFormPage key="edit" />
                </RequirePermission>
              }
            />
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
