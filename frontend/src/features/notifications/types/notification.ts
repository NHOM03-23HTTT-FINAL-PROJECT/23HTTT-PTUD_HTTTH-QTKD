/** Loại thông báo do BE suy ra từ nội dung; chỉ dùng làm nhãn hiển thị. */
export type NotificationKind =
  | 'General'
  | 'ReviewAssigned'
  | 'ReviewAssignmentRequired'
  | 'AssignmentRevoked'
  | 'ReviewRequired'
  | 'ApprovalResult'
  | 'RevisionRequested';

export type NotificationRecordType =
  | 'Contract'
  | 'PaymentStatement'
  | 'Customer'
  | 'Area'
  | 'PriceList'
  | 'VolumePeriod'
  | 'UserAccount';

/** GET /api/v1/notifications · một dòng trong hộp thư của chính người dùng. */
export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  recordType: NotificationRecordType;
  /** UUID hồ sơ khi dùng API; mã hồ sơ (ví dụ HD-2026-013) trong chế độ prototype. */
  recordId: string;
  recordTitle: string | null;
  content: string;
  isRead: boolean;
  createdAt: string;
};

export type NotificationFilter = 'all' | 'unread';

export type NotificationQuery = { filter: NotificationFilter; page: number; pageSize: number };

export type NotificationPage = {
  items: NotificationItem[];
  total: number;
  unreadCount: number;
  page: number;
  pageSize: number;
};
