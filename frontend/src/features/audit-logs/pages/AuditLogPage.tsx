import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { Button } from '@/components/button/Button';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { Pagination } from '@/components/data-table/Pagination';
import { Alert } from '@/components/feedback/Alert';
import { Dialog } from '@/components/feedback/Dialog';
import { InputField } from '@/components/form/InputField';
import { SelectField } from '@/components/form/SelectField';
import { StatusBadge } from '@/components/status-badge/StatusBadge';
import { ROUTES } from '@/constants/routes';
import { IS_MOCK_AUTH } from '@/features/auth/api/authApi';
import { ApiError } from '@/lib/http/client';
import { formatDateTime } from '@/utils/format';
import { auditLogApi } from '../api/auditLogApi';
import {
  EMPTY_AUDIT_FILTERS, type AuditFieldChange, type AuditFilterOptions, type AuditFilters, type AuditLogDetail, type AuditLogItem, type AuditLogPage,
} from '../types/auditLog';
import { actionLabel, entityTypeLabel, formatAuditValue } from '../utils/auditLabels';
import { auditFilterMessage, validateAuditFilters, type AuditFilterError } from '../utils/auditQuery';
import './AuditLogPage.css';

const PAGE_SIZES = [20, 50, 100] as const;
const FILTER_FIELDS = new Set<AuditFilterError['field']>(['fromDate', 'toDate', 'entityId', 'actorId', 'page', 'pageSize']);

/** Lấy lỗi lọc từ body 400 của BE, nếu có. */
function serverFilterError(error: unknown): AuditFilterError | null {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION') return null;
  const body = error.detail as unknown as { field?: string; reason?: string };
  return body.field && body.reason && FILTER_FIELDS.has(body.field as AuditFilterError['field'])
    ? { field: body.field as AuditFilterError['field'], reason: body.reason }
    : null;
}

/** UC-CHUNG-06 · Tra cứu nhật ký truy vết. Đọc từ API thật; không ghi gì ngoài việc BE tự ghi lại lượt tra cứu. */
export function AuditLogPage() {
  const [params] = useSearchParams();
  // A1: mở từ chi tiết hồ sơ với mã đối tượng có sẵn; BE bỏ giới hạn thời gian mặc định khi có entityId.
  const initial = useMemo<AuditFilters>(() => ({ ...EMPTY_AUDIT_FILTERS, entityId: params.get('entityId') ?? '' }), [params]);
  const [draft, setDraft] = useState<AuditFilters>(initial);
  const [applied, setApplied] = useState<AuditFilters>(initial);
  const [options, setOptions] = useState<AuditFilterOptions | null>(null);
  const [data, setData] = useState<AuditLogPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterError, setFilterError] = useState<AuditFilterError | null>(null);
  const [retry, setRetry] = useState(0);
  const [detail, setDetail] = useState<AuditLogItem | null>(null);

  useEffect(() => {
    if (IS_MOCK_AUTH) return;
    const controller = new AbortController();
    auditLogApi.options(controller.signal).then(setOptions).catch(() => setOptions(null));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (IS_MOCK_AUTH) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    auditLogApi.search(applied, controller.signal)
      .then((page) => { setData(page); setFilterError(null); })
      .catch((error) => {
        if (controller.signal.aborted) return;
        const filter = serverFilterError(error);
        if (filter) { setFilterError(filter); return; }
        setLoadError(error instanceof ApiError && error.status === 403
          ? 'Bạn không có quyền xem nhật ký truy vết.'
          : 'Không tải được nhật ký.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [applied, retry]);

  function search(event: FormEvent) {
    event.preventDefault();
    const problem = validateAuditFilters(draft);
    setFilterError(problem);
    if (problem) return;
    setApplied({ ...draft, page: 1 });
  }

  // A4: đặt lại về mặc định (7 ngày gần nhất).
  function reset() {
    setDraft({ ...EMPTY_AUDIT_FILTERS });
    setApplied({ ...EMPTY_AUDIT_FILTERS });
    setFilterError(null);
  }

  const error = (field: AuditFilterError['field']) => (filterError?.field === field ? auditFilterMessage(filterError.reason) : undefined);

  const columns: Column<AuditLogItem>[] = [
    { key: 'time', header: 'Thời điểm', width: 150, render: (row) => formatDateTime(row.actedAt) },
    { key: 'actor', header: 'Người thực hiện', render: (row) => row.actorName ?? '—' },
    { key: 'action', header: 'Hành động', render: (row) => actionLabel(row.action) },
    {
      key: 'entity', header: 'Đối tượng',
      render: (row) => (
        <span className="contract-list__stack">
          <span>{entityTypeLabel(row.entityType)}</span>
          <small>{row.entityCode ?? row.entityId ?? '—'}</small>
        </span>
      ),
    },
    { key: 'status', header: 'Trạng thái', render: (row) => (row.statusBefore || row.statusAfter ? `${row.statusBefore ?? '—'} → ${row.statusAfter ?? '—'}` : '—') },
    { key: 'ip', header: 'IP', width: 130, render: (row) => row.ipAddress ?? '—' },
    { key: 'open', header: '', width: 110, align: 'end', render: (row) => <Button variant="secondary" onClick={() => setDetail(row)}>Chi tiết</Button> },
  ];

  const entityOptions = (options?.entityTypes ?? []).map((value) => ({ value, label: entityTypeLabel(value) }));
  const actionOptions = (options?.actions ?? []).map((value) => ({ value, label: actionLabel(value) }));
  const actorOptions = (options?.actors ?? []).map((actor) => ({ value: actor.id, label: actor.name }));

  return (
    <>
      <nav className="breadcrumb" aria-label="Đường dẫn"><span>Quản trị</span><span className="breadcrumb__separator">/</span><span className="breadcrumb__current" aria-current="page">Nhật ký hệ thống</span></nav>
      <div className="page-header">
        <div className="page-header__title">
          <h1>Nhật ký hệ thống</h1>
          <p>Ai đã làm gì, lúc nào, trên đối tượng nào, giá trị trước và sau. Nhật ký chỉ xem, không sửa hay xóa.</p>
        </div>
      </div>

      {IS_MOCK_AUTH && <Alert tone="info" title="Chỉ hoạt động khi kết nối hệ thống">Nhật ký truy vết đọc dữ liệu thật. Chạy với VITE_AUTH_MODE=api để sử dụng.</Alert>}

      {!IS_MOCK_AUTH && (
        <>
          <form className="audit-filters" onSubmit={search} aria-label="Điều kiện tìm nhật ký">
            <InputField label="Từ ngày" type="date" value={draft.fromDate} error={error('fromDate')}
               onChange={(event) => setDraft((d) => ({ ...d, fromDate: event.target.value }))} />
            <InputField label="Đến ngày" type="date" value={draft.toDate} error={error('toDate')}
              onChange={(event) => setDraft((d) => ({ ...d, toDate: event.target.value }))} />
            <SelectField label="Người thực hiện" placeholder="Tất cả" options={actorOptions} value={draft.actorId}
              onChange={(value) => setDraft((d) => ({ ...d, actorId: value }))} />
            <SelectField label="Loại đối tượng" placeholder="Tất cả" options={entityOptions} value={draft.entityType}
              onChange={(value) => setDraft((d) => ({ ...d, entityType: value }))} />
            <InputField label="Mã đối tượng (UUID)" value={draft.entityId} error={error('entityId')}
              onChange={(event) => setDraft((d) => ({ ...d, entityId: event.target.value }))} />
            <SelectField label="Hành động" placeholder="Tất cả" options={actionOptions} value={draft.action}
              onChange={(value) => setDraft((d) => ({ ...d, action: value }))} />
            <div className="audit-filters__actions">
              <Button type="submit">Tìm</Button>
              <Button variant="secondary" onClick={reset}>Đặt lại</Button>
            </div>
          </form>

          {loadError && (
            <div className="contract-results__message">
              <Alert tone="danger" title={loadError} action={<button type="button" className="alert__link" onClick={() => setRetry((n) => n + 1)}>Tải lại</button>}>
                {loadError.startsWith('Bạn không có') ? 'Chỉ người có quyền nhật ký mới xem được.' : 'Kết quả hiện tại có thể chưa đầy đủ.'}
              </Alert>
            </div>
          )}

          {!loadError && data && data.items.length === 0 && (
            <div className="contract-results__message">
              <Alert tone="info" title="Không có nhật ký phù hợp với điều kiện tìm kiếm">Thử đổi khoảng thời gian hoặc bỏ bớt điều kiện lọc.</Alert>
            </div>
          )}

          {!loadError && data && data.items.length > 0 && (
            <section className="contract-results">
              <div className="contract-results__header">
                <h2>{loading ? 'Đang tải…' : `${data.total} bản ghi`}</h2>
              </div>
              <DataTable columns={columns} rows={data.items} rowKey={(row) => row.id} />
              <Pagination page={applied.page} total={data.total} size={applied.pageSize} sizes={PAGE_SIZES} unit="bản ghi" disabled={loading}
                onPageChange={(page) => setApplied((a) => ({ ...a, page }))}
                onSizeChange={(pageSize) => setApplied((a) => ({ ...a, pageSize, page: 1 }))} />
            </section>
          )}
        </>
      )}

      {detail && <AuditDetailDialog item={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

function AuditDetailDialog({ item, onClose }: { item: AuditLogItem; onClose: () => void }) {
  const { can } = useAuth();
  const [full, setFull] = useState<AuditLogDetail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    auditLogApi.detail(item.id, controller.signal)
      .then(setFull)
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [item.id]);

  // A2: mở đối tượng liên quan nếu còn tồn tại và người xem có quyền xem loại đó.
  function entityLink() {
    if (!item.entityCode) {
      return item.entityType === 'Contract' || item.entityType === 'Area'
        ? <span>Đối tượng không còn tồn tại.</span>
        : <span>—</span>;
    }
    if (item.entityType === 'Contract' && can('contracts.view')) return <Link to={ROUTES.contractDetail(item.entityCode)}>{item.entityCode}</Link>;
    if (item.entityType === 'Area' && can('areas.view')) return <Link to={ROUTES.areaDetail(item.entityCode)}>{item.entityCode}</Link>;
    return <span>{item.entityCode}</span>;
  }

  return (
    <Dialog title="Chi tiết nhật ký" width={960} onClose={onClose} actions={<Button variant="secondary" onClick={onClose}>Đóng</Button>}>
      <dl className="audit-detail">
        <dt>Thời điểm</dt><dd>{formatDateTime(item.actedAt)}</dd>
        <dt>Người thực hiện</dt><dd>{item.actorName ?? '—'}</dd>
        <dt>Hành động</dt><dd>{actionLabel(item.action)}</dd>
        <dt>Đối tượng</dt><dd>{entityTypeLabel(item.entityType)} · {entityLink()}</dd>
        <dt>Trạng thái</dt><dd>{item.statusBefore || item.statusAfter ? <><StatusBadge label={item.statusBefore ?? '—'} /> → <StatusBadge label={item.statusAfter ?? '—'} /></> : '—'}</dd>
        <dt>IP</dt><dd>{item.ipAddress ?? '—'}</dd>
      </dl>
      {failed && <Alert tone="danger" title="Không tải được chi tiết">Thử mở lại dòng nhật ký.</Alert>}
      {full && (
        <>
          {full.note && <p className="audit-detail__note"><strong>Ghi chú:</strong> {full.note}</p>}
          <h3>Thay đổi</h3>
          {full.changes.length === 0
            ? <p>Không có trường nào thay đổi.</p>
            : <ChangeTable changes={full.changes} />}
        </>
      )}
    </Dialog>
  );
}

function ChangeTable({ changes }: { changes: AuditFieldChange[] }) {
  return (
    // Giá trị JSON có thể rất dài: bảng tự cuộn để hộp thoại không vượt quá màn hình.
    <div className="audit-changes__scroll">
      <table className="audit-changes">
        <thead><tr><th>Trường</th><th>Trước</th><th>Sau</th></tr></thead>
        <tbody>
          {changes.map((change) => (
            <tr key={change.field}>
              <td>{change.field}</td>
              <td><pre>{formatAuditValue(change.before)}</pre></td>
              <td><pre>{formatAuditValue(change.after)}</pre></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
