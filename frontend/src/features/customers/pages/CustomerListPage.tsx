import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useSession } from '@/app/providers/SessionProvider';
import { Button, ButtonLink } from '@/components/button/Button';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { Pagination } from '@/components/data-table/Pagination';
import { Alert } from '@/components/feedback/Alert';
import { Icon } from '@/components/icon/Icon';
import { StatusBadge } from '@/components/status-badge/StatusBadge';
import { ROUTES } from '@/constants/routes';
import { formatDateTime } from '@/utils/format';
import { customersApi } from '../api/customersApi';
import {
  CUSTOMER_PAGE_SIZES,
  CustomerSearchError,
  type CustomerListItem,
  type CustomerSearchQuery,
  type CustomerSearchResult,
  type CustomerSort,
  type CustomerStatusFilter,
} from '../types/customerList';
import {
  CUSTOMER_SORT_LABELS,
  DEFAULT_CUSTOMER_QUERY,
  KEYWORD_MAX_LENGTH,
  readCustomerQuery,
  toCustomerQueryParams,
  validateCustomerQuery,
} from '../utils/customerSearch';
import { CUSTOMER_STATUS_BADGE } from './CustomerDetailPage';
import './CustomerPages.css';
import './CustomerList.css';

const STATUS_OPTIONS: { value: CustomerStatusFilter; label: string }[] = [
  { value: 'active', label: 'Hoạt động' },
  { value: 'suspended', label: 'Tạm ngưng' },
  { value: 'all', label: 'Tất cả' },
];

const STATUS_SCOPE_TEXT: Record<CustomerStatusFilter, string> = {
  active: 'Trạng thái Hoạt động',
  suspended: 'Trạng thái Tạm ngưng',
  all: 'Hoạt động và Tạm ngưng',
};

const COLUMNS: Column<CustomerListItem>[] = [
  {
    key: 'code',
    header: 'Mã khách hàng',
    width: 130,
    render: (row) => (
      <Link to={ROUTES.customerDetail(row.code)} className="customer-list__code">
        {row.code}
      </Link>
    ),
  },
  {
    key: 'name',
    header: 'Tên khách hàng',
    render: (row) => (
      <span className="customer-list__name">
        <span>{row.name}</span>
        <span className="customer-list__address">{row.address}</span>
      </span>
    ),
  },
  { key: 'taxCode', header: 'Mã số thuế', width: 140, render: (row) => row.taxCode },
  {
    key: 'status',
    header: 'Trạng thái',
    width: 120,
    render: (row) => <StatusBadge label={CUSTOMER_STATUS_BADGE[row.status].label} tone={CUSTOMER_STATUS_BADGE[row.status].tone} />,
  },
  { key: 'updatedAt', header: 'Cập nhật', width: 110, render: (row) => formatDateTime(row.updatedAt).slice(0, 10) },
  {
    key: 'actions',
    header: '',
    width: 80,
    align: 'end',
    render: (row) => (
      <Link to={ROUTES.customerDetail(row.code)} className="btn btn--ghost" aria-label={`Xem ${row.code} – ${row.name}`}>
        Xem
      </Link>
    ),
  },
];

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ok'; result: CustomerSearchResult }
  | { kind: 'error'; reference?: string }
  | { kind: 'forbidden' };

/** UC-CUS-05 · Tìm khách hàng phục vụ công việc Kinh doanh – frame 05.1 → 05.4. */
export function CustomerListPage() {
  const { user, can } = useAuth();
  const { endSession } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(() => readCustomerQuery(searchParams), [searchParams]);
  const problems = useMemo(() => validateCustomerQuery(query), [query]);
  const queryKey = searchParams.toString();

  const [draft, setDraft] = useState(query.keyword);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  // Kết quả cuối cùng hợp lệ, giữ hiển thị trong lúc tải trang mới.
  const lastResult = useRef<CustomerSearchResult | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const requestId = useRef(0);

  useEffect(() => setDraft(query.keyword), [query.keyword]);

  useEffect(() => {
    if (!user || problems.length > 0) return;
    const id = ++requestId.current;
    setState({ kind: 'loading' });
    customersApi
      .search({ ...query, userId: user.id, signedInAt: user.signedInAt, retry: retryCount > 0 })
      .then((result) => {
        if (id !== requestId.current) return;
        lastResult.current = result;
        setState({ kind: 'ok', result });
      })
      .catch((error) => {
        if (id !== requestId.current) return;
        if (error instanceof CustomerSearchError && error.code === 'SESSION_ENDED') endSession(error.sessionStatus ?? 'expired');
        else if (error instanceof CustomerSearchError && error.code === 'FORBIDDEN') setState({ kind: 'forbidden' });
        else setState({ kind: 'error', reference: error instanceof CustomerSearchError ? error.reference : undefined });
      });
    // Chạy lại khi điều kiện trên URL đổi (A5.2) hoặc khi người dùng chọn "Thử lại".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, retryCount, user?.id]);

  function update(patch: Partial<CustomerSearchQuery>) {
    const next = { ...query, ...patch };
    // Đổi điều kiện lọc hay số dòng thì về trang 1.
    if (!('page' in patch)) next.page = 1;
    setRetryCount(0);
    setSearchParams(toCustomerQueryParams(next));
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

  const filtered =
    query.keyword !== '' || query.status !== DEFAULT_CUSTOMER_QUERY.status || query.sort !== DEFAULT_CUSTOMER_QUERY.sort;
  const shown = state.kind === 'ok' ? state.result : state.kind === 'loading' ? lastResult.current : null;
  const hasSuspended = (shown?.items ?? []).some((item) => item.status === 'suspended');
  const statusLabel = STATUS_OPTIONS.find((o) => o.value === query.status)?.label ?? '';

  return (
    <>
      <nav className="breadcrumb" aria-label="Đường dẫn">
        <span>Khách hàng</span>
        <span className="breadcrumb__separator">/</span>
        <span className="breadcrumb__current" aria-current="page">
          Danh sách
        </span>
      </nav>

      <div className="page-header">
        <div className="page-header__title">
          <h1>Danh sách khách hàng</h1>
          <p>Tìm theo mã, tên hoặc mã số thuế trong phạm vi được phân công.</p>
        </div>
        {can('customers.create') && (
          <div className="page-header__actions">
            <ButtonLink to={ROUTES.customerCreate}>+ Tạo khách hàng</ButtonLink>
          </div>
        )}
      </div>

      <form className="customer-filters" role="search" onSubmit={handleSearch}>
        <label className="customer-filters__search">
          <Icon name="search" />
          <span className="visually-hidden">Từ khóa</span>
          <input
            type="search"
            value={draft}
            maxLength={KEYWORD_MAX_LENGTH}
            placeholder="Tìm theo mã khách hàng, tên hoặc mã số thuế"
            onChange={(e) => setDraft(e.target.value)}
          />
          {draft && (
            <button type="button" className="customer-filters__clear" aria-label="Xóa từ khóa" onClick={() => setDraft('')}>
              <Icon name="x" size={16} />
            </button>
          )}
        </label>
        <div className="segmented" role="radiogroup" aria-label="Trạng thái">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={query.status === option.value}
              className={query.status === option.value ? 'segmented__option segmented__option--active' : 'segmented__option'}
              onClick={() => update({ status: option.value, keyword: draft.trim() })}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="customer-filters__sort">
          <span className="visually-hidden">Sắp xếp</span>
          <select value={query.sort} onChange={(e) => update({ sort: e.target.value as CustomerSort })}>
            {(Object.keys(CUSTOMER_SORT_LABELS) as CustomerSort[]).map((sort) => (
              <option key={sort} value={sort}>
                Sắp xếp: {CUSTOMER_SORT_LABELS[sort]}
              </option>
            ))}
          </select>
          <Icon name="chevron" />
        </label>
        <Button type="submit">Tìm kiếm</Button>
        {filtered && (
          <button type="button" className="customer-filters__reset" onClick={clearFilters}>
            Xóa bộ lọc
          </button>
        )}
      </form>

      {problems.length > 0 && (
        <Alert
          tone="warning"
          title="Điều kiện tìm kiếm không hợp lệ"
          action={
            <button type="button" className="alert__link" onClick={clearFilters}>
              Đặt lại điều kiện
            </button>
          }
        >
          {problems.join(' ')} Hệ thống chưa chạy truy vấn cho tới khi điều kiện được sửa.
        </Alert>
      )}

      {problems.length === 0 && hasSuspended && query.status !== 'active' && (
        <Alert tone="info" title="Khách hàng Tạm ngưng vẫn có trong kết quả">
          Xuất hiện trong kết quả tra cứu không đồng nghĩa được chọn để tạo giao dịch dịch vụ mới. Đối chiếu mã khách hàng và mã
          số thuế để phân biệt khách hàng trùng tên.
        </Alert>
      )}

      {problems.length === 0 && (
        <section className="customer-results" aria-busy={state.kind === 'loading'}>
          <div className="customer-results__header">
            {state.kind === 'error' ? (
              <>
                <h2>Kết quả tìm kiếm</h2>
                <p>
                  {query.keyword ? `Từ khóa "${query.keyword}" · ` : ''}
                  {STATUS_SCOPE_TEXT[query.status]}
                </p>
              </>
            ) : (
              <>
                <h2>
                  {!shown
                    ? 'Đang tải danh sách…'
                    : query.keyword
                      ? `${shown.total} kết quả cho "${query.keyword}"`
                      : `${shown.total} khách hàng${query.status === 'all' ? '' : ` ${statusLabel}`}`}
                </h2>
                <p>
                  {query.keyword
                    ? `${STATUS_SCOPE_TEXT[query.status]} · trong phạm vi của bạn`
                    : 'Chỉ gồm khách hàng trong phạm vi được phân công cho bạn'}
                </p>
              </>
            )}
          </div>

          {state.kind === 'error' && (
            <div className="customer-results__message">
              <Alert
                tone="danger"
                title="Chưa truy xuất được danh sách khách hàng"
                action={
                  <button type="button" className="alert__link" onClick={() => setRetryCount((n) => n + 1)}>
                    Thử lại
                  </button>
                }
              >
                Đã xảy ra lỗi khi tải dữ liệu{state.reference ? ` (mã lỗi ${state.reference})` : ''}. Đây không phải kết quả
                "không có khách hàng"; các điều kiện tìm kiếm vẫn được giữ.
              </Alert>
            </div>
          )}

          {state.kind === 'forbidden' && (
            <div className="customer-results__message">
              <Alert tone="danger" title="Không có quyền tra cứu khách hàng">
                Quyền của tài khoản đã thay đổi; hệ thống không hiển thị bản ghi hay số lượng ngoài quyền.
              </Alert>
            </div>
          )}

          {shown && state.kind !== 'error' && state.kind !== 'forbidden' && shown.total === 0 && (
            <div className="customer-empty">
              <span className="customer-empty__icon">
                <Icon name="search" />
              </span>
              <h3>Không tìm thấy khách hàng phù hợp</h3>
              <p>
                {query.keyword
                  ? `Không có khách hàng nào trong phạm vi của bạn khớp "${query.keyword}" với ${query.status === 'all' ? 'mọi trạng thái' : `trạng thái ${statusLabel}`}.`
                  : `Chưa có khách hàng ${query.status === 'all' ? '' : statusLabel} nào trong phạm vi của bạn.`}
                {query.status !== 'all' && ' Thử đổi từ khóa hoặc chọn "Tất cả" trạng thái.'}
              </p>
              <div className="customer-empty__actions">
                {filtered && (
                  <Button variant="secondary" onClick={clearFilters}>
                    Xóa bộ lọc
                  </Button>
                )}
                {can('customers.create') && (
                  <Link to={ROUTES.customerCreate} className="btn btn--ghost">
                    Tạo khách hàng mới
                  </Link>
                )}
              </div>
            </div>
          )}

          {shown && state.kind !== 'error' && state.kind !== 'forbidden' && shown.total > 0 && (
            <DataTable columns={COLUMNS} rows={shown.items} rowKey={(row) => row.code} />
          )}
        </section>
      )}

      {problems.length === 0 && shown && state.kind !== 'error' && shown.total > 0 && (
        <Pagination
          page={shown.page}
          total={shown.total}
          size={shown.size}
          sizes={CUSTOMER_PAGE_SIZES}
          unit={query.keyword ? 'kết quả' : 'khách hàng'}
          disabled={state.kind === 'loading'}
          onPageChange={(page) => update({ page })}
          onSizeChange={(size) => update({ size })}
        />
      )}
    </>
  );
}
