import { Link } from 'react-router-dom';
import type { CurrentUser } from '@/app/providers/AuthProvider';
import { ButtonLink } from '@/components/button/Button';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { Icon } from '@/components/icon/Icon';
import { StatusBadge } from '@/components/status-badge/StatusBadge';
import { ACCOUNT_NAV } from '@/constants/navigation';
import { ROUTES } from '@/constants/routes';
import {
  ADMIN_DASHBOARD,
  DIRECTOR_DASHBOARD,
  LEGAL_DASHBOARD,
  OPERATIONS_DASHBOARD,
  SALES_DASHBOARD,
} from '@/mocks/seed/dashboards';
import { formatDateTime } from '@/utils/format';
import type { ApprovalRow, AreaRow, ContractRow, LegalReviewRow, UserRow } from '../types/dashboard';
import {
  ActivityCard,
  AreaTreeCard,
  PanelCard,
  ProgressCard,
  QuickLinksCard,
  TableCard,
  WorkflowCard,
} from './DashboardCards';

function CodeLink({ code, to }: { code: string; to: string }) {
  return (
    <Link to={to} className="cell-code">
      {code}
    </Link>
  );
}

function Stack({ primary, secondary }: { primary: string; secondary: string }) {
  return (
    <div className="cell-stack">
      <span className="cell-stack__primary">{primary}</span>
      <span className="cell-stack__secondary">{secondary}</span>
    </div>
  );
}

/* ---------- 05.1 · Kinh doanh ---------- */

const CONTRACT_COLUMNS: Column<ContractRow>[] = [
  { key: 'code', header: 'Mã hợp đồng', width: 120, render: (r) => <CodeLink code={r.code} to={ROUTES.contractDetail(r.code)} /> },
  { key: 'customer', header: 'Khách hàng', render: (r) => <Stack primary={r.customer} secondary={r.service} /> },
  { key: 'status', header: 'Trạng thái', width: 180, render: (r) => <StatusBadge label={r.status.label} tone={r.status.tone} /> },
  { key: 'updated', header: 'Cập nhật', width: 90, render: (r) => r.updatedAt },
  {
    key: 'action',
    header: '',
    width: 116,
    align: 'end',
    render: (r) => (
      <ButtonLink to={ROUTES.contractDetail(r.code)} variant={r.action.variant}>
        {r.action.label}
      </ButtonLink>
    ),
  },
];

export function SalesWorkspace() {
  const data = SALES_DASHBOARD;
  return (
    <div className="dash-main">
      <div className="dash-main__primary">
        <TableCard title="Hợp đồng của tôi" subtitle="Hồ sơ do bạn phụ trách, mới cập nhật gần nhất" viewAllTo="/hop-dong">
          <DataTable columns={CONTRACT_COLUMNS} rows={data.contracts} rowKey={(r) => r.code} />
        </TableCard>
      </div>
      <div className="dash-main__side">
        <QuickLinksCard links={data.quickLinks} />
        <ProgressCard progress={data.progress} />
      </div>
    </div>
  );
}

/* ---------- 05.2 · Khai thác ---------- */

const AREA_COLUMNS: Column<AreaRow>[] = [
  { key: 'code', header: 'Mã khu vực', width: 120, render: (r) => <CodeLink code={r.code} to="/khu-vuc" /> },
  { key: 'name', header: 'Tên khu vực', render: (r) => <Stack primary={r.name} secondary={r.change} /> },
  { key: 'level', header: 'Cấp', width: 70, render: (r) => r.level },
  { key: 'parent', header: 'Khu vực cha', width: 170, render: (r) => r.parent },
  { key: 'status', header: 'Trạng thái', width: 110, align: 'end', render: (r) => <StatusBadge label={r.status.label} tone={r.status.tone} /> },
];

export function OperationsWorkspace() {
  const data = OPERATIONS_DASHBOARD;
  return (
    <div className="dash-main">
      <div className="dash-main__primary">
        <TableCard title="Khu vực cập nhật gần đây" subtitle="Tạo mới hoặc chỉnh sửa thông số trong 7 ngày qua" viewAllTo="/khu-vuc">
          <DataTable columns={AREA_COLUMNS} rows={data.areas} rowKey={(r) => r.code} />
        </TableCard>
      </div>
      <div className="dash-main__side">
        <AreaTreeCard nodes={data.areaTree} />
      </div>
    </div>
  );
}

/* ---------- 05.3 · Kế toán ---------- */

export function AccountingWorkspace({ user }: { user: CurrentUser }) {
  const fields = [
    { label: 'Họ tên', value: user.fullName },
    { label: 'Tài khoản', value: user.username },
    { label: 'Phòng ban', value: user.departmentInfo.name },
    { label: 'Vai trò', value: user.primaryRole.name },
    { label: 'Đăng nhập gần nhất', value: formatDateTime(user.signedInAt) },
  ];

  return (
    <div className="dash-main">
      <div className="dash-main__primary">
        <section className="card empty-card">
          <span className="icon-box">
            <Icon name="inbox" size={30} />
          </span>
          <p className="empty-card__title">Chưa có chức năng nghiệp vụ được cấp</p>
          <p className="empty-card__body">
            Tài khoản {user.primaryRole.name} hiện chỉ có quyền truy cập chung: xem thông báo, đổi mật khẩu và đăng
            xuất. Liên hệ Quản trị hệ thống nếu bạn cần thêm quyền.
          </p>
          <div className="empty-card__action">
            <ButtonLink to={ACCOUNT_NAV.contactAdmin.path} variant="secondary">
              {ACCOUNT_NAV.contactAdmin.label}
            </ButtonLink>
          </div>
        </section>
      </div>
      <div className="dash-main__side">
        <PanelCard title="Thông tin tài khoản" className="account-card">
          {fields.map((field) => (
            <div key={field.label} className="account-field">
              <span className="account-field__label">{field.label}</span>
              <span className="account-field__value">{field.value}</span>
            </div>
          ))}
          <div>
            <ButtonLink to={ACCOUNT_NAV.changePassword.path} variant="secondary">
              Đổi mật khẩu
            </ButtonLink>
          </div>
        </PanelCard>
      </div>
    </div>
  );
}

/* ---------- 05.4 · Pháp chế ---------- */

const LEGAL_COLUMNS: Column<LegalReviewRow>[] = [
  { key: 'code', header: 'Mã hợp đồng', width: 120, render: (r) => <CodeLink code={r.code} to={ROUTES.contractDetail(r.code)} /> },
  { key: 'customer', header: 'Khách hàng', render: (r) => <Stack primary={r.customer} secondary={r.service} /> },
  { key: 'approved', header: 'TP KD chấp thuận', width: 140, render: (r) => <Stack primary={r.approvedBy} secondary={r.approvedAt} /> },
  { key: 'deadline', header: 'Hạn xử lý', width: 130, render: (r) => <StatusBadge label={r.deadline.label} tone={r.deadline.tone} /> },
  {
    key: 'action',
    header: '',
    width: 90,
    align: 'end',
    render: (r) => <ButtonLink to={ROUTES.contractDetail(r.code)}>Rà soát</ButtonLink>,
  },
];

export function LegalWorkspace() {
  const data = LEGAL_DASHBOARD;
  return (
    <div className="dash-main">
      <div className="dash-main__primary">
        <TableCard
          title="Hợp đồng chờ rà soát pháp lý"
          subtitle="Đã được Trưởng phòng Kinh doanh chấp thuận"
          viewAllTo="/phe-duyet/cho-ra-soat"
        >
          <DataTable columns={LEGAL_COLUMNS} rows={data.reviews} rowKey={(r) => r.code} />
        </TableCard>
      </div>
      <div className="dash-main__side">
        <QuickLinksCard links={data.quickLinks} />
        <ActivityCard title="Hoạt động gần đây" items={data.activities} />
      </div>
    </div>
  );
}

/* ---------- 05.5 · Ban Giám đốc ---------- */

const APPROVAL_COLUMNS: Column<ApprovalRow>[] = [
  { key: 'code', header: 'Mã hợp đồng', width: 120, render: (r) => <CodeLink code={r.code} to={ROUTES.contractDetail(r.code)} /> },
  { key: 'customer', header: 'Khách hàng', render: (r) => <Stack primary={r.customer} secondary={r.service} /> },
  { key: 'value', header: 'Giá trị ước tính', width: 130, render: (r) => r.value },
  { key: 'term', header: 'Thời hạn', width: 90, render: (r) => r.term },
  {
    key: 'action',
    header: '',
    width: 150,
    align: 'end',
    render: (r) => <ButtonLink to={ROUTES.contractDetail(r.code)}>Xem &amp; phê duyệt</ButtonLink>,
  },
];

export function DirectorWorkspace() {
  const data = DIRECTOR_DASHBOARD;
  return (
    <div className="dash-main">
      <div className="dash-main__primary">
        <TableCard
          title="Hợp đồng chờ phê duyệt"
          subtitle="Đã qua Trưởng phòng Kinh doanh và Pháp chế"
          viewAllTo="/phe-duyet/cho-phe-duyet"
        >
          <DataTable columns={APPROVAL_COLUMNS} rows={data.approvals} rowKey={(r) => r.code} />
        </TableCard>
        <ActivityCard title="Kết quả phê duyệt gần đây" items={data.results} />
      </div>
      <div className="dash-main__side">
        <ProgressCard progress={data.progress} />
        <QuickLinksCard links={data.quickLinks} />
      </div>
    </div>
  );
}

/* ---------- 05.6 · Quản trị hệ thống ---------- */

const USER_COLUMNS: Column<UserRow>[] = [
  { key: 'username', header: 'Tài khoản', width: 90, render: (r) => <CodeLink code={r.username} to="/quan-tri/tai-khoan" /> },
  { key: 'name', header: 'Họ tên', render: (r) => <Stack primary={r.fullName} secondary={r.email} /> },
  {
    key: 'department',
    header: 'Phòng ban',
    width: 130,
    render: (r) => (
      <span className="dept-badge">
        <span className="dept-badge__dot" style={{ background: r.department.color }} />
        {r.department.name}
      </span>
    ),
  },
  { key: 'role', header: 'Vai trò', width: 170, render: (r) => r.role },
  { key: 'status', header: 'Trạng thái', width: 100, align: 'end', render: (r) => <StatusBadge label={r.status.label} tone={r.status.tone} /> },
];

export function AdminWorkspace() {
  const data = ADMIN_DASHBOARD;
  return (
    <div className="dash-main">
      <div className="dash-main__primary">
        <TableCard
          title="Tài khoản người dùng"
          subtitle="Mỗi tài khoản gắn với một phòng ban và vai trò"
          viewAllTo="/quan-tri/tai-khoan"
        >
          <DataTable columns={USER_COLUMNS} rows={data.users} rowKey={(r) => r.username} />
        </TableCard>
      </div>
      <div className="dash-main__side">
        <WorkflowCard {...data.workflow} editTo="/quan-tri/quy-trinh" />
        <ActivityCard title="Nhật ký gần đây" items={data.auditLog} />
      </div>
    </div>
  );
}
