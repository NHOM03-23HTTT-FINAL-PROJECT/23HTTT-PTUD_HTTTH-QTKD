import type { SessionCheck } from '@/features/auth/types/auth';
import type { CustomerStatus } from './customer';

export type CustomerStatusFilter = CustomerStatus | 'all';

export type CustomerSort = 'updated-desc' | 'name-asc' | 'code-asc';

export const CUSTOMER_PAGE_SIZES = [8, 20, 50] as const;

/** Điều kiện tra cứu của UC-CUS-05; giữ trên URL để quay lại từ hồ sơ vẫn còn (A5.2). */
export type CustomerSearchQuery = {
  keyword: string;
  status: CustomerStatusFilter;
  sort: CustomerSort;
  page: number;
  size: number;
};

export type CustomerSearchRequest = CustomerSearchQuery & {
  userId: string;
  signedInAt: string;
  /** Lần thử lại sau lỗi tải dữ liệu (05.4). */
  retry: boolean;
};

export type CustomerListItem = {
  code: string;
  name: string;
  address: string;
  taxCode: string;
  status: CustomerStatus;
  updatedAt: string;
};

export type CustomerSearchResult = {
  items: CustomerListItem[];
  /** Tổng số trong phạm vi quyền của người tra cứu; không đếm bản ghi ngoài quyền (A1). */
  total: number;
  page: number;
  size: number;
};

export type CustomerSearchErrorCode = 'INVALID_QUERY' | 'LOAD_FAILED' | 'FORBIDDEN' | 'SESSION_ENDED';

export class CustomerSearchError extends Error {
  readonly code: CustomerSearchErrorCode;
  /** Mã lỗi hiển thị cho người dùng khi báo hỗ trợ, ví dụ "CUS-LIST-503". */
  readonly reference?: string;
  readonly sessionStatus?: Exclude<SessionCheck['status'], 'active'>;

  constructor(code: CustomerSearchErrorCode, extra: Pick<CustomerSearchError, 'reference' | 'sessionStatus'> = {}) {
    super(code);
    this.name = 'CustomerSearchError';
    this.code = code;
    this.reference = extra.reference;
    this.sessionStatus = extra.sessionStatus;
  }
}
