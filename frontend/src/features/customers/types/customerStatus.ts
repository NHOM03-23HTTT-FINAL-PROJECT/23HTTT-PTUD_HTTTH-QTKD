import type { SessionCheck } from '@/features/auth/types/auth';
import type { Customer, CustomerStatus } from './customer';

/** Tệp căn cứ. Prototype chỉ giữ tên và dung lượng, chưa tải tệp lên máy chủ. */
export type AttachedFile = { name: string; size: number };

export type Department = 'Kinh doanh' | 'Khai thác' | 'Kế toán' | 'Pháp chế';

/** Thông báo quyết định tới bộ phận liên quan; gửi lỗi thì ghi nhận gửi lại, không hoàn tác quyết định (A9). */
export type DepartmentNotice = { department: Department; status: 'sent' | 'retry'; at: string };

export type ImpactKind = 'contract' | 'job' | 'service' | 'approval';

/** Một hồ sơ/công việc bị ảnh hưởng khi tạm ngưng (bước 2 – frame 03.2). */
export type ImpactItem = {
  id: string;
  kind: ImpactKind;
  /** Mô tả phụ dưới loại, ví dụ "Còn hiệu lực". */
  kindNote: string;
  /** Mã ngắn hiển thị trên thẻ tổng hợp và phương án, ví dụ "HD-2025-044". */
  code: string;
  title: string;
  detail: string;
  statusLabel: string;
  statusTone: 'success' | 'info' | 'warning' | 'neutral';
  department: Department;
  options: string[];
  /** Ghi chú hiển thị cùng phương án sau khi tạm ngưng, ví dụ "Hợp đồng giữ trạng thái Active". */
  planNote: string;
};

export type ImpactPlanItem = Pick<ImpactItem, 'id' | 'kind' | 'code' | 'department' | 'planNote'> & { option: string };

export type SuspensionReview = {
  items: ImpactItem[];
  /** Nhóm dữ liệu không tải được (A4.4); còn nhóm lỗi thì không cho xác nhận. */
  failedKinds: ImpactKind[];
  failedAt?: string;
};

export type SuspensionRecord = {
  reasonGroup: string;
  reason: string;
  evidence: AttachedFile[];
  decidedBy: string;
  decidedByTitle: string;
  at: string;
  plan: ImpactPlanItem[];
  coordinationNote: string;
  notices: DepartmentNotice[];
};

export type ReactivationCheckStatus = 'met' | 'unmet' | 'exception';

/** Điều kiện kích hoạt lại theo nguyên nhân tạm ngưng: công nợ, vận hành, tranh chấp (frame 04.1). */
export type ReactivationCheck = {
  id: 'debt' | 'dispute' | 'operation';
  label: string;
  status: ReactivationCheckStatus;
  detail: string;
};

export type ReactivationException = { decisionNo: string; content: string };

export type ReactivationRecord = {
  reason: string;
  evidence: AttachedFile[];
  decidedBy: string;
  decidedByTitle: string;
  at: string;
  exception?: ReactivationException;
  notices: DepartmentNotice[];
};

/** Hồ sơ đã kết thúc của khách hàng, giữ nguyên trạng thái khi kích hoạt lại (frame 04.5). */
export type ClosedRecord = { code: string; title: string; note: string; status: 'Expired' | 'Cancelled' };

export type ReactivationContext = {
  suspension: SuspensionRecord;
  checks: ReactivationCheck[];
};

type StatusRequestBase = {
  userId: string;
  signedInAt: string;
  idempotencyKey: string;
  code: string;
  /** Phiên bản lúc mở thao tác; khác phiên bản hiện tại thì từ chối (A7.1 / A7). */
  baseVersion: number;
};

export type SuspendCustomerRequest = StatusRequestBase & {
  reasonGroup: string;
  reason: string;
  evidence: AttachedFile[];
  plan: { id: string; option: string }[];
  coordinationNote: string;
};

export type ReactivateCustomerRequest = StatusRequestBase & {
  reason: string;
  evidence: AttachedFile[];
  exception?: ReactivationException;
};

export type StatusChangeResult = { customer: Customer; replayed: boolean };

export type StatusChangeErrorCode =
  | 'VALIDATION'
  | 'ALREADY_IN_STATUS' // A2 – đã ở trạng thái đích, không ghi lịch sử trùng
  | 'CONFLICT' // A7.1 / A7 – quyền hoặc dữ liệu đã thay đổi
  | 'CONDITIONS_NOT_MET' // A4.1 / A4.2
  | 'REVIEW_INCOMPLETE' // A4.4
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'LOAD_FAILED' // A4.4 / A2.1
  | 'SAVE_FAILED' // A8.1
  | 'NETWORK' // A8.2
  | 'SESSION_ENDED';

export class StatusChangeError extends Error {
  readonly code: StatusChangeErrorCode;
  readonly currentStatus?: CustomerStatus;
  readonly sessionStatus?: Exclude<SessionCheck['status'], 'active'>;

  constructor(code: StatusChangeErrorCode, extra: Pick<StatusChangeError, 'currentStatus' | 'sessionStatus'> = {}) {
    super(code);
    this.name = 'StatusChangeError';
    this.code = code;
    this.currentStatus = extra.currentStatus;
    this.sessionStatus = extra.sessionStatus;
  }
}
