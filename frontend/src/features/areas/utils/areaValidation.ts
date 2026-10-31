import type { AreaDraft, AreaFieldErrors } from '../types/area';

export const EMPTY_AREA_DRAFT: AreaDraft = {
  code: '',
  name: '',
  type: '',
  parentCode: '',
  gps: '',
  areaSize: '',
  capacity: '',
  capacityUnit: 'TEU',
  standards: '',
};

export const AREA_NAME_MAX_LENGTH = 150;
export const AREA_CODE_MAX_LENGTH = 30;

const CODE_PATTERN = /^[A-Z0-9]+(-[A-Z0-9]+)*$/;
/** Số theo cách viết vi-VN: dấu chấm phân tách hàng nghìn, dấu phẩy phần thập phân (12.500 hoặc 12500,5). */
const NUMBER_PATTERN = /^(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/;

/** "12.500" → 12500; trả về null khi không phải số hợp lệ. */
export function parseAreaNumber(value: string): number | null {
  const text = value.trim();
  if (!NUMBER_PATTERN.test(text)) return null;
  return Number(text.replace(/\./g, '').replace(',', '.'));
}

export function normalizeAreaDraft(draft: AreaDraft): AreaDraft {
  return {
    ...draft,
    code: draft.code.trim().toUpperCase(),
    name: draft.name.trim().replace(/\s+/g, ' '),
    gps: draft.gps.trim(),
    areaSize: draft.areaSize.trim(),
    capacity: draft.capacity.trim(),
    standards: draft.standards.trim(),
  };
}

/** Bước 5 của UC-ARE-01: thiếu thông tin bắt buộc và dữ liệu số không hợp lệ (frame 01.2). */
export function validateAreaDraft(input: AreaDraft): AreaFieldErrors {
  const draft = normalizeAreaDraft(input);
  const errors: AreaFieldErrors = {};

  if (draft.code && !CODE_PATTERN.test(draft.code)) {
    errors.code = 'Mã khu vực chỉ gồm chữ, chữ số và dấu gạch ngang, ví dụ KV-CL-B1-A3.';
  }
  if (!draft.name) errors.name = 'Vui lòng nhập tên khu vực.';
  if (!draft.type) errors.type = 'Vui lòng chọn loại mặt bằng.';

  if (draft.areaSize) {
    const value = parseAreaNumber(draft.areaSize);
    if (value === null || value <= 0) errors.areaSize = 'Diện tích phải là số dương lớn hơn 0.';
  }
  if (draft.capacity) {
    const value = parseAreaNumber(draft.capacity);
    if (value === null || value <= 0) errors.capacity = 'Sức chứa phải là số dương lớn hơn 0, không chứa ký tự chữ.';
  }
  return errors;
}

/** Biểu mẫu chưa có dữ liệu người dùng nhập (đơn vị sức chứa mặc định không tính). */
export function isAreaDraftEmpty(draft: AreaDraft): boolean {
  return (Object.keys(draft) as (keyof AreaDraft)[]).every(
    (field) => field === 'capacityUnit' || draft[field].trim() === '',
  );
}

/** So khớp tên không phân biệt hoa thường, dấu cách thừa (ARE-02). */
export function sameAreaName(a: string, b: string): boolean {
  const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
  return normalize(a) === normalize(b);
}

/** Bỏ dấu tiếng Việt để tìm "cat lai" khớp "Cát Lái". */
export function normalizeAreaSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}
