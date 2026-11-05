import { mockGetCustomerRecords, mockReportPaymentDiscrepancy } from '@/mocks/customerRecordsServer';
import { IS_MOCK_AUTH } from '@/features/auth/api/authApi';
import { ApiError, apiRequest } from '@/lib/http/client';
import { CustomerRecordsError } from '../types/customerRecords';
import type { CustomerRecordGroup, CustomerRecordsByGroup, ReportDiscrepancyRequest } from '../types/customerRecords';

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/*
 * Lớp API hồ sơ liên quan của khách hàng (UC-CUS-06). Mỗi nhóm tải riêng để lỗi một nhóm không chặn các nhóm khác.
 * API mode reports unavailable sources explicitly and never replaces them with prototype records.
 */
export const customerRecordsApi = {
  async getGroup<G extends CustomerRecordGroup>(
    user: { id: string; signedInAt: string },
    code: string,
    group: G,
    retry = false,
  ): Promise<CustomerRecordsByGroup[G]> {
    if (!IS_MOCK_AUTH) {
      try { return await apiRequest(`/customers/${encodeURIComponent(code)}/records/${group}`); }
      catch (error) {
        if (error instanceof ApiError) {
          if (error.status === 401) throw new CustomerRecordsError('SESSION_ENDED');
          if (error.status === 403) throw new CustomerRecordsError('FORBIDDEN');
          if (error.status === 404) throw new CustomerRecordsError('NOT_FOUND');
          if (error.code === 'SOURCE_UNAVAILABLE') throw new CustomerRecordsError('SOURCE_UNAVAILABLE');
          throw new CustomerRecordsError('LOAD_FAILED');
        }
        throw error;
      }
    }
    await delay(350);
    return mockGetCustomerRecords(user.id, user.signedInAt, code, group, retry);
  },

  async reportDiscrepancy(request: ReportDiscrepancyRequest): Promise<{ reportedAt: string }> {
    if (!IS_MOCK_AUTH) throw new CustomerRecordsError('LOAD_FAILED');
    await delay(700);
    return mockReportPaymentDiscrepancy(request);
  },
};
