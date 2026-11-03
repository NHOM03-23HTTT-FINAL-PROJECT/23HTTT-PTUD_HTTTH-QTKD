import {
  mockGetReactivationContext,
  mockGetSuspensionReasonGroups,
  mockGetSuspensionReview,
  mockReactivateCustomer,
  mockSuspendCustomer,
} from '@/mocks/customerStatusServer';
import { IS_MOCK_AUTH } from '@/features/auth/api/authApi';
import { ApiError, apiRequest } from '@/lib/http/client';
import { StatusChangeError } from '../types/customerStatus';
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
function statusError(error: unknown): never {
  if (error instanceof ApiError) {
    if (error.status === 401) throw new StatusChangeError('SESSION_ENDED');
    if (error.status === 403) throw new StatusChangeError('FORBIDDEN');
    if (error.status === 404) throw new StatusChangeError('NOT_FOUND');
    if (error.code === 'REVIEW_INCOMPLETE') throw new StatusChangeError('REVIEW_INCOMPLETE');
    if (error.code === 'ALREADY_IN_STATUS') throw new StatusChangeError('ALREADY_IN_STATUS');
    if (error.code === 'CONDITIONS_NOT_MET') throw new StatusChangeError('CONDITIONS_NOT_MET');
    if (error.status === 409) throw new StatusChangeError('CONFLICT');
    throw new StatusChangeError('LOAD_FAILED');
  }
  throw error;
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
    if (!IS_MOCK_AUTH) {
      try { return await apiRequest(`/customers/${encodeURIComponent(code)}/suspension-review`); } catch (error) { statusError(error); }
    }
    await delay(MOCK_LOAD_MS);
    return mockGetSuspensionReview(code, retry);
  },

  async suspend(request: SuspendCustomerRequest): Promise<StatusChangeResult> {
    if (!IS_MOCK_AUTH) {
      const { userId: _userId, signedInAt: _signedInAt, idempotencyKey, code, ...body } = request;
      try { return await apiRequest(`/customers/${encodeURIComponent(code)}/suspend`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(body) }); } catch (error) { statusError(error); }
    }
    await delay(MOCK_LATENCY_MS);
    return mockSuspendCustomer(request);
  },

  /** UC-CUS-04: thông tin tạm ngưng hiện hành và điều kiện kích hoạt lại. */
  async getReactivationContext(code: string, retry = false): Promise<ReactivationContext> {
    if (!IS_MOCK_AUTH) {
      try { return await apiRequest(`/customers/${encodeURIComponent(code)}/reactivation-context`); } catch (error) { statusError(error); }
    }
    await delay(MOCK_LOAD_MS);
    return mockGetReactivationContext(code, retry);
  },

  async reactivate(request: ReactivateCustomerRequest): Promise<StatusChangeResult> {
    if (!IS_MOCK_AUTH) {
      const { userId: _userId, signedInAt: _signedInAt, idempotencyKey, code, ...body } = request;
      try { return await apiRequest(`/customers/${encodeURIComponent(code)}/reactivate`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(body) }); } catch (error) { statusError(error); }
    }
    await delay(MOCK_LATENCY_MS);
    return mockReactivateCustomer(request);
  },
};
