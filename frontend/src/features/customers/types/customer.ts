import type { SessionCheck } from '@/features/auth/types/auth';
import type { ClosedRecord, ReactivationRecord, SuspensionRecord } from './customerStatus';

export type CustomerStatus = 'active' | 'suspended';

/** Một mục danh mục dùng chung (nhóm khách hàng, nhóm dịch vụ). */
export type CatalogOption = { code: string; label: string };

/** Dữ liệu nhân viên nhập trên biểu mẫu – 3 nhóm doanh nghiệp, liên hệ, hợp tác (frame 01.1). */
export type CustomerDraft = {
  name: string;
  /** Lưu dạng văn bản để giữ số 0 ở đầu. */
  taxCode: string;
  address: string;
  representative: string;
  contactName: string;
  contactTitle: string;
  phone: string;
  email: string;
  /** Mã nhóm khách hàng trong danh mục, rỗng khi chưa chọn. */
  customerGroup: string;
  /** Mã các nhóm dịch vụ quan tâm. */
  serviceGroups: string[];
};

export type CustomerField = keyof CustomerDraft;

export type CustomerFieldErrors = Partial<Record<CustomerField, string>>;

export type CustomerHistoryEntry = {
  action: string;
  by: string;
  at: string;
  /** Phiên bản hồ sơ sau thao tác. */
  version: number;
  /** Phiên bản trước thao tác, có khi thao tác làm tăng phiên bản (cập nhật, tạm ngưng…). */
  fromVersion?: number;
  /** Lý do hoặc căn cứ được lưu cùng lịch sử. */
  reason?: string;
  /** Trường thay đổi cùng giá trị trước/sau (UC-CUS-02). */
  changes?: CustomerChange[];
  /** Idempotency-Key của yêu cầu tạo ra mục lịch sử, để trả lại đúng kết quả khi thử lại. */
  requestId?: string;
  /** Chuyển trạng thái hợp tác (UC-CUS-03 / UC-CUS-04). */
  statusChange?: { from: CustomerStatus; to: CustomerStatus };
};

/** Trường nhân viên được sửa ở UC-CUS-02; mã KH, MST, trạng thái, người phụ trách chỉ đọc. */
export type EditableCustomerField = Exclude<CustomerField, 'taxCode'>;

export type EditableCustomerDraft = Omit<CustomerDraft, 'taxCode'>;

export type CustomerChange = {
  field: EditableCustomerField;
  before: string | string[];
  after: string | string[];
};

/** Hồ sơ đã lưu: thêm nhóm "Thông tin quản lý" do hệ thống gán. */
export type Customer = CustomerDraft & {
  code: string;
  status: CustomerStatus;
  ownerId: string;
  ownerName: string;
  version: number;
  createdAt: string;
  createdBy: string;
  history: CustomerHistoryEntry[];
  /** Quyết định tạm ngưng hiện hành, có khi khách hàng đang Tạm ngưng. */
  suspension?: SuspensionRecord;
  /** Lần kích hoạt lại gần nhất. */
  reactivation?: ReactivationRecord;
  /** Hồ sơ đã hết hiệu lực/đã hủy, không tự khôi phục khi kích hoạt lại. */
  closedRecords?: ClosedRecord[];
};

export type CreateCustomerRequest = {
  userId: string;
  signedInAt: string;
  /** Giữ nguyên qua các lần thử lại của cùng một biểu mẫu để không tạo hồ sơ trùng (A6.2 / A6.4). */
  idempotencyKey: string;
  draft: CustomerDraft;
};

export type CreateCustomerResult = {
  customer: Customer;
  /** Yêu cầu đã được xử lý ở lần gửi trước (ví dụ mất kết nối sau khi lưu), không tạo thêm hồ sơ. */
  replayed: boolean;
};

export type DuplicateCustomer = Pick<Customer, 'code' | 'name' | 'status' | 'taxCode'>;

export type CreateCustomerErrorCode =
  | 'VALIDATION' // A5.1 / A5.2 / A5.4 / A5.5 – BE kiểm tra lại
  | 'DUPLICATE_TAX_CODE' // A5.3 / A5.6 / A6.1
  | 'SAVE_FAILED' // A6.3
  | 'NETWORK' // A6.4
  | 'FORBIDDEN' // A5 – bị thu hồi quyền
  | 'SESSION_ENDED'; // A2 – phiên hết hạn hoặc bị thu hồi

export type UpdateCustomerRequest = {
  userId: string;
  signedInAt: string;
  /** Giữ nguyên qua các lần thử lại cùng một lần lưu (A6.3); đổi khi tải lại bản mới nhất. */
  idempotencyKey: string;
  code: string;
  /** Phiên bản đang sửa, để phát hiện người khác đã lưu trước (A5.3). */
  baseVersion: number;
  /** Chỉ gồm trường được sửa; gửi kèm mã KH/MST/trạng thái/người phụ trách sẽ bị từ chối (A5.4). */
  draft: EditableCustomerDraft;
  reason: string;
};

export type UpdateCustomerResult = {
  customer: Customer;
  changedFields: EditableCustomerField[];
  replayed: boolean;
};

export type CustomerConflict = {
  latest: Customer;
  updatedBy: string;
  updatedAt: string;
};

export type UpdateCustomerErrorCode =
  | 'VALIDATION' // A5.1 / A5.2
  | 'NO_CHANGES' // A6.1
  | 'CONFLICT' // A5.3
  | 'IMMUTABLE_FIELD' // A5.4
  | 'NOT_FOUND' // A5.5 – không tồn tại hoặc ngoài phạm vi
  | 'FORBIDDEN' // A5.5 – mất quyền
  | 'SAVE_FAILED' // A6.2
  | 'NETWORK' // A6.3
  | 'SESSION_ENDED';

export class UpdateCustomerError extends Error {
  readonly code: UpdateCustomerErrorCode;
  readonly fieldErrors?: CustomerFieldErrors;
  readonly conflict?: CustomerConflict;
  readonly sessionStatus?: Exclude<SessionCheck['status'], 'active'>;

  constructor(
    code: UpdateCustomerErrorCode,
    extra: Pick<UpdateCustomerError, 'fieldErrors' | 'conflict' | 'sessionStatus'> = {},
  ) {
    super(code);
    this.name = 'UpdateCustomerError';
    this.code = code;
    this.fieldErrors = extra.fieldErrors;
    this.conflict = extra.conflict;
    this.sessionStatus = extra.sessionStatus;
  }
}

export class CreateCustomerError extends Error {
  readonly code: CreateCustomerErrorCode;
  readonly fieldErrors?: CustomerFieldErrors;
  readonly existing?: DuplicateCustomer;
  readonly sessionStatus?: Exclude<SessionCheck['status'], 'active'>;

  constructor(
    code: CreateCustomerErrorCode,
    extra: Pick<CreateCustomerError, 'fieldErrors' | 'existing' | 'sessionStatus'> = {},
  ) {
    super(code);
    this.name = 'CreateCustomerError';
    this.code = code;
    this.fieldErrors = extra.fieldErrors;
    this.existing = extra.existing;
    this.sessionStatus = extra.sessionStatus;
  }
}
