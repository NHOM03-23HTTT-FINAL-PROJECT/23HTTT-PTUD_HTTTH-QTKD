import type { Area, AreaDraft, AreaField, AreaFieldChange, AreaHistoryEntry, AreaTypeCode } from '../types/area';
import { areaTypeLabel, formatAreaSize, formatCapacity } from './areaFormat';
import { normalizeAreaDraft, parseAreaNumber } from './areaValidation';

export const AREA_FIELD_LABELS: Record<AreaField, string> = {
  code: 'Mã khu vực',
  name: 'Tên khu vực',
  type: 'Loại mặt bằng',
  parentCode: 'Khu vực cấp cha',
  gps: 'Tọa độ GPS',
  areaSize: 'Diện tích mặt bằng',
  capacity: 'Sức chứa thiết kế',
  capacityUnit: 'Đơn vị sức chứa',
  standards: 'Mô tả quy chuẩn kỹ thuật',
};

/** Thứ tự trường trên biểu mẫu, dùng để sắp danh sách thay đổi. */
const FIELD_ORDER: AreaField[] = ['code', 'name', 'type', 'parentCode', 'gps', 'areaSize', 'capacity', 'capacityUnit', 'standards'];

const numberFormat = new Intl.NumberFormat('vi-VN');

/** Hồ sơ đang lưu → giá trị ban đầu của biểu mẫu chỉnh sửa (04.1). */
export function toAreaDraft(area: Area): AreaDraft {
  return {
    code: area.code,
    name: area.name,
    type: area.type,
    parentCode: area.parentCode ?? '',
    gps: area.gps,
    areaSize: area.areaSize === null ? '' : numberFormat.format(area.areaSize),
    capacity: area.capacity === null ? '' : numberFormat.format(area.capacity),
    capacityUnit: area.capacityUnit,
    standards: area.standards,
  };
}

/** Giá trị so sánh: số được quy về cùng một dạng để "85000" và "85.000" không bị tính là thay đổi. */
function comparable(draft: AreaDraft, field: AreaField): string {
  if (field === 'areaSize' || field === 'capacity') {
    const text = draft[field];
    if (!text) return '';
    const value = parseAreaNumber(text);
    return value === null ? `invalid:${text}` : String(value);
  }
  return draft[field];
}

function display(draft: AreaDraft, field: AreaField): string {
  const value = draft[field];
  switch (field) {
    case 'type':
      return value ? areaTypeLabel(value as AreaTypeCode) : '—';
    case 'parentCode':
      return value || 'Không có (Cấp 1)';
    case 'areaSize': {
      const number = parseAreaNumber(value);
      return number === null ? value || '—' : formatAreaSize(number);
    }
    case 'capacity': {
      const number = parseAreaNumber(value);
      return number === null ? value || '—' : formatCapacity(number, draft.capacityUnit);
    }
    default:
      return value || '—';
  }
}

/** Mục lịch sử tạo ra phiên bản hiện hành (Phiên bản 7 · 21/10/2026 15:20 · Lê Minh Tâm). */
export function currentVersionEntry(area: Area): AreaHistoryEntry {
  const versioned = area.history.filter((h) => h.kind !== 'assignment' && h.version === area.version);
  return versioned[versioned.length - 1] ?? area.history[area.history.length - 1];
}

/** Danh sách trường khác bản đang lưu, kèm giá trị trước → sau đã định dạng (cột "Thay đổi chưa lưu", Audit log). */
export function diffAreaDraft(original: AreaDraft, edited: AreaDraft): AreaFieldChange[] {
  const before = normalizeAreaDraft(original);
  const after = normalizeAreaDraft(edited);
  return FIELD_ORDER.filter((field) => comparable(before, field) !== comparable(after, field)).map((field) =>
    field === 'standards'
      ? { field, ...changedClauses(display(before, field), display(after, field)) }
      : { field, before: display(before, field), after: display(after, field) },
  );
}

/**
 * Mô tả quy chuẩn thường dài: chỉ giữ các vế (ngăn bởi "; ") khác nhau, ví dụ "6 cầu khung RTG" → "8 cầu khung RTG".
 */
function changedClauses(before: string, after: string): { before: string; after: string } {
  const a = before.replace(/\.$/, '').split('; ');
  const b = after.replace(/\.$/, '').split('; ');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end += 1;
  const pick = (parts: string[]) => parts.slice(start, parts.length - end).join('; ') || '—';
  return start === 0 && end === 0 ? { before, after } : { before: pick(a), after: pick(b) };
}
