import {
  mockCreateCustomer,
  mockGetCustomer,
  mockGetCustomerFormOptions,
  mockSearchCustomers,
  mockUpdateCustomer,
} from '@/mocks/customersServer';
import { IS_MOCK_AUTH } from '@/features/auth/api/authApi';
import { ApiError, apiRequest } from '@/lib/http/client';
import { CustomerSearchError } from '../types/customerList';
import { CreateCustomerError, UpdateCustomerError, type CustomerConflict } from '../types/customer';
import type { CustomerSearchRequest, CustomerSearchResult } from '../types/customerList';
import type {
  CreateCustomerRequest,
  CreateCustomerResult,
  Customer,
  UpdateCustomerRequest,
  UpdateCustomerResult,
} from '../types/customer';

/** Độ trễ giả lập để thấy trạng thái "Đang lưu…". */
const MOCK_LATENCY_MS = 900;
const MOCK_SEARCH_LATENCY_MS = 400;

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/*
 * Lớp API của feature customers. Prototype gọi server giả lập trong `src/mocks`;
 * khi có BE chỉ cần thay phần thân hàm bằng lời gọi HTTP (gửi kèm header Idempotency-Key), giữ nguyên chữ ký.
 */
export const customersApi = {
  /** UC-CUS-01: tạo hồ sơ khách hàng. */
  async create(request: CreateCustomerRequest): Promise<CreateCustomerResult> {
    if (!IS_MOCK_AUTH) {
      try {
        return await apiRequest('/customers', { method: 'POST', headers: { 'Idempotency-Key': request.idempotencyKey }, body: JSON.stringify({ draft: request.draft }) });
      } catch (error) {
        if (error instanceof ApiError) {
          if (error.code === 'DUPLICATE_TAX_CODE') throw new CreateCustomerError('DUPLICATE_TAX_CODE', { existing: { taxCode: request.draft.taxCode.trim(), code: '', name: '', status: 'active' } });
          if (error.code === 'IDEMPOTENCY_KEY_REUSED') throw new CreateCustomerError('IDEMPOTENCY_KEY_REUSED');
          if (error.status === 401) throw new CreateCustomerError('SESSION_ENDED');
          if (error.status === 403) throw new CreateCustomerError('FORBIDDEN');
          if (error.status === 400) throw new CreateCustomerError('VALIDATION');
          throw new CreateCustomerError('SAVE_FAILED');
        }
        throw error;
      }
    }
    await delay(MOCK_LATENCY_MS);
    return mockCreateCustomer(request);
  },

  /** UC-CUS-02: cập nhật thông tin khách hàng trên đúng phiên bản đang sửa. */
  async update(request: UpdateCustomerRequest): Promise<UpdateCustomerResult> {
    if (!IS_MOCK_AUTH) {
      try {
        return await apiRequest(`/customers/${encodeURIComponent(request.code)}`, { method: 'PATCH', headers: { 'Idempotency-Key': request.idempotencyKey }, body: JSON.stringify({ baseVersion: request.baseVersion, draft: request.draft, reason: request.reason }) });
      } catch (error) {
        if (error instanceof ApiError) {
          const detail = error.detail.detail as { latest?: Customer } | undefined;
          if (error.code === 'CONFLICT' && detail?.latest) {
            const last = detail.latest.history.at(-1);
            const conflict: CustomerConflict = { latest: detail.latest, updatedBy: last?.by ?? 'Không rõ', updatedAt: last?.at ?? detail.latest.createdAt ?? '' };
            throw new UpdateCustomerError('CONFLICT', { conflict });
          }
          if (error.status === 401) throw new UpdateCustomerError('SESSION_ENDED');
          if (error.status === 403) throw new UpdateCustomerError('FORBIDDEN');
          if (error.status === 404) throw new UpdateCustomerError('NOT_FOUND');
          if (error.code === 'IDEMPOTENCY_KEY_REUSED') throw new UpdateCustomerError('IDEMPOTENCY_KEY_REUSED');
          if (error.code === 'NO_CHANGES') throw new UpdateCustomerError('NO_CHANGES');
          if (error.code === 'IMMUTABLE_FIELD') throw new UpdateCustomerError('IMMUTABLE_FIELD');
          if (error.status === 400) throw new UpdateCustomerError('VALIDATION');
          throw new UpdateCustomerError('SAVE_FAILED');
        }
        throw error;
      }
    }
    await delay(MOCK_LATENCY_MS);
    return mockUpdateCustomer(request);
  },

  /** UC-CUS-05: tra cứu khách hàng trong phạm vi quyền. */
  async search(request: CustomerSearchRequest): Promise<CustomerSearchResult> {
    if (!IS_MOCK_AUTH) {
      const query = new URLSearchParams({ keyword: request.keyword, status: request.status, sort: request.sort, page: String(request.page), size: String(request.size) });
      try { return await apiRequest(`/customers?${query}`); }
      catch (error) {
        if (error instanceof ApiError) {
          if (error.status === 401) throw new CustomerSearchError('SESSION_ENDED');
          if (error.status === 403) throw new CustomerSearchError('FORBIDDEN');
          if (error.status === 400) throw new CustomerSearchError('INVALID_QUERY');
          throw new CustomerSearchError('LOAD_FAILED');
        }
        throw error;
      }
    }
    await delay(MOCK_SEARCH_LATENCY_MS);
    return mockSearchCustomers(request);
  },

  async getCustomer(code: string): Promise<Customer | undefined> {
    if (IS_MOCK_AUTH) return mockGetCustomer(code);
    try { return await apiRequest<Customer>(`/customers/${encodeURIComponent(code)}`); }
    catch (error) {
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return undefined;
      throw error;
    }
  },

  /** Danh mục nhóm khách hàng và nhóm dịch vụ cho biểu mẫu. */
  async getFormOptions() {
    if (IS_MOCK_AUTH) return mockGetCustomerFormOptions();
    return apiRequest<ReturnType<typeof mockGetCustomerFormOptions>>('/customers/form-options');
  },
};
