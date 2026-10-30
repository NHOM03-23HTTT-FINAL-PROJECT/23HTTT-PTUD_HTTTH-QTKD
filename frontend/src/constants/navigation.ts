import type { IconName } from '@/components/icon/Icon';
import type { Permission, WorkspaceKey } from './roles';
import { describeRecord } from './routes';

export type NavItem = {
  label: string;
  path: string;
  icon: IconName;
  permission?: Permission;
  badge?: number;
  /** UC/module sẽ triển khai màn hình này; hiển thị trên trang giữ chỗ. */
  module: string;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

const TRACK_PROGRESS: NavItem = {
  label: 'Theo dõi tiến độ',
  path: '/phe-duyet/tien-do',
  icon: 'clock',
  permission: 'approvals.track',
  module: 'Phê duyệt (APR)',
};

const APPROVAL_HISTORY: NavItem = {
  label: 'Lịch sử phê duyệt',
  path: '/phe-duyet/lich-su',
  icon: 'history',
  permission: 'approvals.track',
  module: 'Phê duyệt (APR)',
};

const CONTRACT_LIST: NavItem = {
  label: 'Danh sách hợp đồng',
  path: '/hop-dong',
  icon: 'file',
  permission: 'contracts.view',
  module: 'Hợp đồng (CTR)',
};

const AREA_LOOKUP: NavItem = {
  label: 'Tra cứu khu vực',
  path: '/khu-vuc/tra-cuu',
  icon: 'map-pin',
  permission: 'areas.view',
  module: 'Khu vực (ARE)',
};

/** Sidebar theo vai trò, lấy theo các màn 05.x trên page Dùng chung (CHUNG). */
export const WORKSPACE_NAV: Record<WorkspaceKey, NavGroup[]> = {
  'kinh-doanh': [
    {
      title: 'KHÁCH HÀNG',
      items: [
        { label: 'Danh sách khách hàng', path: '/khach-hang', icon: 'users', permission: 'customers.view', module: 'Khách hàng (CUS)' },
        { label: 'Tạo khách hàng', path: '/khach-hang/tao-moi', icon: 'user-plus', permission: 'customers.create', module: 'Khách hàng (CUS)' },
      ],
    },
    {
      title: 'HỢP ĐỒNG',
      items: [
        { ...CONTRACT_LIST, label: 'Hợp đồng của tôi' },
        { label: 'Tạo hợp đồng', path: '/hop-dong/tao-moi', icon: 'file-plus', permission: 'contracts.create', module: 'Hợp đồng (CTR)' },
        { label: 'Cần chỉnh sửa', path: '/hop-dong/can-chinh-sua', icon: 'edit', permission: 'contracts.create', badge: 1, module: 'Hợp đồng (CTR)' },
      ],
    },
    { title: 'PHÊ DUYỆT', items: [TRACK_PROGRESS, APPROVAL_HISTORY] },
    { title: 'KHU VỰC', items: [AREA_LOOKUP] },
  ],
  'khai-thac': [
    {
      title: 'KHU VỰC KHAI THÁC',
      items: [
        { label: 'Danh sách khu vực', path: '/khu-vuc', icon: 'list', permission: 'areas.view', module: 'Khu vực (ARE)' },
        { label: 'Tạo khu vực', path: '/khu-vuc/tao-moi', icon: 'map-pin', permission: 'areas.manage', module: 'Khu vực (ARE)' },
        { label: 'Sơ đồ phân cấp', path: '/khu-vuc/so-do', icon: 'layers', permission: 'areas.view', module: 'Khu vực (ARE)' },
        { ...AREA_LOOKUP, icon: 'search' },
      ],
    },
  ],
  'ke-toan': [],
  'phap-che': [
    {
      title: 'RÀ SOÁT PHÁP LÝ',
      items: [
        { label: 'Chờ rà soát pháp lý', path: '/phe-duyet/cho-ra-soat', icon: 'shield', permission: 'approvals.review-legal', badge: 3, module: 'Phê duyệt (APR)' },
        { label: 'Đã rà soát', path: '/phe-duyet/da-ra-soat', icon: 'check', permission: 'approvals.review-legal', module: 'Phê duyệt (APR)' },
      ],
    },
    { title: 'HỢP ĐỒNG', items: [CONTRACT_LIST] },
    { title: 'PHÊ DUYỆT', items: [TRACK_PROGRESS, APPROVAL_HISTORY] },
  ],
  bgd: [
    {
      title: 'PHÊ DUYỆT',
      items: [
        { label: 'Hồ sơ chờ phê duyệt', path: '/phe-duyet/cho-phe-duyet', icon: 'inbox', permission: 'approvals.approve', badge: 2, module: 'Phê duyệt (APR)' },
        APPROVAL_HISTORY,
      ],
    },
    { title: 'HỢP ĐỒNG', items: [CONTRACT_LIST, TRACK_PROGRESS] },
  ],
  'quan-tri': [
    {
      title: 'NGƯỜI DÙNG',
      items: [
        { label: 'Tài khoản người dùng', path: '/quan-tri/tai-khoan', icon: 'users', permission: 'users.manage', module: 'Người dùng & phân quyền' },
        { label: 'Vai trò & phân quyền', path: '/quan-tri/vai-tro', icon: 'shield', permission: 'roles.manage', module: 'Người dùng & phân quyền' },
      ],
    },
    {
      title: 'QUY TRÌNH',
      items: [{ label: 'Quy trình phê duyệt', path: '/quan-tri/quy-trinh', icon: 'workflow', permission: 'workflows.manage', module: 'Cấu hình quy trình (APR)' }],
    },
    {
      title: 'HỆ THỐNG',
      items: [
        { label: 'Nhật ký hệ thống', path: '/quan-tri/nhat-ky', icon: 'activity', permission: 'audit.view', module: 'Nhật ký (Audit)' },
        { label: 'Danh mục dùng chung', path: '/quan-tri/danh-muc', icon: 'list', permission: 'catalogs.manage', module: 'Danh mục (CHUNG)' },
      ],
    },
  ],
};

/** Gợi ý ô tìm kiếm trên Topbar theo phân hệ. */
export const WORKSPACE_SEARCH_PLACEHOLDER: Record<WorkspaceKey, string> = {
  'kinh-doanh': 'Tìm khách hàng, hợp đồng, khu vực…',
  'khai-thac': 'Tìm khu vực theo mã, tên, khu vực cha…',
  'ke-toan': 'Tìm kiếm…',
  'phap-che': 'Tìm khách hàng, hợp đồng, khu vực…',
  bgd: 'Tìm khách hàng, hợp đồng, khu vực…',
  'quan-tri': 'Tìm tài khoản, vai trò, quy trình…',
};

/** Màn hình dùng chung cho mọi vai trò (không cần quyền nghiệp vụ). */
export const ACCOUNT_NAV = {
  profile: { label: 'Thông tin cá nhân', path: '/tai-khoan/thong-tin', icon: 'user', module: 'Tài khoản cá nhân' },
  changePassword: { label: 'Đổi mật khẩu', path: '/doi-mat-khau', icon: 'lock', module: 'UC-CHUNG-04 · Đổi mật khẩu' },
  contactAdmin: { label: 'Liên hệ Quản trị hệ thống', path: '/lien-he-quan-tri', icon: 'mail', module: 'Hỗ trợ người dùng' },
} satisfies Record<string, NavItem>;

/** Tên dễ đọc của một đường dẫn, ví dụ "Hợp đồng HD-2026-013" hoặc "Danh sách khách hàng" (03.4). */
export function describePath(path: string, workspace?: WorkspaceKey): string {
  const record = describeRecord(path);
  if (record) return `${record.name} ${record.code}`;
  const pathname = path.split(/[?#]/)[0];
  return findNavItem(pathname, workspace)?.label ?? 'Bảng điều khiển';
}

/**
 * Tra mục menu theo đường dẫn để trang giữ chỗ biết tên màn hình và quyền cần có.
 * Ưu tiên menu của phân hệ hiện tại vì cùng một đường dẫn có thể mang nhãn khác nhau.
 */
export function findNavItem(pathname: string, workspace?: WorkspaceKey): NavItem | undefined {
  const shared = Object.values(ACCOUNT_NAV).find((item) => item.path === pathname);
  if (shared) return shared;
  const ordered = workspace
    ? [WORKSPACE_NAV[workspace], ...Object.values(WORKSPACE_NAV)]
    : Object.values(WORKSPACE_NAV);
  for (const groups of ordered) {
    for (const group of groups) {
      const item = group.items.find((i) => i.path === pathname);
      if (item) return item;
    }
  }
  return undefined;
}
