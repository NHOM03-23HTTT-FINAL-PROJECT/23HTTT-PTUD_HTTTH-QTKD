import {
  mockGetReactivationContext,
  mockGetSuspensionReasonGroups,
  mockGetSuspensionReview,
  mockReactivateCustomer,
  mockSuspendCustomer,
} from '@/mocks/customerStatusServer';
import type {
  ReactivateCustomerRequest,
  ReactivationContext,
  StatusChangeResult,
  SuspendCustomerRequest,
  SuspensionReview,
} from '../types/customerStatus';

const MOCK_LATENCY_MS = 900;
/** Tải dữ liệu rà soát nhanh hơn thao tác ghi. */
const MOCK_LOAD_MS = 500;

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/*
 * Lớp API cho trạng thái hợp tác của khách hàng (UC-CUS-03 / UC-CUS-04). Prototype gọi server giả lập trong
 * `src/mocks`; khi có BE chỉ cần thay phần thân hàm bằng lời gọi HTTP, giữ nguyên chữ ký.
 */
export const customerStatusApi = {
  getSuspensionReasonGroups() {
    return mockGetSuspensionReasonGroups();
  },

  /** UC-CUS-03 bước 2: rà soát hồ sơ, công việc bị ảnh hưởng. */
  async getSuspensionReview(code: string, retry = false): Promise<SuspensionReview> {
    await delay(MOCK_LOAD_MS);
    return mockGetSuspensionReview(code, retry);
  },

  async suspend(request: SuspendCustomerRequest): Promise<StatusChangeResult> {
    await delay(MOCK_LATENCY_MS);
    return mockSuspendCustomer(request);
  },

  /** UC-CUS-04: thông tin tạm ngưng hiện hành và điều kiện kích hoạt lại. */
  async getReactivationContext(code: string, retry = false): Promise<ReactivationContext> {
    await delay(MOCK_LOAD_MS);
    return mockGetReactivationContext(code, retry);
  },

  async reactivate(request: ReactivateCustomerRequest): Promise<StatusChangeResult> {
    await delay(MOCK_LATENCY_MS);
    return mockReactivateCustomer(request);
  },
};
