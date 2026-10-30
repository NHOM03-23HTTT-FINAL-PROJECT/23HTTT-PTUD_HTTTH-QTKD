import type { IconName } from '@/components/icon/Icon';
import type { BadgeTone } from '@/components/status-badge/StatusBadge';

export type LinkAction = { label: string; to: string };

export type HeaderActions = {
  secondary?: LinkAction;
  primary?: LinkAction;
};

/** Khối "Hồ sơ chờ tôi xử lý" luôn có trên trang làm việc (ghi chú hàng 05.x). */
export type PendingTasks = {
  items: { count: number; label: string }[];
  emptyText?: string;
  unread: number;
  viewAllTo?: string;
};

export type StatItem = {
  label: string;
  value: string;
  hint: string;
  icon: IconName;
};

export type Badge = { label: string; tone: BadgeTone };

export type QuickLink = { label: string; icon: IconName; to: string };

export type ActivityItem = { title: string; meta: string; tone: 'success' | 'warning' | 'info' | 'danger' };

export type ProgressStep = {
  title: string;
  meta: string;
  state: 'done' | 'current' | 'waiting';
  badge: Badge;
};

export type ContractProgress = {
  code: string;
  customer: string;
  steps: ProgressStep[];
};

export type DashboardBase = {
  greeting: string;
  actions: HeaderActions;
  pending: PendingTasks;
  stats: StatItem[];
};

export type ContractRow = {
  code: string;
  customer: string;
  service: string;
  status: Badge;
  updatedAt: string;
  action: { label: string; variant: 'secondary' | 'ghost' };
};

export type SalesDashboard = DashboardBase & {
  contracts: ContractRow[];
  quickLinks: QuickLink[];
  progress: ContractProgress;
};

export type AreaRow = {
  code: string;
  name: string;
  change: string;
  level: string;
  parent: string;
  status: Badge;
};

export type AreaTreeNode = {
  name: string;
  depth: 0 | 1 | 2;
  badge?: Badge;
};

export type OperationsDashboard = DashboardBase & {
  areas: AreaRow[];
  areaTree: AreaTreeNode[];
};

export type AccountingDashboard = DashboardBase;

export type LegalReviewRow = {
  code: string;
  customer: string;
  service: string;
  approvedBy: string;
  approvedAt: string;
  deadline: Badge;
};

export type LegalDashboard = DashboardBase & {
  reviews: LegalReviewRow[];
  quickLinks: QuickLink[];
  activities: ActivityItem[];
};

export type ApprovalRow = {
  code: string;
  customer: string;
  service: string;
  value: string;
  term: string;
};

export type DirectorDashboard = DashboardBase & {
  approvals: ApprovalRow[];
  results: ActivityItem[];
  progress: ContractProgress;
  quickLinks: QuickLink[];
};

export type UserRow = {
  username: string;
  fullName: string;
  email: string;
  department: { name: string; color: string };
  role: string;
  status: Badge;
};

export type WorkflowStep = { title: string; description: string };

export type AdminDashboard = DashboardBase & {
  users: UserRow[];
  workflow: { title: string; version: string; steps: WorkflowStep[] };
  auditLog: ActivityItem[];
};
