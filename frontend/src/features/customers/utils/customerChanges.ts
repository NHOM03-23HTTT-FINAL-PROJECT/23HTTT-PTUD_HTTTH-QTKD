import type {
  CustomerChange,
  CustomerDraft,
  CustomerField,
  EditableCustomerDraft,
  EditableCustomerField,
} from '../types/customer';
import { normalizeCustomerDraft } from './customerValidation';

export const CUSTOMER_FIELD_LABELS: Record<CustomerField, string> = {
  name: 'Tên khách hàng',
  taxCode: 'Mã số thuế',
  address: 'Địa chỉ',
  representative: 'Người đại diện',
  contactName: 'Người liên hệ chính',
  contactTitle: 'Chức vụ',
  phone: 'Điện thoại',
  email: 'Email',
  customerGroup: 'Nhóm khách hàng',
  serviceGroups: 'Nhóm dịch vụ quan tâm',
};

/** Thứ tự trường trên biểu mẫu chỉnh sửa (02.1). */
export const EDITABLE_FIELDS: EditableCustomerField[] = [
  'name',
  'address',
  'representative',
  'contactName',
  'contactTitle',
  'phone',
  'email',
  'customerGroup',
  'serviceGroups',
];

export const REASON_REQUIRED_MESSAGE = 'Vui lòng nhập lý do hoặc căn cứ thay đổi.';

export function toEditableDraft(draft: CustomerDraft | EditableCustomerDraft): EditableCustomerDraft {
  const result = {} as Record<EditableCustomerField, unknown>;
  for (const field of EDITABLE_FIELDS) {
    const value = draft[field];
    result[field] = Array.isArray(value) ? [...value] : value;
  }
  return result as EditableCustomerDraft;
}

/** Nhóm dịch vụ so như tập hợp: chỉ đổi thứ tự chọn không phải là thay đổi. */
export function sameValue(a: string | string[], b: string | string[]): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v) => b.includes(v));
  return a === b;
}

/** Danh sách trường khác nhau giữa bản đang lưu và bản đang sửa (đã bỏ khoảng trắng thừa). */
export function diffCustomer(saved: EditableCustomerDraft, edited: EditableCustomerDraft): CustomerChange[] {
  const normalized = normalizeCustomerDraft({ ...edited, taxCode: '' });
  return EDITABLE_FIELDS.filter((field) => !sameValue(saved[field], normalized[field])).map((field) => ({
    field,
    before: saved[field],
    after: normalized[field],
  }));
}
