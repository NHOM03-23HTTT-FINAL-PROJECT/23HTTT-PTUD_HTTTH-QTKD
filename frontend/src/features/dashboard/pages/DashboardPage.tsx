import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { ButtonLink } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { ROUTES } from '@/constants/routes';
import { useNotifications } from '@/features/notifications/hooks/useNotifications';
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
import { areasApi, type AreaDashboardDto } from '@/features/areas/api/areasApi';
import type { AreaRow, AreaTreeNode } from '../types/dashboard';

/** State gửi kèm khi bị chuyển về trang làm việc vì không có quyền với trang đã yêu cầu (01.9). */
export type ForbiddenRedirectState = { forbidden?: string };

function flattenAreaTree(nodes: any[], depth: 0 | 1 | 2 = 0): AreaTreeNode[] {
  const result: AreaTreeNode[] = [];
  for (const node of nodes) {
    const isActive = node.status === 1 || String(node.status).toLowerCase() === 'active';
    let badge: { label: string; tone: 'accent' | 'warning' } | undefined = undefined;
    if (depth === 0) {
      badge = { label: 'Cấp 1', tone: 'accent' };
    } else if (!isActive) {
      badge = { label: 'Tạm ngưng', tone: 'warning' };
    }

    result.push({
      name: node.areaName || node.name,
      depth: depth as 0 | 1 | 2,
      badge,
    });

    if (node.children && node.children.length > 0 && depth < 2) {
      result.push(...flattenAreaTree(node.children, (depth + 1) as 1 | 2));
    }
  }
  return result;
}

/** Trang làm việc theo vai trò sau đăng nhập (UC-CHUNG-01 bước 10, frame 05.1 → 05.6). */
let cachedOpsData: AreaDashboardDto | null = null;

export function DashboardPage() {
  const { user } = useAuth();
  const location = useLocation();
  const [opsData, setOpsData] = useState<AreaDashboardDto | null>(() => cachedOpsData || areasApi.getCachedDashboard());
  const { unread, setPanelOpen } = useNotifications();

  const workspace = user?.departmentInfo.workspace;

  useEffect(() => {
    if (workspace === 'khai-thac') {
      areasApi.fetchDashboardAsync().then((res) => {
        if (res) {
          cachedOpsData = res;
          setOpsData(res);
        }
      });
    }
  }, [workspace]);

  if (!user || !workspace) return null;

  const base = getDashboardBase(workspace);
  const forbidden = (location.state as ForbiddenRedirectState | null)?.forbidden;

  const greeting = opsData
    ? `Danh mục mặt bằng hiện có ${opsData.totalAreas} khu vực trên 3 cấp phân cấp.`
    : base.greeting;

  const stats = opsData
    ? [
        {
          label: 'Tổng khu vực',
          value: String(opsData.totalAreas),
          hint: `${opsData.activeCount} Active · ${opsData.suspendedCount} tạm ngưng`,
          icon: 'map-pin' as const,
        },
        {
          label: 'Cấp 1 · Cảng',
          value: String(opsData.level1Count),
          hint: opsData.level1Names.length > 0 ? opsData.level1Names.join(', ') : 'Chưa có cảng',
          icon: 'building' as const,
        },
        {
          label: 'Cấp 2 · Bến / Bãi',
          value: String(opsData.level2Count),
          hint: `Thuộc ${opsData.level1Count} cảng`,
          icon: 'layers' as const,
        },
        {
          label: 'Cấp 3 · Ô / Vị trí',
          value: String(opsData.level3Count),
          hint: 'Đơn vị ghi nhận sản lượng',
          icon: 'grid' as const,
        },
      ]
    : base.stats;

  const pending = opsData
    ? {
        items: [
          { count: opsData.incompleteCount, label: 'khu vực cần cập nhật thông số' },
          { count: 1, label: 'kỳ sản lượng 10/2026 chờ khóa' },
          { count: opsData.suspendedCount, label: 'đề xuất tạm ngưng chờ xác nhận' },
        ],
        unread: opsData.incompleteCount > 0 ? 1 : 0,
        viewAllTo: ROUTES.areaLookup,
      }
    : base.pending;

  const recentAreas: AreaRow[] | undefined = opsData
    ? opsData.recentAreas.map((dto) => {
        let parentName = dto.parentAreaCode || '';
        if (!parentName && dto.hierarchyPath) {
          const parts = dto.hierarchyPath.split('/').filter(Boolean);
          if (parts.length > 1) {
            parentName = parts[parts.length - 2];
          }
        }
        const isActive = dto.status === 1 || String(dto.status).toLowerCase() === 'active';
        const changeText = dto.technicalDescription
          ? dto.technicalDescription
          : dto.capacity
            ? `Sức chứa ${dto.capacity} TEU`
            : dto.areaM2
              ? `Diện tích ${dto.areaM2} m²`
              : 'Đang hoạt động';

        return {
          code: dto.areaCode || dto.code,
          name: dto.areaName || dto.name,
          change: changeText,
          level: `Cấp ${dto.level || 1}`,
          parent: parentName || '—',
          status: {
            label: isActive ? 'Active' : 'Tạm ngưng',
            tone: isActive ? 'success' : 'warning',
          },
        };
      })
    : undefined;

  const treeNodes: AreaTreeNode[] | undefined = opsData
    ? flattenAreaTree(opsData.areaTree)
    : undefined;

  return (
    <>
      <DashboardHeader
        name={user.fullName}
        greeting={greeting}
        actions={base.actions}
        customActions={
          workspace === 'khai-thac' ? (
            <>
              <div className="area-segmented" role="radiogroup" aria-label="Kiểu hiển thị">
                <Link to={ROUTES.areaLookup} className="area-segmented__option" role="radio">
                  Dạng bảng
                </Link>
                <Link to={ROUTES.areaHierarchy} className="area-segmented__option" role="radio">
                  Sơ đồ cây
                </Link>
              </div>
              <ButtonLink to={ROUTES.areaCreate}>Thêm mới khu vực</ButtonLink>
            </>
          ) : undefined
        }
      />
      {forbidden && (
        <Alert tone="warning" title="Bạn không có quyền truy cập nội dung này">
          Đường dẫn bạn mở ({forbidden}) nằm ngoài phạm vi được phân quyền. Hệ thống đã chuyển bạn về trang làm việc
          theo vai trò.
        </Alert>
      )}
      <PendingTasksCard pending={pending} unread={unread} onOpenNotifications={() => setPanelOpen(true)} />
      <StatGrid stats={stats} />
      {workspace === 'kinh-doanh' && <SalesWorkspace />}
      {workspace === 'khai-thac' && <OperationsWorkspace areas={recentAreas} areaTree={treeNodes} />}
      {workspace === 'ke-toan' && <AccountingWorkspace user={user} />}
      {workspace === 'phap-che' && <LegalWorkspace />}
      {workspace === 'bgd' && <DirectorWorkspace />}
      {workspace === 'quan-tri' && <AdminWorkspace />}
    </>
  );
}
