/** Khớp AuditLogItem của BE (GET /audit-logs). Thời điểm là ISO 8601 UTC. */
export type AuditLogItem = {
  id: string;
  actedAt: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  /** Mã hợp đồng hoặc khu vực còn tồn tại; null khi đối tượng đã mất hoặc thuộc loại khác. */
  entityCode: string | null;
  statusBefore: string | null;
  statusAfter: string | null;
  ipAddress: string | null;
};

export type AuditLogPage = {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
  /** Khoảng thời gian thực sự đã tra; null khi tra theo đối tượng không giới hạn thời gian (A1). */
  from: string | null;
  to: string | null;
};

export type AuditFieldChange = { field: string; before: unknown; after: unknown };

export type AuditLogDetail = AuditLogItem & {
  note: string | null;
  changes: AuditFieldChange[];
  valueBefore: unknown;
  valueAfter: unknown;
};

export type AuditFilterOptions = {
  entityTypes: string[];
  actions: string[];
  actors: { id: string; name: string }[];
};

/** Bộ lọc người dùng nhập. Chuỗi rỗng nghĩa là không lọc theo trường đó. */
export type AuditFilters = {
  /** Ngày dạng YYYY-MM-DD theo giờ địa phương. */
  fromDate: string;
  toDate: string;
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  page: number;
  pageSize: number;
};

export const EMPTY_AUDIT_FILTERS: AuditFilters = {
  fromDate: '', toDate: '', actorId: '', entityType: '', entityId: '', action: '', page: 1, pageSize: 20,
};
