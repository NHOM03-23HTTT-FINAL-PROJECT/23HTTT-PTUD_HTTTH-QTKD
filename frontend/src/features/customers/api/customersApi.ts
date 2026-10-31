import {
  mockCreateCustomer,
  mockGetCustomer,
  mockGetCustomerFormOptions,
  mockSearchCustomers,
  mockUpdateCustomer,
} from '@/mocks/customersServer';
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
    await delay(MOCK_LATENCY_MS);
    return mockCreateCustomer(request);
  },

  /** UC-CUS-02: cập nhật thông tin khách hàng trên đúng phiên bản đang sửa. */
  async update(request: UpdateCustomerRequest): Promise<UpdateCustomerResult> {
    await delay(MOCK_LATENCY_MS);
    return mockUpdateCustomer(request);
  },

  /** UC-CUS-05: tra cứu khách hàng trong phạm vi quyền. */
  async search(request: CustomerSearchRequest): Promise<CustomerSearchResult> {
    await delay(MOCK_SEARCH_LATENCY_MS);
    return mockSearchCustomers(request);
  },

  getCustomer(code: string): Customer | undefined {
    return mockGetCustomer(code);
  },

  /** Danh mục nhóm khách hàng và nhóm dịch vụ cho biểu mẫu. */
  getFormOptions() {
    return mockGetCustomerFormOptions();
  },
};
