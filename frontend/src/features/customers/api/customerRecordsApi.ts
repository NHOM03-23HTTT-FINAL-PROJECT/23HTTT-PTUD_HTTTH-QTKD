import { mockGetCustomerRecords, mockReportPaymentDiscrepancy } from '@/mocks/customerRecordsServer';
import type { CustomerRecordGroup, CustomerRecordsByGroup, ReportDiscrepancyRequest } from '../types/customerRecords';

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/*
 * Lớp API hồ sơ liên quan của khách hàng (UC-CUS-06). Mỗi nhóm tải riêng để lỗi một nhóm không chặn các nhóm khác.
 * Khi có BE chỉ cần thay phần thân hàm bằng lời gọi HTTP, giữ nguyên chữ ký.
 */
export const customerRecordsApi = {
  async getGroup<G extends CustomerRecordGroup>(
    user: { id: string; signedInAt: string },
    code: string,
    group: G,
    retry = false,
  ): Promise<CustomerRecordsByGroup[G]> {
    await delay(350);
    return mockGetCustomerRecords(user.id, user.signedInAt, code, group, retry);
  },

  async reportDiscrepancy(request: ReportDiscrepancyRequest): Promise<{ reportedAt: string }> {
    await delay(700);
    return mockReportPaymentDiscrepancy(request);
  },
};
