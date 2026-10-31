import type { CustomerDraft, CustomerFieldErrors } from '../types/customer';

const TAX_CODE_PATTERN = /^(\d{10}|\d{13})$/;
/** Chỉ gồm chữ số, dấu + (nếu có) chỉ ở đầu (A5.4). */
const PHONE_PATTERN = /^\+?\d+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MISSING_CONTACT_MESSAGE = 'Nhập điện thoại hoặc email (ít nhất một).';

export const EMPTY_CUSTOMER_DRAFT: CustomerDraft = {
  name: '',
  taxCode: '',
  address: '',
  representative: '',
  contactName: '',
  contactTitle: '',
  phone: '',
  email: '',
  customerGroup: '',
  serviceGroups: [],
};

/** Bỏ khoảng trắng thừa trước khi kiểm tra và lưu; trường chỉ có khoảng trắng coi như bỏ trống (A5.1). */
export function normalizeCustomerDraft(draft: CustomerDraft): CustomerDraft {
  return {
    ...draft,
    name: draft.name.trim(),
    taxCode: draft.taxCode.trim(),
    address: draft.address.trim(),
    representative: draft.representative.trim(),
    contactName: draft.contactName.trim(),
    contactTitle: draft.contactTitle.trim(),
    phone: draft.phone.trim(),
    email: draft.email.trim(),
  };
}

/**
 * Quy tắc nhập liệu của UC-CUS-01 (frame 01.2 / 01.3). Dùng chung cho FE và server giả lập;
 * BE thật vẫn phải tự kiểm tra lại.
 */
export function validateCustomerDraft(input: CustomerDraft): CustomerFieldErrors {
  const draft = normalizeCustomerDraft(input);
  const errors: CustomerFieldErrors = {};

  if (!draft.name) errors.name = 'Vui lòng nhập tên khách hàng (không chỉ gồm khoảng trắng).';

  if (!draft.taxCode) errors.taxCode = 'Vui lòng nhập mã số thuế.';
  else if (!TAX_CODE_PATTERN.test(draft.taxCode)) errors.taxCode = 'Mã số thuế phải gồm 10 hoặc 13 chữ số.';

  if (!draft.address) errors.address = 'Vui lòng nhập địa chỉ.';
  if (!draft.representative) errors.representative = 'Vui lòng nhập người đại diện.';

  // A5.5: cần ít nhất một phương thức liên hệ.
  if (!draft.phone && !draft.email) {
    errors.phone = MISSING_CONTACT_MESSAGE;
    errors.email = MISSING_CONTACT_MESSAGE;
  }
  if (draft.phone && !PHONE_PATTERN.test(draft.phone)) {
    errors.phone = 'Điện thoại chỉ gồm chữ số; dấu + chỉ đặt ở đầu.';
  }
  if (draft.email && !EMAIL_PATTERN.test(draft.email)) errors.email = 'Email không đúng cú pháp.';

  return errors;
}

/** Lỗi duy nhất là thiếu cả điện thoại và email → banner riêng của frame 01.3. */
export function isOnlyMissingContact(errors: CustomerFieldErrors): boolean {
  const keys = Object.keys(errors);
  return keys.length === 2 && errors.phone === MISSING_CONTACT_MESSAGE && errors.email === MISSING_CONTACT_MESSAGE;
}

export function isDraftEmpty(draft: CustomerDraft): boolean {
  return Object.entries(draft).every(([, value]) => (Array.isArray(value) ? value.length === 0 : !value.trim()));
}
