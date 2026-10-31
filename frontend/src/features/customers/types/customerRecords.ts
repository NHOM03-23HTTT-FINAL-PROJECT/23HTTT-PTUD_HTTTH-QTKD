import type { SessionCheck } from '@/features/auth/types/auth';

/** Ngày dạng "YYYY-MM-DD" (so sánh được bằng chuỗi). */
export type IsoDate = string;

export type ContractState = 'signed' | 'pending' | 'draft' | 'cancelled';

/** Hợp đồng của khách hàng hiển thị ở tab Hợp đồng (06.2). Trạng thái hiệu lực tính theo thời điểm đối chiếu. */
export type ContractRecord = {
  code: string;
  service: string;
  note: string;
  start: IsoDate;
  end: IsoDate;
  state: ContractState;
  /** Bước đang duyệt, có khi `state` là "pending". */
  pendingStep?: string;
  signedAt?: IsoDate;
  appendix?: string;
  priceList?: string;
};

export type PriceItem = { name: string; unit: string; price: number };

/** Một phiên bản bảng giá đã duyệt (hoặc đang chờ duyệt) của khách hàng (06.3 / 06.4). */
export type PriceListVersion = {
  id: string;
  code: string;
  version: number;
  from: IsoDate;
  /** Bỏ trống khi chưa có ngày kết thúc. */
  to?: IsoDate;
  service: string;
  /** Hợp đồng gắn bảng giá; không có là bảng giá riêng của khách hàng. */
  contractCode?: string;
  state: 'approved' | 'pending';
  approvedBy?: string;
  approvedAt?: IsoDate;
  items: PriceItem[];
};

/** Thông tin khách hàng lưu trên bảng thanh toán tại thời điểm lập (A8.1). */
export type PaymentCustomerSnapshot = { name: string; taxCode: string; address: string; representative: string };

export type PaymentRecord = {
  code: string;
  /** Kỳ dạng "MM/YYYY". */
  period: string;
  contractCode: string;
  total: number;
  issuedAt: IsoDate;
  state: 'reconciling' | 'issued';
  snapshot: PaymentCustomerSnapshot;
};

export type CustomerRecordGroup = 'contracts' | 'priceLists' | 'payments';

export type CustomerRecordsByGroup = {
  contracts: ContractRecord[];
  priceLists: PriceListVersion[];
  payments: PaymentRecord[];
};

export type ReportDiscrepancyRequest = {
  userId: string;
  signedInAt: string;
  customerCode: string;
  paymentCode: string;
  content: string;
};

export type CustomerRecordsErrorCode = 'LOAD_FAILED' | 'FORBIDDEN' | 'NOT_FOUND' | 'SESSION_ENDED' | 'VALIDATION';

export class CustomerRecordsError extends Error {
  readonly code: CustomerRecordsErrorCode;
  readonly sessionStatus?: Exclude<SessionCheck['status'], 'active'>;

  constructor(code: CustomerRecordsErrorCode, extra: Pick<CustomerRecordsError, 'sessionStatus'> = {}) {
    super(code);
    this.name = 'CustomerRecordsError';
    this.code = code;
    this.sessionStatus = extra.sessionStatus;
  }
}
