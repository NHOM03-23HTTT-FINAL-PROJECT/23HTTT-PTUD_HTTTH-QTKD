import type { SessionCheck } from '@/features/auth/types/auth';

export type AreaStatus = 'active' | 'suspended';

/** Cấp logic trong sơ đồ mặt bằng: Cảng/ICD → Bãi/Kho/Cầu bến → Phân khu/Block (ARE-03). */
export type AreaLevel = 1 | 2 | 3;

export type AreaTypeCode = 'CANG' | 'CAU_BEN' | 'BAI_CY' | 'KHO_CFS' | 'KHO_LANH' | 'BAI_PHU';

export type CapacityUnit = 'TEU' | 'Tấn';

/** Dữ liệu người dùng nhập trên biểu mẫu tạo khu vực (frame 01.1). Số giữ dạng văn bản để báo lỗi đúng nội dung đã nhập. */
export type AreaDraft = {
  /** Để trống thì hệ thống cấp mã dạng KV-000128 (A4). */
  code: string;
  name: string;
  /** Mã loại mặt bằng trong danh mục, rỗng khi chưa chọn. */
  type: AreaTypeCode | '';
  /** Mã khu vực cấp cha, rỗng khi là khu vực Cấp 1 độc lập (UC-ARE-02 – A3). */
  parentCode: string;
  gps: string;
  areaSize: string;
  capacity: string;
  capacityUnit: CapacityUnit;
  standards: string;
};

export type AreaField = keyof AreaDraft;

export type AreaFieldErrors = Partial<Record<AreaField, string>>;

/** Nhóm hành động trên tab Lịch sử biến động (13.7). */
export type AreaHistoryKind = 'create' | 'update' | 'status' | 'assignment';

/** Trường được ghi trước → sau trong nhật ký; `parentCode` gồm cả đổi khu vực cấp cha (UC-ARE-02). */
export type AreaFieldChange = {
  field: AreaField;
  /** Giá trị đã định dạng để hiển thị, ví dụ "85.000 m²". */
  before: string;
  after: string;
};

export type AreaHistoryEntry = {
  kind: AreaHistoryKind;
  action: string;
  by: string;
  byTitle: string;
  at: string;
  /** Phiên bản hồ sơ sau thao tác; thao tác nhân sự/dịch vụ không đổi phiên bản. */
  version: number;
  /** Nội dung ghi Audit log (ARE-11): thông số ban đầu, đường dẫn trước/sau… */
  detail: string;
  changes?: AreaFieldChange[];
  reason?: string;
  /** Idempotency-Key của yêu cầu, để trả lại đúng kết quả khi thử lại. */
  requestId?: string;
};

/** Hồ sơ khu vực đã lưu: cấp và đường dẫn phân cấp do hệ thống tính. */
export type Area = {
  /** AreaId bất biến; mã khu vực có thể đổi khi chưa phát sinh giao dịch (04.8). */
  id: string;
  code: string;
  name: string;
  type: AreaTypeCode;
  parentCode: string | null;
  level: AreaLevel;
  /** HierarchyPath, ví dụ /KV-CL/KV-CL-B1/KV-CL-B1-A3. */
  path: string;
  gps: string;
  /** Diện tích mặt bằng (m²). */
  areaSize: number | null;
  capacity: number | null;
  capacityUnit: CapacityUnit;
  standards: string;
  status: AreaStatus;
  version: number;
  createdAt: string;
  createdBy: string;
  createdByTitle: string;
  history: AreaHistoryEntry[];
};

/** Một dòng đối chiếu đường dẫn trước → sau khi đổi khu vực cấp cha (02.7). */
export type AreaPathChange = {
  code: string;
  name: string;
  levelBefore: AreaLevel;
  level: AreaLevel;
  pathBefore: string;
  path: string;
};

export type AreaRef = Pick<Area, 'code' | 'name'>;

type SessionEnded = Exclude<SessionCheck['status'], 'active'>;

/* ---------- UC-ARE-01 · Tạo mới khu vực ---------- */

export type CreateAreaRequest = {
  userId: string;
  signedInAt: string;
  /** Giữ nguyên qua các lần thử lại của cùng một biểu mẫu để không tạo hồ sơ trùng (01.5). */
  idempotencyKey: string;
  draft: AreaDraft;
};

export type CreateAreaResult = {
  area: Area;
  /** Hồ sơ đã được ghi ở lần gửi trước, không tạo thêm. */
  replayed: boolean;
};

/** Lý do khu vực không được chọn làm khu vực cấp cha (ARE-03 / chống vòng lặp). */
export type ParentRejection = 'MAX_LEVEL' | 'SUBTREE_TOO_DEEP' | 'SELF' | 'DESCENDANT' | 'CURRENT_PARENT' | 'NOT_FOUND';

export type CreateAreaErrorCode =
  | 'VALIDATION' // 01.2 – BE kiểm tra lại
  | 'DUPLICATE_CODE' // ARE-01
  | 'DUPLICATE_NAME' // 01.3 – ARE-02
  | 'INVALID_PARENT' // 02.4 – ARE-03
  | 'SAVE_FAILED' // 01.5 – lỗi kết nối CSDL
  | 'NETWORK'
  | 'FORBIDDEN'
  | 'SESSION_ENDED';

export class CreateAreaError extends Error {
  readonly code: CreateAreaErrorCode;
  readonly fieldErrors?: AreaFieldErrors;
  /** Khu vực đang giữ mã hoặc tên bị trùng. */
  readonly existing?: AreaRef;
  /** Khu vực cấp cha của nhóm bị trùng tên; không có khi trùng giữa các khu vực Cấp 1. */
  readonly parent?: AreaRef;
  readonly parentRejection?: ParentRejection;
  readonly sessionStatus?: SessionEnded;

  constructor(
    code: CreateAreaErrorCode,
    extra: Pick<CreateAreaError, 'fieldErrors' | 'existing' | 'parent' | 'parentRejection' | 'sessionStatus'> = {},
  ) {
    super(code);
    this.name = 'CreateAreaError';
    this.code = code;
    this.fieldErrors = extra.fieldErrors;
    this.existing = extra.existing;
    this.parent = extra.parent;
    this.parentRejection = extra.parentRejection;
    this.sessionStatus = extra.sessionStatus;
  }
}

/* ---------- UC-ARE-02 · Đổi khu vực cấp cha (ngữ cảnh chỉnh sửa) ---------- */

export type ChangeAreaParentRequest = {
  userId: string;
  signedInAt: string;
  idempotencyKey: string;
  code: string;
  /** Phiên bản đang xem, để không ghi đè thay đổi của người khác. */
  baseVersion: number;
  parentCode: string;
};

export type ChangeAreaParentResult = {
  area: Area;
  /** Khu vực được điều chỉnh và các phân khu con được đồng bộ đường dẫn. */
  changes: AreaPathChange[];
  previousParent: AreaRef | null;
  replayed: boolean;
};

export type ChangeAreaParentErrorCode =
  | 'INVALID_PARENT'
  | 'DUPLICATE_NAME'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'SAVE_FAILED'
  | 'NETWORK'
  | 'FORBIDDEN'
  | 'SESSION_ENDED';

export class ChangeAreaParentError extends Error {
  readonly code: ChangeAreaParentErrorCode;
  readonly existing?: AreaRef;
  readonly parentRejection?: ParentRejection;
  readonly sessionStatus?: SessionEnded;

  constructor(
    code: ChangeAreaParentErrorCode,
    extra: Pick<ChangeAreaParentError, 'existing' | 'parentRejection' | 'sessionStatus'> = {},
  ) {
    super(code);
    this.name = 'ChangeAreaParentError';
    this.code = code;
    this.existing = extra.existing;
    this.parentRejection = extra.parentRejection;
    this.sessionStatus = extra.sessionStatus;
  }
}

/* ---------- UC-ARE-04 · Cập nhật thông tin khu vực ---------- */

/** Số hồ sơ kinh doanh đang tham chiếu khu vực – có tham chiếu thì khóa mã (ARE-07). */
export type AreaReferences = {
  priceLists: number;
  contracts: number;
  outputPeriods: number;
};

export type UpdateAreaRequest = {
  userId: string;
  signedInAt: string;
  idempotencyKey: string;
  /** Mã khu vực lúc mở biểu mẫu. */
  code: string;
  baseVersion: number;
  draft: AreaDraft;
  reason: string;
};

export type UpdateAreaResult = {
  area: Area;
  changes: AreaFieldChange[];
  /** Có khi đổi khu vực cấp cha hoặc mã khu vực: đường dẫn của khu vực và phân khu con được đồng bộ. */
  pathChanges: AreaPathChange[];
  previousParent: AreaRef | null;
  replayed: boolean;
};

/** Bản mới của người khác khi phiên bản đang sửa đã cũ (04.5). */
export type AreaConflict = {
  latest: Area;
  updatedBy: string;
  updatedAt: string;
};

export type UpdateAreaErrorCode =
  | 'VALIDATION' // 04.2
  | 'DUPLICATE_NAME' // 04.3 – ARE-02
  | 'CODE_LOCKED' // 04.4 – ARE-07
  | 'DUPLICATE_CODE' // 04.8 – ARE-01
  | 'INVALID_PARENT' // UC-ARE-02
  | 'CONFLICT' // 04.5
  | 'NO_CHANGES'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'SESSION_ENDED';

export class UpdateAreaError extends Error {
  readonly code: UpdateAreaErrorCode;
  readonly fieldErrors?: AreaFieldErrors;
  readonly existing?: AreaRef;
  readonly parent?: AreaRef;
  readonly references?: AreaReferences;
  readonly conflict?: AreaConflict;
  readonly parentRejection?: ParentRejection;
  readonly sessionStatus?: SessionEnded;

  constructor(
    code: UpdateAreaErrorCode,
    extra: Pick<
      UpdateAreaError,
      'fieldErrors' | 'existing' | 'parent' | 'references' | 'conflict' | 'parentRejection' | 'sessionStatus'
    > = {},
  ) {
    super(code);
    this.name = 'UpdateAreaError';
    this.code = code;
    this.fieldErrors = extra.fieldErrors;
    this.existing = extra.existing;
    this.parent = extra.parent;
    this.references = extra.references;
    this.conflict = extra.conflict;
    this.parentRejection = extra.parentRejection;
    this.sessionStatus = extra.sessionStatus;
  }
}

/* ---------- UC-ARE-13 · Thông tin liên kết của khu vực ---------- */

export type AreaService = { name: string; group: string; unit: string; since: string };

export type AreaStaff = { name: string; staffCode: string; title: string; shift: string; since: string; phone: string };

export type AreaPriceList = {
  code: string;
  customer: string;
  contract: string;
  services: string;
  from: string;
  to: string;
  status: 'active' | 'approved';
};

export type AreaContract = {
  code: string;
  customer: string;
  from: string;
  to: string;
  /** Sản lượng của hợp đồng tại khu vực trong kỳ gần nhất. */
  volume: number;
  volumeUnit: 'container' | 'TEU-ngày';
};

export type AreaOutput = {
  /** Kỳ sản lượng gần nhất, ví dụ "09/2026". */
  period: string;
  /** Số container nâng hạ trong kỳ. */
  lifts: number;
  storageTeuDays: number;
  /** Số kỳ sản lượng đã ghi nhận tại khu vực (tham chiếu ARE-07). */
  periods: number;
};

export type AreaRecordGroup = 'services' | 'staff' | 'priceLists' | 'contracts';

export type AreaRecordData = {
  services: AreaService[];
  staff: AreaStaff[];
  priceLists: AreaPriceList[];
  contracts: { items: AreaContract[]; output: AreaOutput | null };
};

export class AreaRecordsError extends Error {
  readonly group: AreaRecordGroup;

  constructor(group: AreaRecordGroup) {
    super('LOAD_FAILED');
    this.name = 'AreaRecordsError';
    this.group = group;
  }
}

/* ---------- Thao tác của Trưởng phòng Khai thác: phân công nhân sự, gán dịch vụ, tạm ngưng/mở lại ---------- */

/** Nhân viên Khai thác có thể được phân công phụ trách khu vực. */
export type StaffOption = Pick<AreaStaff, 'name' | 'staffCode' | 'phone'> & { defaultTitle: string };

/** Dịch vụ cảng trong danh mục dùng chung. */
export type ServiceOption = Omit<AreaService, 'since'>;

type OperationBase = { userId: string; signedInAt: string; code: string };

export type AssignStaffRequest = OperationBase & { staffCode: string; title: string; shift: string; since: string };

export type EndStaffRequest = OperationBase & { staffCode: string; reason: string };

export type SetServicesRequest = OperationBase & { serviceNames: string[]; since: string; reason: string };

export type ChangeAreaStatusRequest = OperationBase & {
  /** Phiên bản đang xem; trạng thái chỉ đổi trên đúng phiên bản này. */
  baseVersion: number;
  status: AreaStatus;
  reason: string;
};

export type AreaOperationErrorCode =
  | 'VALIDATION'
  | 'ALREADY_ASSIGNED' // nhân viên đã phụ trách khu vực
  | 'NO_CHANGES'
  | 'SAME_STATUS' // khu vực đã ở trạng thái yêu cầu
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'SESSION_ENDED';

export class AreaOperationError extends Error {
  readonly code: AreaOperationErrorCode;
  readonly sessionStatus?: SessionEnded;

  constructor(code: AreaOperationErrorCode, extra: Pick<AreaOperationError, 'sessionStatus'> = {}) {
    super(code);
    this.name = 'AreaOperationError';
    this.code = code;
    this.sessionStatus = extra.sessionStatus;
  }
}

/* ---------- UC-ARE-12 · Tra cứu khu vực (gồm Danh sách 01.0) ---------- */

export type AreaStatusFilter = AreaStatus | 'all';

export const AREA_PAGE_SIZE = 8;

export type AreaSearchQuery = {
  keyword: string;
  status: AreaStatusFilter;
  type: AreaTypeCode | '';
  parentCode: string;
  page: number;
};

export type AreaSearchRequest = AreaSearchQuery & {
  userId: string;
  signedInAt: string;
  /** Sơ đồ cây cần toàn bộ kết quả (không phân trang). */
  all?: boolean;
  /** Người dùng chọn "Tải lại trang" sau lỗi (12.5). */
  retry?: boolean;
};

export type AreaListItem = Pick<
  Area,
  'code' | 'name' | 'type' | 'parentCode' | 'level' | 'areaSize' | 'capacity' | 'capacityUnit' | 'status'
> & { childCount: number };

export type AreaSearchResult = {
  items: AreaListItem[];
  /** Khu vực cha không khớp điều kiện nhưng cần để dựng cây (chỉ có khi `all`). */
  context: AreaListItem[];
  total: number;
  page: number;
  size: number;
};

export class AreaSearchError extends Error {
  readonly code: 'FORBIDDEN' | 'SESSION_ENDED' | 'LOAD_FAILED';
  readonly sessionStatus?: SessionEnded;

  constructor(code: AreaSearchError['code'], extra: Pick<AreaSearchError, 'sessionStatus'> = {}) {
    super(code);
    this.name = 'AreaSearchError';
    this.code = code;
    this.sessionStatus = extra.sessionStatus;
  }
}
