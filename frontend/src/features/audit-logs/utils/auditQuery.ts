import type { AuditFilters } from '../types/auditLog';

/** Lý do BE trả trong body 400 VALIDATION, kèm trường lỗi. */
export type AuditFilterError = { field: 'fromDate' | 'toDate' | 'entityId' | 'actorId' | 'page' | 'pageSize'; reason: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

/** Chuyển ngày địa phương YYYY-MM-DD sang ISO UTC: đầu ngày cho "từ", cuối ngày cho "đến". */
function localDayBoundary(day: string, end: boolean): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const [year, month, dayOfMonth] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const date = end
    ? new Date(year, month, dayOfMonth, 23, 59, 59, 999)
    : new Date(year, month, dayOfMonth, 0, 0, 0, 0);
  // The Date constructor rolls invalid days (2026-02-31) into the next month; reject those instead.
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== dayOfMonth) return null;
  return date.toISOString();
}

/**
 * Kiểm tra bộ lọc trước khi gọi API (E2). Trả về lỗi đầu tiên, hoặc null nếu hợp lệ.
 * Khi đối tượng được chọn (A1) và không nhập ngày thì không có giới hạn khoảng thời gian.
 */
export function validateAuditFilters(filters: AuditFilters): AuditFilterError | null {
  if (filters.entityId && !UUID.test(filters.entityId.trim())) return { field: 'entityId', reason: 'INVALID_ID' };
  if (filters.actorId && !UUID.test(filters.actorId.trim())) return { field: 'actorId', reason: 'INVALID_ID' };
  if (filters.fromDate && localDayBoundary(filters.fromDate, false) === null) return { field: 'fromDate', reason: 'INVALID_DATE' };
  if (filters.toDate && localDayBoundary(filters.toDate, true) === null) return { field: 'toDate', reason: 'INVALID_DATE' };
  if (filters.fromDate && filters.toDate) {
    const from = localDayBoundary(filters.fromDate, false)!;
    const to = localDayBoundary(filters.toDate, true)!;
    if (to < from) return { field: 'toDate', reason: 'RANGE_INVERTED' };
    if (!filters.entityId && new Date(to).getTime() - new Date(from).getTime() > MAX_RANGE_MS) {
      return { field: 'fromDate', reason: 'RANGE_TOO_LONG' };
    }
  }
  return null;
}

/** Thông báo tiếng Việt cho lỗi lọc, hiển thị ngay dưới ô lọc (E2). */
export function auditFilterMessage(reason: string): string {
  switch (reason) {
    case 'INVALID_DATE': return 'Ngày không hợp lệ.';
    case 'RANGE_INVERTED': return 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.';
    case 'RANGE_TOO_LONG': return 'Khoảng thời gian không được vượt quá 366 ngày.';
    case 'INVALID_ID': return 'Mã phải theo định dạng UUID.';
    case 'TOO_LONG': return 'Giá trị quá dài.';
    default: return 'Giá trị lọc không hợp lệ.';
  }
}

/**
 * Tạo query string cho GET /audit-logs. Ô ngày để trống thì không gửi (BE tự áp 7 ngày gần nhất hoặc bỏ giới hạn với A1).
 */
export function buildAuditQuery(filters: AuditFilters): string {
  const params = new URLSearchParams();
  const from = filters.fromDate ? localDayBoundary(filters.fromDate, false) : null;
  const to = filters.toDate ? localDayBoundary(filters.toDate, true) : null;
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (filters.actorId.trim()) params.set('actorId', filters.actorId.trim());
  if (filters.entityType) params.set('entityType', filters.entityType);
  if (filters.entityId.trim()) params.set('entityId', filters.entityId.trim());
  if (filters.action) params.set('action', filters.action);
  params.set('page', String(filters.page));
  params.set('pageSize', String(filters.pageSize));
  return params.toString();
}
