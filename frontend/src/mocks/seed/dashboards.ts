import type { WorkspaceKey } from '@/constants/roles';
import type {
  AccountingDashboard,
  AdminDashboard,
  DashboardBase,
  DirectorDashboard,
  LegalDashboard,
  OperationsDashboard,
  SalesDashboard,
} from '@/features/dashboard/types/dashboard';

/*
 * Dữ liệu mẫu cho trang làm việc sau đăng nhập, lấy theo các frame 05.1 → 05.6
 * trên page "04 · Dùng chung (CHUNG)". Số liệu là minh họa, chưa nối API.
 */

export const SALES_DASHBOARD: SalesDashboard = {
  greeting: 'Bạn có 1 hợp đồng cần chỉnh sửa và 5 hồ sơ đang chờ duyệt.',
  actions: {
    secondary: { label: 'Tạo khách hàng', to: '/khach-hang/tao-moi' },
    primary: { label: '+ Tạo hợp đồng', to: '/hop-dong/tao-moi' },
  },
  pending: {
    items: [
      { count: 1, label: 'hợp đồng cần chỉnh sửa' },
      { count: 1, label: 'hợp đồng chờ trình duyệt' },
      { count: 2, label: 'bảng giá dự thảo' },
    ],
    unread: 3,
    viewAllTo: '/hop-dong',
  },
  stats: [
    { label: 'Khách hàng phụ trách', value: '48', hint: '+3 khách hàng mới tháng này', icon: 'users' },
    { label: 'Hợp đồng dự thảo', value: '3', hint: 'Chưa trình duyệt', icon: 'file' },
    { label: 'Đang chờ duyệt', value: '5', hint: 'TP KD · Pháp chế · BGĐ', icon: 'clock' },
    { label: 'Cần chỉnh sửa', value: '1', hint: 'Pháp chế yêu cầu bổ sung', icon: 'edit' },
  ],
  contracts: [
    {
      code: 'HD-2026-014',
      customer: 'Công ty TNHH Minh Phát',
      service: 'Lưu kho & bốc xếp',
      status: { label: 'Cần chỉnh sửa', tone: 'warning' },
      updatedAt: '28/10/2026',
      action: { label: 'Chỉnh sửa', variant: 'secondary' },
    },
    {
      code: 'HD-2026-013',
      customer: 'CTCP Cảng Sao Biển',
      service: 'Khai thác bến container',
      status: { label: 'Chờ duyệt · Pháp chế', tone: 'info' },
      updatedAt: '27/10/2026',
      action: { label: 'Xem', variant: 'ghost' },
    },
    {
      code: 'HD-2026-012',
      customer: 'Vận tải Hoàng Long',
      service: 'Vận hành thiết bị nâng',
      status: { label: 'Dự thảo', tone: 'neutral' },
      updatedAt: '26/10/2026',
      action: { label: 'Trình duyệt', variant: 'secondary' },
    },
    {
      code: 'HD-2026-010',
      customer: 'Logistics Đông Á',
      service: 'Lưu kho lạnh',
      status: { label: 'Đã phê duyệt', tone: 'success' },
      updatedAt: '22/10/2026',
      action: { label: 'Xem', variant: 'ghost' },
    },
    {
      code: 'HD-2026-009',
      customer: 'TNHH Thép Nam Việt',
      service: 'Bốc xếp hàng rời',
      status: { label: 'Chờ duyệt · BGĐ', tone: 'info' },
      updatedAt: '21/10/2026',
      action: { label: 'Xem', variant: 'ghost' },
    },
  ],
  quickLinks: [
    { label: 'Tạo khách hàng', icon: 'user-plus', to: '/khach-hang/tao-moi' },
    { label: 'Tạo hợp đồng', icon: 'file-plus', to: '/hop-dong/tao-moi' },
    { label: 'Tìm khách hàng', icon: 'search', to: '/khach-hang' },
    { label: 'Tra cứu khu vực', icon: 'map-pin', to: '/khu-vuc/tra-cuu' },
  ],
  progress: {
    code: 'HD-2026-013',
    customer: 'CTCP Cảng Sao Biển',
    steps: [
      { title: 'Trưởng phòng Kinh doanh', meta: 'Lê Thị Hồng · 25/10', state: 'done', badge: { label: 'Đã duyệt', tone: 'success' } },
      { title: 'Pháp chế', meta: 'Phạm Minh Đức đang giữ', state: 'current', badge: { label: 'Đang xử lý', tone: 'accent' } },
      { title: 'Ban Giám đốc', meta: 'Chưa đến lượt', state: 'waiting', badge: { label: 'Chờ', tone: 'neutral' } },
    ],
  },
};

export const OPERATIONS_DASHBOARD: OperationsDashboard = {
  greeting: 'Danh mục mặt bằng hiện có 36 khu vực trên 3 cấp phân cấp.',
  actions: {
    secondary: { label: 'Sơ đồ phân cấp', to: '/khu-vuc/so-do' },
    primary: { label: '+ Tạo khu vực', to: '/khu-vuc/tao-moi' },
  },
  pending: {
    items: [
      { count: 2, label: 'khu vực cần cập nhật thông số' },
      { count: 1, label: 'kỳ sản lượng 10/2026 chờ khóa' },
      { count: 1, label: 'đề xuất tạm ngưng chờ xác nhận' },
    ],
    unread: 2,
    viewAllTo: '/khu-vuc',
  },
  stats: [
    { label: 'Tổng khu vực', value: '36', hint: '34 Active · 2 tạm ngưng', icon: 'map-pin' },
    { label: 'Cấp 1 · Cảng', value: '2', hint: 'Cát Lái, Phước Long', icon: 'building' },
    { label: 'Cấp 2 · Bến / Bãi', value: '9', hint: 'Thuộc 2 cảng', icon: 'layers' },
    { label: 'Cấp 3 · Ô / Vị trí', value: '25', hint: 'Đơn vị ghi nhận sản lượng', icon: 'grid' },
  ],
  areas: [
    { code: 'KV-CL-B1-A3', name: 'Bãi A3 – Container rỗng', change: 'Tạo mới · sức chứa 1.200 TEU', level: 'Cấp 3', parent: 'Bến 1 · Cát Lái', status: { label: 'Active', tone: 'success' } },
    { code: 'KV-CL-B2', name: 'Bến 2 – Hàng tổng hợp', change: 'Cập nhật chiều dài bến 220 m', level: 'Cấp 2', parent: 'Cảng Cát Lái', status: { label: 'Active', tone: 'success' } },
    { code: 'KV-PL-K1', name: 'Kho CFS 1', change: 'Diện tích 6.500 m²', level: 'Cấp 2', parent: 'Cảng Phước Long', status: { label: 'Active', tone: 'success' } },
    { code: 'KV-CL-B1-A1', name: 'Bãi A1 – Container lạnh', change: 'Sức chứa 640 → 720 TEU', level: 'Cấp 3', parent: 'Bến 1 · Cát Lái', status: { label: 'Active', tone: 'success' } },
    { code: 'KV-PL-B3-C2', name: 'Bãi C2 – Hàng rời', change: 'Đang bảo trì nền bãi', level: 'Cấp 3', parent: 'Bến 3 · Phước Long', status: { label: 'Tạm ngưng', tone: 'warning' } },
  ],
  areaTree: [
    { name: 'Cảng Cát Lái', depth: 0, badge: { label: 'Cấp 1', tone: 'accent' } },
    { name: 'Bến 1', depth: 1 },
    { name: 'Bãi A1 – Container lạnh', depth: 2 },
    { name: 'Bãi A3 – Container rỗng', depth: 2 },
    { name: 'Bến 2 – Hàng tổng hợp', depth: 1 },
    { name: 'Cảng Phước Long', depth: 0, badge: { label: 'Cấp 1', tone: 'accent' } },
    { name: 'Kho CFS 1', depth: 1 },
    { name: 'Bãi C2 – Hàng rời', depth: 2, badge: { label: 'Tạm ngưng', tone: 'warning' } },
  ],
};

export const ACCOUNTING_DASHBOARD: AccountingDashboard = {
  greeting: 'Tài khoản đã sẵn sàng. Chức năng Kế toán sẽ hiển thị khi được cấp quyền.',
  actions: {},
  pending: {
    items: [],
    emptyText: 'Chưa có hồ sơ chờ xử lý – chức năng Bảng thanh toán, đối soát mở ở sprint sau.',
    unread: 1,
  },
  stats: [],
};

export const LEGAL_DASHBOARD: LegalDashboard = {
  greeting: 'Có 3 hợp đồng chờ rà soát pháp lý, 1 hồ sơ đến hạn xử lý hôm nay.',
  actions: {
    secondary: { label: 'Danh sách hợp đồng', to: '/hop-dong' },
    primary: { label: 'Bắt đầu rà soát', to: '/phe-duyet/cho-ra-soat' },
  },
  pending: {
    items: [
      { count: 3, label: 'hợp đồng chờ rà soát pháp lý' },
      { count: 1, label: 'phụ lục chờ rà soát' },
      { count: 1, label: 'hồ sơ quá hạn rà soát' },
    ],
    unread: 4,
    viewAllTo: '/phe-duyet/cho-ra-soat',
  },
  stats: [
    { label: 'Chờ rà soát', value: '3', hint: 'Bước 2/3 · Pháp chế', icon: 'shield' },
    { label: 'Đã chấp thuận tháng này', value: '9', hint: 'Đã chuyển Ban Giám đốc', icon: 'check' },
    { label: 'Yêu cầu chỉnh sửa', value: '2', hint: 'Đã trả về NV Kinh doanh', icon: 'edit' },
    { label: 'Đến hạn hôm nay', value: '1', hint: 'Cần xử lý trước 17:00', icon: 'alert' },
  ],
  reviews: [
    { code: 'HD-2026-013', customer: 'CTCP Cảng Sao Biển', service: 'Khai thác bến container', approvedBy: 'Lê Thị Hồng', approvedAt: '25/10/2026', deadline: { label: 'Hôm nay', tone: 'danger' } },
    { code: 'HD-2026-007', customer: 'TNHH Thủy sản Minh Hải', service: 'Lưu kho lạnh · kèm phụ lục giá', approvedBy: 'Lê Thị Hồng', approvedAt: '26/10/2026', deadline: { label: '29/10/2026', tone: 'warning' } },
    { code: 'HD-2026-006', customer: 'Tổng công ty Hàng hải ABC', service: 'Hợp đồng khung 24 tháng', approvedBy: 'Lê Thị Hồng', approvedAt: '27/10/2026', deadline: { label: '31/10/2026', tone: 'neutral' } },
  ],
  quickLinks: [
    { label: 'Hợp đồng chờ rà soát', icon: 'shield', to: '/phe-duyet/cho-ra-soat' },
    { label: 'Danh sách hợp đồng', icon: 'file', to: '/hop-dong' },
    { label: 'Lịch sử phê duyệt', icon: 'history', to: '/phe-duyet/lich-su' },
  ],
  activities: [
    { title: 'Bạn yêu cầu chỉnh sửa HD-2026-014', meta: 'Thiếu điều khoản bồi thường · 28/10 10:15', tone: 'warning' },
    { title: 'Bạn chấp thuận HD-2026-009', meta: 'Đã chuyển Ban Giám đốc · 27/10 16:40', tone: 'success' },
    { title: 'HD-2026-011 được trình lại', meta: 'Sau chỉnh sửa theo yêu cầu · 27/10 09:05', tone: 'info' },
  ],
};

export const DIRECTOR_DASHBOARD: DirectorDashboard = {
  greeting: '2 hợp đồng đã qua Kinh doanh và Pháp chế, đang chờ quyết định của Ban Giám đốc.',
  actions: {
    secondary: { label: 'Danh sách hợp đồng', to: '/hop-dong' },
    primary: { label: 'Phê duyệt hồ sơ', to: '/phe-duyet/cho-phe-duyet' },
  },
  pending: {
    items: [
      { count: 2, label: 'hợp đồng chờ phê duyệt' },
      { count: 1, label: 'bảng giá chờ phê duyệt' },
      { count: 1, label: 'hồ sơ chờ ký điện tử' },
    ],
    unread: 2,
    viewAllTo: '/phe-duyet/cho-phe-duyet',
  },
  stats: [
    { label: 'Chờ phê duyệt', value: '2', hint: 'Bước 3/3 · Ban Giám đốc', icon: 'inbox' },
    { label: 'Đã phê duyệt tháng này', value: '7', hint: 'Hợp đồng chuyển Approved', icon: 'check' },
    { label: 'Từ chối', value: '1', hint: 'Trong tháng 10/2026', icon: 'alert' },
    { label: 'Thời gian duyệt TB', value: '2,4 ngày', hint: 'Từ lúc trình đến Approved', icon: 'clock' },
  ],
  approvals: [
    { code: 'HD-2026-009', customer: 'TNHH Thép Nam Việt', service: 'Bốc xếp hàng rời', value: '4,8 tỷ ₫', term: '12 tháng' },
    { code: 'HD-2026-005', customer: 'CTCP Dầu khí Phương Nam', service: 'Thuê bãi & vận hành thiết bị', value: '12,5 tỷ ₫', term: '24 tháng' },
  ],
  results: [
    { title: 'HD-2026-010 · Logistics Đông Á đã được phê duyệt', meta: 'Trần Quốc Bảo · 22/10/2026 15:20', tone: 'success' },
    { title: 'HD-2026-004 · Vận tải Bắc Nam bị từ chối', meta: 'Giá trị vượt hạn mức đã phê duyệt · 18/10/2026', tone: 'danger' },
    { title: 'HD-2026-003 · Cảng Phước Long đã được phê duyệt', meta: 'Trần Quốc Bảo · 15/10/2026 10:05', tone: 'success' },
  ],
  progress: {
    code: 'HD-2026-005',
    customer: 'CTCP Dầu khí Phương Nam',
    steps: [
      { title: 'Trưởng phòng Kinh doanh', meta: 'Lê Thị Hồng · 20/10', state: 'done', badge: { label: 'Đã duyệt', tone: 'success' } },
      { title: 'Pháp chế', meta: 'Phạm Minh Đức · 24/10', state: 'done', badge: { label: 'Đã duyệt', tone: 'success' } },
      { title: 'Ban Giám đốc', meta: 'Đang chờ bạn quyết định', state: 'current', badge: { label: 'Đang xử lý', tone: 'accent' } },
    ],
  },
  quickLinks: [
    { label: 'Hồ sơ chờ phê duyệt', icon: 'inbox', to: '/phe-duyet/cho-phe-duyet' },
    { label: 'Danh sách hợp đồng', icon: 'file', to: '/hop-dong' },
    { label: 'Lịch sử phê duyệt', icon: 'history', to: '/phe-duyet/lich-su' },
  ],
};

export const ADMIN_DASHBOARD: AdminDashboard = {
  greeting: 'Hệ thống có 42 tài khoản thuộc 6 phòng ban; 1 quy trình hợp đồng đang áp dụng.',
  actions: {
    secondary: { label: 'Nhật ký hệ thống', to: '/quan-tri/nhat-ky' },
    primary: { label: '+ Tạo tài khoản', to: '/quan-tri/tai-khoan' },
  },
  pending: {
    items: [
      { count: 2, label: 'tài khoản chờ gán vai trò' },
      { count: 1, label: 'tài khoản đang tạm khóa' },
      { count: 1, label: 'quy trình nháp chờ kích hoạt' },
    ],
    unread: 1,
    viewAllTo: '/quan-tri/tai-khoan',
  },
  stats: [
    { label: 'Tài khoản', value: '42', hint: 'Thuộc 6 phòng ban', icon: 'users' },
    { label: 'Tài khoản bị khóa', value: '2', hint: 'Đăng nhập sai quá số lần', icon: 'lock' },
    { label: 'Quy trình đang áp dụng', value: '1', hint: 'Hợp đồng · 3 bước', icon: 'workflow' },
    { label: 'Sự kiện audit hôm nay', value: '318', hint: 'Cập nhật lúc 09:45', icon: 'activity' },
  ],
  users: [
    { username: 'an.nv', fullName: 'Nguyễn Văn An', email: 'an.nv@abc.vn', department: { name: 'Kinh doanh', color: 'var(--dept-kinh-doanh)' }, role: 'Nhân viên Kinh doanh', status: { label: 'Hoạt động', tone: 'success' } },
    { username: 'hong.lt', fullName: 'Lê Thị Hồng', email: 'hong.lt@abc.vn', department: { name: 'Kinh doanh', color: 'var(--dept-kinh-doanh)' }, role: 'Trưởng phòng Kinh doanh', status: { label: 'Hoạt động', tone: 'success' } },
    { username: 'duc.pm', fullName: 'Phạm Minh Đức', email: 'duc.pm@abc.vn', department: { name: 'Pháp chế', color: 'var(--dept-phap-che)' }, role: 'Nhân viên Pháp chế', status: { label: 'Hoạt động', tone: 'success' } },
    { username: 'bao.tq', fullName: 'Trần Quốc Bảo', email: 'bao.tq@abc.vn', department: { name: 'Ban Giám đốc', color: 'var(--dept-bgd)' }, role: 'Giám đốc', status: { label: 'Hoạt động', tone: 'success' } },
    { username: 'son.vt', fullName: 'Võ Thanh Sơn', email: 'son.vt@abc.vn', department: { name: 'Khai thác', color: 'var(--dept-khai-thac)' }, role: 'Trưởng phòng Khai thác', status: { label: 'Hoạt động', tone: 'success' } },
    { username: 'ha.bt', fullName: 'Bùi Thu Hà', email: 'ha.bt@abc.vn', department: { name: 'Kế toán', color: 'var(--dept-ke-toan)' }, role: 'Nhân viên Kế toán', status: { label: 'Hoạt động', tone: 'success' } },
    { username: 'quan.tm', fullName: 'Trần Minh Quân', email: 'quan.tm@abc.vn', department: { name: 'Kinh doanh', color: 'var(--dept-kinh-doanh)' }, role: 'Nhân viên Kinh doanh', status: { label: 'Bị khóa', tone: 'danger' } },
  ],
  workflow: {
    title: 'Quy trình phê duyệt Hợp đồng',
    version: 'Phiên bản 1 · Đang áp dụng từ 25/10/2026',
    steps: [
      { title: 'Trưởng phòng Kinh doanh', description: 'Giao cho TP KD phụ trách khách hàng' },
      { title: 'Pháp chế', description: 'Giao cho Nhân viên Pháp chế được phân công' },
      { title: 'Ban Giám đốc', description: 'Giao cho thành viên BGĐ có thẩm quyền' },
    ],
  },
  auditLog: [
    { title: 'an.nv tạo khách hàng KH-000312', meta: 'Hôm nay 09:42 · Khách hàng', tone: 'info' },
    { title: 'quan.tm bị khóa tài khoản', meta: 'Hôm nay 08:10 · Sai mật khẩu 5 lần', tone: 'danger' },
    { title: 'hong.lt chấp thuận HD-2026-013', meta: '25/10 · Phê duyệt bước 1', tone: 'success' },
  ],
};

const DASHBOARD_BY_WORKSPACE: Record<WorkspaceKey, DashboardBase> = {
  'kinh-doanh': SALES_DASHBOARD,
  'khai-thac': OPERATIONS_DASHBOARD,
  'ke-toan': ACCOUNTING_DASHBOARD,
  'phap-che': LEGAL_DASHBOARD,
  bgd: DIRECTOR_DASHBOARD,
  'quan-tri': ADMIN_DASHBOARD,
};

/** Phần chung của trang làm việc: lời chào, nút thao tác, hồ sơ chờ xử lý, thẻ chỉ số. */
export function getDashboardBase(workspace: WorkspaceKey): DashboardBase {
  return DASHBOARD_BY_WORKSPACE[workspace];
}

export function getUnreadCount(workspace: WorkspaceKey): number {
  return DASHBOARD_BY_WORKSPACE[workspace].pending.unread;
}

/** Tra nhanh thông tin hợp đồng mẫu cho trang giữ chỗ chi tiết hồ sơ. */
export function findSeedContract(code: string): { code: string; customer: string; service: string } | undefined {
  const rows = [...SALES_DASHBOARD.contracts, ...LEGAL_DASHBOARD.reviews, ...DIRECTOR_DASHBOARD.approvals];
  return rows.find((row) => row.code === code);
}
