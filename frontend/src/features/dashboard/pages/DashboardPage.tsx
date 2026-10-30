import { useLocation } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { Alert } from '@/components/feedback/Alert';
import { getDashboardBase } from '@/mocks/seed/dashboards';
import { DashboardHeader, PendingTasksCard, StatGrid } from '../components/DashboardCards';
import {
  AccountingWorkspace,
  AdminWorkspace,
  DirectorWorkspace,
  LegalWorkspace,
  OperationsWorkspace,
  SalesWorkspace,
} from '../components/RoleWorkspaces';

/** State gửi kèm khi bị chuyển về trang làm việc vì không có quyền với trang đã yêu cầu (01.9). */
export type ForbiddenRedirectState = { forbidden?: string };

/** Trang làm việc theo vai trò sau đăng nhập (UC-CHUNG-01 bước 10, frame 05.1 → 05.6). */
export function DashboardPage() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return null;

  const workspace = user.departmentInfo.workspace;
  const base = getDashboardBase(workspace);
  const forbidden = (location.state as ForbiddenRedirectState | null)?.forbidden;

  return (
    <>
      <DashboardHeader name={user.fullName} greeting={base.greeting} actions={base.actions} />
      {forbidden && (
        <Alert tone="warning" title="Bạn không có quyền truy cập nội dung này">
          Đường dẫn bạn mở ({forbidden}) nằm ngoài phạm vi được phân quyền. Hệ thống đã chuyển bạn về trang làm việc
          theo vai trò.
        </Alert>
      )}
      <PendingTasksCard pending={base.pending} />
      <StatGrid stats={base.stats} />
      {workspace === 'kinh-doanh' && <SalesWorkspace />}
      {workspace === 'khai-thac' && <OperationsWorkspace />}
      {workspace === 'ke-toan' && <AccountingWorkspace user={user} />}
      {workspace === 'phap-che' && <LegalWorkspace />}
      {workspace === 'bgd' && <DirectorWorkspace />}
      {workspace === 'quan-tri' && <AdminWorkspace />}
    </>
  );
}
