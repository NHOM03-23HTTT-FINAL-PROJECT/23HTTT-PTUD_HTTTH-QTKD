import {
  CustomerRecordsError,
  type CustomerRecordGroup,
  type CustomerRecordsByGroup,
  type ReportDiscrepancyRequest,
} from '@/features/customers/types/customerRecords';
import { authorize, mockGetCustomer } from './customersServer';
import { mockStore } from './mockStore';
import { SEED_CUSTOMER_RECORDS, SIMULATED_RECORDS_FAILURE } from './seed/customerRecords';

const EMPTY: CustomerRecordsByGroup = { contracts: [], priceLists: [], payments: [] };

/**
 * UC-CUS-06: một nhóm hồ sơ của khách hàng. Kiểm tra quyền trên đúng khách hàng được yêu cầu và chỉ trả hồ sơ thuộc
 * khách hàng đó (A8.3). `retry` là lần tải lại riêng nhóm bị lỗi (06.9).
 */
export function mockGetCustomerRecords<G extends CustomerRecordGroup>(
  userId: string,
  signedInAt: string,
  code: string,
  group: G,
  retry: boolean,
): CustomerRecordsByGroup[G] {
  authorize(userId, signedInAt, 'customers.view', (errorCode, sessionStatus) => new CustomerRecordsError(errorCode, { sessionStatus }));
  if (!mockGetCustomer(code)) throw new CustomerRecordsError('NOT_FOUND');
  if (code === SIMULATED_RECORDS_FAILURE.code && group === SIMULATED_RECORDS_FAILURE.group && !retry) {
    throw new CustomerRecordsError('LOAD_FAILED');
  }
  return (SEED_CUSTOMER_RECORDS[code] ?? EMPTY)[group];
}

/** A8.2: ghi nhận sai lệch bảng thanh toán và chuyển Kế toán; màn hình tra cứu không sửa bảng thanh toán. */
export function mockReportPaymentDiscrepancy(request: ReportDiscrepancyRequest): { reportedAt: string } {
  const user = authorize(request.userId, request.signedInAt, 'customers.view', (errorCode, sessionStatus) => new CustomerRecordsError(errorCode, { sessionStatus }));
  const payments = SEED_CUSTOMER_RECORDS[request.customerCode]?.payments ?? [];
  if (!payments.some((p) => p.code === request.paymentCode)) throw new CustomerRecordsError('NOT_FOUND');
  if (!request.content.trim()) throw new CustomerRecordsError('VALIDATION');
  mockStore.audit({
    action: 'PAYMENT_DISCREPANCY_REPORTED',
    username: user.username,
    detail: `${request.paymentCode} (${request.customerCode}) → Phòng Kế toán: ${request.content.trim()}`,
  });
  return { reportedAt: new Date().toISOString() };
}
