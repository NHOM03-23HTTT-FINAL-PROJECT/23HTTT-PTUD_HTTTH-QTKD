import { apiRequest } from '@/lib/http/client';
import type { AuditFilters, AuditFilterOptions, AuditLogDetail, AuditLogPage } from '../types/auditLog';
import { buildAuditQuery } from '../utils/auditQuery';

/** UC-CHUNG-06. Mọi thao tác là đọc; mỗi lần tra cứu và xem chi tiết được BE ghi vào nhật ký. */
export const auditLogApi = {
  search: (filters: AuditFilters, signal?: AbortSignal) =>
    apiRequest<AuditLogPage>(`/audit-logs?${buildAuditQuery(filters)}`, { signal }),
  options: (signal?: AbortSignal) => apiRequest<AuditFilterOptions>('/audit-logs/options', { signal }),
  detail: (id: string, signal?: AbortSignal) => apiRequest<AuditLogDetail>(`/audit-logs/${encodeURIComponent(id)}`, { signal }),
};
