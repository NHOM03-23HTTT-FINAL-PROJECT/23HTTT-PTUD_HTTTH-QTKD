import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useSession } from '@/app/providers/SessionProvider';
import { Button, ButtonLink } from '@/components/button/Button';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { Pagination } from '@/components/data-table/Pagination';
import { Alert } from '@/components/feedback/Alert';
import { Icon } from '@/components/icon/Icon';
import { StatusBadge } from '@/components/status-badge/StatusBadge';
import { ROUTES } from '@/constants/routes';
import { formatDate } from '@/utils/format';
import { contractsApi } from '../api/contractsApi';
import { ContractActionError, type ContractListItem, type ContractListQuery, type ContractListResult, type ContractScope, type ContractStatus } from '../types/contract';
import { CONTRACT_STATUS_BADGE, CONTRACT_STATUS_OPTIONS } from '../utils/contractStatus';
import type { ContractListState } from './ContractDetailPage';
import './Contracts.css';

const PAGE_SIZES = [10, 20] as const;

const SCOPE_COPY: Record<ContractScope, { title: string; subtitle: string }> = {
  own: { title: 'Hợp đồng của tôi', subtitle: 'Chỉ gồm hợp đồng bạn phụ trách.' },
  department: { title: 'Hợp đồng của phòng', subtitle: 'Hợp đồng thuộc phòng ban bạn quản lý.' },
  granted: { title: 'Danh sách hợp đồng', subtitle: 'Hợp đồng đã vào quy trình phê duyệt trong phạm vi được cấp quyền.' },
  assigned: { title: 'Danh sách hợp đồng', subtitle: 'Hợp đồng đã vào quy trình phê duyệt mà Pháp chế theo dõi.' },
};

export type ContractListVariant = 'all' | 'revision' | 'tracking';

function readQuery(params: URLSearchParams, variant: ContractListVariant): ContractListQuery {
  const size = Number(params.get('size'));
  return {
    keyword: params.get('q') ?? '',
    status: variant === 'revision' ? 'revision-requested' : ((params.get('status') ?? '') as ContractStatus | ''),
    areaCode: params.get('area') ?? '',
    contractType: params.get('type') ?? '',
    page: Math.max(1, Number(params.get('page')) || 1),
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : PAGE_SIZES[0],
  };
}

function toParams(query: ContractListQuery, variant: ContractListVariant): URLSearchParams {
  const params = new URLSearchParams();
  if (query.keyword) params.set('q', query.keyword);
  if (query.status && variant !== 'revision') params.set('status', query.status);
  if (query.areaCode) params.set('area', query.areaCode);
  if (query.contractType) params.set('type', query.contractType);
  if (query.page > 1) params.set('page', String(query.page));
  if (query.size !== PAGE_SIZES[0]) params.set('size', String(query.size));
  return params;
}

function columns(highlight?: string): Column<ContractListItem>[] {
  return [
    { key: 'code', header: 'Mã hợp đồng', width: 130, render: (row) => <Link to={ROUTES.contractDetail(row.code)} className={row.code === highlight ? 'contract-list__code contract-list__code--highlight' : 'contract-list__code'}>{row.code}</Link> },
    { key: 'title', header: 'Tiêu đề · loại hợp đồng', render: (row) => <span className="contract-list__stack"><span>{row.title}</span><small>{row.contractType}</small></span> },
    { key: 'customer', header: 'Khách hàng', width: 200, render: (row) => <span className="contract-list__stack"><span>{row.customerName}</span><small>{row.customerCode}</small></span> },
    { key: 'period', header: 'Hiệu lực', width: 120, render: (row) => <span className="contract-list__stack"><span>{formatDate(row.effectiveFrom)}</span><small>đến {formatDate(row.effectiveTo)}</small></span> },
    { key: 'status', header: 'Trạng thái', width: 170, render: (row) => <span className="contract-list__stack"><StatusBadge label={CONTRACT_STATUS_BADGE[row.status].label} tone={CONTRACT_STATUS_BADGE[row.status].tone} />{row.stepLabel && <small>Bước: {row.stepLabel}</small>}</span> },
    { key: 'owner', header: 'Người phụ trách', width: 140, render: (row) => row.ownerName },
    { key: 'actions', header: '', width: 70, align: 'end', render: (row) => <Link to={ROUTES.contractDetail(row.code)} className="btn btn--ghost" aria-label={`Xem ${row.code}`}>Xem</Link> },
  ];
}

type LoadState = { kind: 'loading' } | { kind: 'ok'; result: ContractListResult } | { kind: 'error' } | { kind: 'forbidden' };

/** SYS-CTR-02 · Xem danh sách hợp đồng theo quyền hạn (02.1 → 02.8); "Cần chỉnh sửa" và "Theo dõi tiến độ" là bộ lọc cố định. */
export function ContractListPage({ variant = 'all' }: { variant?: ContractListVariant }) {
  const { user, can } = useAuth();
  const { endSession } = useSession();
  const location = useLocation();
  const cancelled = (location.state as ContractListState | null)?.cancelled;
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(() => readQuery(searchParams, variant), [searchParams, variant]);
  const queryKey = searchParams.toString();
  const filterOptions = useMemo(() => contractsApi.getListFilterOptions(), []);
  const [draft, setDraft] = useState(query.keyword);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const lastResult = useRef<ContractListResult | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const requestId = useRef(0);

  useEffect(() => setDraft(query.keyword), [query.keyword]);

  useEffect(() => {
    if (!user) return;
    const id = ++requestId.current;
    setState({ kind: 'loading' });
    contractsApi
      .list({ userId: user.id, signedInAt: user.signedInAt, query, variant: variant === 'tracking' ? 'tracking' : 'all', retry: retryCount > 0 })
      .then((result) => {
        if (id !== requestId.current) return;
        lastResult.current = result;
        setState({ kind: 'ok', result });
      })
      .catch((error) => {
        if (id !== requestId.current) return;
        if (error instanceof ContractActionError && error.code === 'SESSION_ENDED') endSession(error.sessionStatus ?? 'expired');
        else if (error instanceof ContractActionError && error.code === 'FORBIDDEN') setState({ kind: 'forbidden' });
        else setState({ kind: 'error' });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, retryCount, user?.id, variant]);

  function update(patch: Partial<ContractListQuery>) {
    const next = { ...query, ...patch };
    if (!('page' in patch)) next.page = 1;
    setRetryCount(0);
    setSearchParams(toParams(next, variant));
  }

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    update({ keyword: draft.trim() });
  }

  function clearFilters() {
    setDraft('');
    setRetryCount(0);
    setSearchParams(new URLSearchParams());
  }

  const shown = state.kind === 'ok' ? state.result : state.kind === 'loading' ? lastResult.current : null;
  const scope = shown?.scope ?? 'own';
  const title = variant === 'revision' ? 'Hợp đồng cần chỉnh sửa' : variant === 'tracking' ? 'Theo dõi tiến độ' : SCOPE_COPY[scope].title;
  const subtitle = variant === 'revision' ? 'Hồ sơ đang ở trạng thái Yêu cầu chỉnh sửa – sửa theo yêu cầu rồi trình lại.' : variant === 'tracking' ? 'Hồ sơ đã gửi trình duyệt trong phạm vi của bạn; mở hồ sơ để xem tiến độ và lịch sử phê duyệt.' : SCOPE_COPY[scope].subtitle;
  const activeFilters = [
    query.keyword && { key: 'keyword', label: `Từ khóa "${query.keyword}"`, clear: () => { setDraft(''); update({ keyword: '' }); } },
    variant !== 'revision' && query.status && { key: 'status', label: `Trạng thái: ${CONTRACT_STATUS_BADGE[query.status].label}`, clear: () => update({ status: '' }) },
    query.areaCode && { key: 'area', label: `Khu vực thực hiện: ${query.areaCode}`, clear: () => update({ areaCode: '' }) },
    query.contractType && { key: 'type', label: query.contractType, clear: () => update({ contractType: '' }) },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  return (
    <>
      <nav className="breadcrumb" aria-label="Đường dẫn"><span>Hợp đồng</span><span className="breadcrumb__separator">/</span><span className="breadcrumb__current" aria-current="page">{title}</span></nav>
      <div className="page-header">
        <div className="page-header__title"><h1>{title}</h1><p>{subtitle}</p></div>
        {can('contracts.create') && <div className="page-header__actions"><ButtonLink to={ROUTES.contractCreate}>+ Tạo hợp đồng</ButtonLink></div>}
      </div>

      {cancelled && <Alert tone="success" title="Hủy hồ sơ thành công">{cancelled} đã chuyển sang Đã hủy; lý do, người hủy và thời điểm hủy được ghi nhận. Mở lại hồ sơ để xem ở chế độ chỉ đọc.</Alert>}

      <form className="contract-filters" role="search" onSubmit={handleSearch}>
        <label className="contract-filters__search">
          <Icon name="search" />
          <span className="visually-hidden">Từ khóa</span>
          <input type="search" value={draft} maxLength={100} placeholder="Tìm theo mã, tiêu đề hoặc khách hàng" onChange={(event) => setDraft(event.target.value)} />
        </label>
        {variant !== 'revision' && (
          <label className="contract-filters__select"><span className="visually-hidden">Trạng thái</span>
            <select value={query.status} onChange={(event) => update({ status: event.target.value as ContractStatus | '' })}>
              <option value="">Tất cả trạng thái</option>
              {CONTRACT_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select><Icon name="chevron" />
          </label>
        )}
        <label className="contract-filters__select"><span className="visually-hidden">Khu vực thực hiện</span>
          <select value={query.areaCode} onChange={(event) => update({ areaCode: event.target.value })}>
            <option value="">Tất cả khu vực thực hiện</option>
            {filterOptions.areas.map((area) => <option key={area.code} value={area.code}>{'— '.repeat(area.level - 1)}{area.code} · {area.name}</option>)}
          </select><Icon name="chevron" />
        </label>
        <label className="contract-filters__select"><span className="visually-hidden">Loại hợp đồng</span>
          <select value={query.contractType} onChange={(event) => update({ contractType: event.target.value })}>
            <option value="">Tất cả loại hợp đồng</option>
            {filterOptions.contractTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select><Icon name="chevron" />
        </label>
        <Button type="submit">Tìm kiếm</Button>
      </form>

      {activeFilters.length > 0 && (
        <div className="contract-chips" aria-label="Điều kiện đang áp dụng">
          <span>Đang áp dụng:</span>
          {activeFilters.map((filter) => <button key={filter.key} type="button" className="contract-chip" onClick={filter.clear}>{filter.label}<Icon name="x" size={12} /></button>)}
          <button type="button" className="contract-filters__reset" onClick={clearFilters}>Xóa bộ lọc</button>
        </div>
      )}

      <section className="contract-results" aria-busy={state.kind === 'loading'}>
        <div className="contract-results__header">
          <h2>{state.kind === 'error' || state.kind === 'forbidden' ? 'Danh sách hợp đồng' : !shown ? 'Đang tải danh sách…' : `${shown.total} hợp đồng`}</h2>
          <p>{activeFilters.length ? 'Kết quả theo điều kiện đang áp dụng, trong phạm vi truy cập của bạn.' : 'Danh sách chỉ gồm hồ sơ thuộc phạm vi truy cập.'}</p>
        </div>
        {state.kind === 'error' && (
          <div className="contract-results__message">
            <Alert tone="danger" title="Không thể tải danh sách hợp đồng" action={<button type="button" className="alert__link" onClick={() => setRetryCount((n) => n + 1)}>Tải lại</button>}>Đã xảy ra lỗi truy xuất dữ liệu; hệ thống không hiển thị thông tin chưa được xác thực. Điều kiện tìm kiếm vẫn được giữ.</Alert>
          </div>
        )}
        {state.kind === 'forbidden' && <div className="contract-results__message"><Alert tone="danger" title="Không có quyền truy cập phân hệ hợp đồng">Quyền của tài khoản đã thay đổi; hệ thống không trả về dữ liệu hợp đồng.</Alert></div>}
        {shown && state.kind !== 'error' && state.kind !== 'forbidden' && shown.total === 0 && (
          <div className="contract-empty">
            <span className="contract-empty__icon"><Icon name="search" /></span>
            <h3>{activeFilters.length ? 'Không có hợp đồng đáp ứng điều kiện tìm kiếm' : 'Chưa có hợp đồng trong phạm vi của bạn'}</h3>
            <p>{activeFilters.length ? 'Thay đổi hoặc xóa bộ lọc để tìm kiếm lại.' : 'Hợp đồng bạn được phân quyền sẽ hiển thị ở đây.'}</p>
            {activeFilters.length > 0 && <Button variant="secondary" onClick={clearFilters}>Xóa bộ lọc</Button>}
          </div>
        )}
        {shown && state.kind !== 'error' && state.kind !== 'forbidden' && shown.total > 0 && <DataTable columns={columns(cancelled)} rows={shown.items} rowKey={(row) => row.code} />}
      </section>

      {shown && state.kind !== 'error' && shown.total > 0 && (
        <Pagination page={shown.page} total={shown.total} size={shown.size} sizes={PAGE_SIZES} unit="hợp đồng" disabled={state.kind === 'loading'} onPageChange={(page) => update({ page })} onSizeChange={(size) => update({ size })} />
      )}
    </>
  );
}
