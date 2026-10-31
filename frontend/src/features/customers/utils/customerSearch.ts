import {
  CUSTOMER_PAGE_SIZES,
  type CustomerSearchQuery,
  type CustomerSort,
  type CustomerStatusFilter,
} from '../types/customerList';

export const DEFAULT_CUSTOMER_QUERY: CustomerSearchQuery = {
  keyword: '',
  status: 'active',
  sort: 'updated-desc',
  page: 1,
  size: CUSTOMER_PAGE_SIZES[0],
};

export const KEYWORD_MAX_LENGTH = 100;

export const CUSTOMER_SORT_LABELS: Record<CustomerSort, string> = {
  'updated-desc': 'Cập nhật gần nhất',
  'name-asc': 'Tên khách hàng A → Z',
  'code-asc': 'Mã khách hàng tăng dần',
};

const STATUS_FILTERS: CustomerStatusFilter[] = ['active', 'suspended', 'all'];

/** So khớp không phân biệt hoa thường và dấu tiếng Việt: "minh phat" khớp "Minh Phát". */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/** Lỗi của từng điều kiện tra cứu (A4.1); có lỗi thì không chạy truy vấn. */
export function validateCustomerQuery(query: CustomerSearchQuery): string[] {
  const problems: string[] = [];
  if (query.keyword.length > KEYWORD_MAX_LENGTH) problems.push(`Từ khóa tối đa ${KEYWORD_MAX_LENGTH} ký tự.`);
  if (!STATUS_FILTERS.includes(query.status)) problems.push('Trạng thái chỉ gồm Hoạt động, Tạm ngưng hoặc Tất cả.');
  if (!(query.sort in CUSTOMER_SORT_LABELS)) problems.push('Kiểu sắp xếp không được hỗ trợ.');
  if (!Number.isInteger(query.page) || query.page < 1) problems.push('Số trang phải là số nguyên từ 1.');
  if (!(CUSTOMER_PAGE_SIZES as readonly number[]).includes(query.size)) {
    problems.push(`Số dòng mỗi trang chỉ gồm ${CUSTOMER_PAGE_SIZES.join(', ')}.`);
  }
  return problems;
}

/** Đọc điều kiện từ URL; giá trị thiếu dùng mặc định, giá trị sai giữ nguyên để báo lỗi thay vì tự sửa. */
export function readCustomerQuery(params: URLSearchParams): CustomerSearchQuery {
  const number = (key: string, fallback: number) => (params.has(key) ? Number(params.get(key)) : fallback);
  return {
    keyword: params.get('q') ?? DEFAULT_CUSTOMER_QUERY.keyword,
    status: (params.get('trang-thai') ?? DEFAULT_CUSTOMER_QUERY.status) as CustomerStatusFilter,
    sort: (params.get('sap-xep') ?? DEFAULT_CUSTOMER_QUERY.sort) as CustomerSort,
    page: number('trang', DEFAULT_CUSTOMER_QUERY.page),
    size: number('so-dong', DEFAULT_CUSTOMER_QUERY.size),
  };
}

/** Ghi điều kiện lên URL, bỏ các giá trị mặc định cho gọn. */
export function toCustomerQueryParams(query: CustomerSearchQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.keyword) params.set('q', query.keyword);
  if (query.status !== DEFAULT_CUSTOMER_QUERY.status) params.set('trang-thai', query.status);
  if (query.sort !== DEFAULT_CUSTOMER_QUERY.sort) params.set('sap-xep', query.sort);
  if (query.page !== DEFAULT_CUSTOMER_QUERY.page) params.set('trang', String(query.page));
  if (query.size !== DEFAULT_CUSTOMER_QUERY.size) params.set('so-dong', String(query.size));
  return params;
}
