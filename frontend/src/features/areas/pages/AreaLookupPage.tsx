import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useSession } from '@/app/providers/SessionProvider';
import { Button, ButtonLink } from '@/components/button/Button';
import { Pagination } from '@/components/data-table/Pagination';
import { Alert } from '@/components/feedback/Alert';
import { Icon } from '@/components/icon/Icon';
import { StatusBadge } from '@/components/status-badge/StatusBadge';
import { ROUTES } from '@/constants/routes';
import { areasApi } from '../api/areasApi';
import { LevelBadge } from '../components/HierarchyChain';
import {
  AREA_PAGE_SIZE,
  AreaSearchError,
  type AreaListItem,
  type AreaSearchQuery,
  type AreaSearchResult,
  type AreaStatusFilter,
  type AreaTypeCode,
} from '../types/area';
import { AREA_STATUS_BADGE, AREA_TYPES, areaIcon, areaTypeLabel, formatAreaNumber, formatCapacity } from '../utils/areaFormat';
import './Areas.css';

type LookupVariant = 'list' | 'lookup' | 'hierarchy';
type ViewMode = 'table' | 'tree';

const STATUS_OPTIONS: { value: AreaStatusFilter; label: string }[] = [
  { value: 'active', label: 'Hoạt động' },
  { value: 'suspended', label: 'Tạm ngưng' },
  { value: 'all', label: 'Tất cả' },
];

const RESULT_SUFFIX: Record<AreaStatusFilter, string> = {
  active: 'khu vực đang hoạt động',
  suspended: 'khu vực tạm ngưng',
  all: 'khu vực',
};

const DEFAULT_QUERY: AreaSearchQuery = { keyword: '', status: 'active', type: '', parentCode: '', page: 1 };

const KEYWORD_MAX_LENGTH = 100;
const DEBOUNCE_MS = 400;

function readQuery(params: URLSearchParams): AreaSearchQuery {
  const status = params.get('status');
  const type = params.get('type');
  return {
    keyword: (params.get('q') ?? '').slice(0, KEYWORD_MAX_LENGTH),
    status: status === 'suspended' || status === 'all' ? status : 'active',
    type: AREA_TYPES.some((t) => t.value === type) ? (type as AreaTypeCode) : '',
    parentCode: params.get('parent') ?? '',
    page: Math.max(1, Number(params.get('page')) || 1),
  };
}

function toParams(query: AreaSearchQuery, view: ViewMode, defaultView: ViewMode): URLSearchParams {
  const params = new URLSearchParams();
  if (query.keyword) params.set('q', query.keyword);
  if (query.status !== 'active') params.set('status', query.status);
  if (query.type) params.set('type', query.type);
  if (query.parentCode) params.set('parent', query.parentCode);
  if (query.page > 1) params.set('page', String(query.page));
  if (view !== defaultView) params.set('view', view);
  return params;
}

const VARIANT_TEXT: Record<LookupVariant, { crumb: string; title: string; defaultView: ViewMode }> = {
  list: { crumb: 'Danh sách khu vực', title: 'Danh sách khu vực khai thác', defaultView: 'table' },
  lookup: { crumb: 'Tra cứu khu vực', title: 'Tra cứu khu vực khai thác', defaultView: 'table' },
  hierarchy: { crumb: 'Sơ đồ phân cấp', title: 'Sơ đồ phân cấp mặt bằng', defaultView: 'tree' },
};

type LoadState = { kind: 'loading' } | { kind: 'ok'; result: AreaSearchResult } | { kind: 'error' } | { kind: 'forbidden' };

/**
 * UC-ARE-12 · Tra cứu danh sách và tìm kiếm khu vực khai thác (12.1 → 12.6), dùng chung cho "Danh sách khu vực" (01.0)
 * và "Sơ đồ phân cấp" (12.3 – dạng cây). Điều kiện tìm kiếm nằm trên URL để giữ khi quay lại từ trang chi tiết.
 */
export function AreaLookupPage({ variant }: { variant: LookupVariant }) {
  const { user, can } = useAuth();
  const { endSession } = useSession();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const text = VARIANT_TEXT[variant];
  const query = useMemo(() => readQuery(searchParams), [searchParams]);
  const view: ViewMode = searchParams.get('view') === 'tree' ? 'tree' : searchParams.get('view') === 'table' ? 'table' : text.defaultView;
  const queryKey = `${searchParams.toString()}|${view}`;
  const canCreate = can('areas.create');

  const [draft, setDraft] = useState(query.keyword);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [retryCount, setRetryCount] = useState(0);
  const lastResult = useRef<AreaSearchResult | null>(null);
  const requestId = useRef(0);
  const searchInput = useRef<HTMLInputElement>(null);
  const parentOptions = useMemo(() => areasApi.getTree().filter((a) => a.level < 3), []);

  useEffect(() => setDraft(query.keyword), [query.keyword]);

  // Tự tìm sau khi ngừng gõ (debounce – 12.2).
  useEffect(() => {
    if (draft.trim() === query.keyword) return;
    const timer = window.setTimeout(() => update({ keyword: draft.trim() }), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  useEffect(() => {
    if (!user) return;
    const id = ++requestId.current;
    setState({ kind: 'loading' });
    areasApi
      .search({ ...query, userId: user.id, signedInAt: user.signedInAt, all: view === 'tree', retry: retryCount > 0 })
      .then((result) => {
        if (id !== requestId.current) return;
        lastResult.current = result;
        setState({ kind: 'ok', result });
      })
      .catch((error) => {
        if (id !== requestId.current) return;
        if (error instanceof AreaSearchError && error.code === 'SESSION_ENDED') endSession(error.sessionStatus ?? 'expired');
        else if (error instanceof AreaSearchError && error.code === 'FORBIDDEN') setState({ kind: 'forbidden' });
        else setState({ kind: 'error' });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, retryCount, user?.id]);

  function update(patch: Partial<AreaSearchQuery>, nextView: ViewMode = view) {
    const next = { ...query, ...patch };
    if (!('page' in patch)) next.page = 1;
    setRetryCount(0);
    setSearchParams(toParams(next, nextView, text.defaultView));
  }

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    update({ keyword: draft.trim() });
  }

  function reset() {
    setDraft('');
    setRetryCount(0);
    setSearchParams(toParams(DEFAULT_QUERY, view, text.defaultView));
  }

  const filtered = query.keyword !== '' || query.status !== DEFAULT_QUERY.status || query.type !== '' || query.parentCode !== '';
  const shown = state.kind === 'ok' ? state.result : state.kind === 'loading' ? lastResult.current : null;
  const subtitle =
    variant === 'list'
      ? 'Danh mục mặt bằng, bến bãi do Phòng Khai thác quản lý. Chọn một dòng để xem chi tiết (UC-ARE-13).'
      : canCreate
        ? 'Tìm theo mã hoặc tên (không phân biệt hoa/thường, có dấu hoặc không dấu). Chọn một dòng để xem chi tiết (UC-ARE-13).'
        : 'Chế độ chỉ xem – dùng để chọn khu vực khi lập hợp đồng, bảng giá. Chọn một dòng để xem chi tiết (UC-ARE-13).';
  const parentLabel = parentOptions.find((a) => a.code === query.parentCode);

  return (
    <>
      <nav className="breadcrumb" aria-label="Đường dẫn">
        <span>Khu vực khai thác</span>
        <span className="breadcrumb__separator">/</span>
        <span className="breadcrumb__current" aria-current="page">
          {text.crumb}
        </span>
      </nav>

      <div className="page-header">
        <div className="page-header__title">
          <h1>{text.title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="page-header__actions">
          {variant === 'list' ? (
            <ButtonLink to={ROUTES.areaHierarchy} variant="secondary">
              Xem sơ đồ phân cấp
            </ButtonLink>
          ) : (
            <div className="area-segmented" role="radiogroup" aria-label="Kiểu hiển thị">
              {(['table', 'tree'] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={view === mode}
                  className={view === mode ? 'area-segmented__option area-segmented__option--active' : 'area-segmented__option'}
                  onClick={() => update({ page: 1 }, mode)}
                >
                  {mode === 'table' ? 'Dạng bảng' : 'Sơ đồ cây'}
                </button>
              ))}
            </div>
          )}
          {canCreate && <ButtonLink to={ROUTES.areaCreate}>Thêm mới khu vực</ButtonLink>}
        </div>
      </div>

      <form className="area-filters" role="search" onSubmit={handleSearch}>
        <div className="area-filters__row">
          <label className="area-filters__search">
            <Icon name="search" />
            <span className="visually-hidden">Từ khóa</span>
            <input
              ref={searchInput}
              type="search"
              value={draft}
              maxLength={KEYWORD_MAX_LENGTH}
              placeholder="Tìm theo mã hoặc tên khu vực (có dấu / không dấu)"
              onChange={(e) => setDraft(e.target.value)}
            />
            {draft && (
              <button type="button" className="area-filters__clear" aria-label="Xóa từ khóa" onClick={() => update({ keyword: '' })}>
                <Icon name="x" size={16} />
              </button>
            )}
          </label>
          <div className="area-segmented" role="radiogroup" aria-label="Trạng thái">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={query.status === option.value}
                className={query.status === option.value ? 'area-segmented__option area-segmented__option--active' : 'area-segmented__option'}
                onClick={() => update({ status: option.value, keyword: draft.trim() })}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className={query.type ? 'area-filters__select area-filters__select--active' : 'area-filters__select'}>
            <span className="visually-hidden">Loại mặt bằng</span>
            <select value={query.type} onChange={(e) => update({ type: e.target.value as AreaTypeCode | '' })}>
              <option value="">Loại mặt bằng: Tất cả</option>
              {AREA_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  Loại mặt bằng: {t.label}
                </option>
              ))}
            </select>
            <Icon name="chevron" />
          </label>
          <label className={query.parentCode ? 'area-filters__select area-filters__select--active' : 'area-filters__select'}>
            <span className="visually-hidden">Khu vực cấp cha</span>
            <select value={query.parentCode} onChange={(e) => update({ parentCode: e.target.value })}>
              <option value="">Khu vực cấp cha: Tất cả</option>
              {parentOptions.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.level === 2 ? '  ' : ''}
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
            <Icon name="chevron" />
          </label>
          <button type="button" className="area-filters__reset" onClick={reset}>
            Đặt lại
          </button>
          <Button type="submit">Tìm kiếm</Button>
        </div>

        {filtered && (
          <div className="area-chips">
            <span className="area-chips__label">Đang lọc:</span>
            {query.keyword && <Chip label={`Từ khóa: "${query.keyword}"`} onRemove={() => update({ keyword: '' })} />}
            <Chip
              label={`Trạng thái: ${STATUS_OPTIONS.find((o) => o.value === query.status)!.label}`}
              onRemove={query.status === 'active' ? undefined : () => update({ status: 'active' })}
            />
            {query.type && <Chip label={`Loại: ${areaTypeLabel(query.type)}`} onRemove={() => update({ type: '' })} />}
            {query.parentCode && (
              <Chip label={`Khu vực cha: ${parentLabel?.name ?? query.parentCode}`} onRemove={() => update({ parentCode: '' })} />
            )}
          </div>
        )}
      </form>

      {state.kind === 'forbidden' ? (
        <Alert tone="danger" title="Không có quyền tra cứu khu vực">
          Quyền của tài khoản đã thay đổi; hệ thống không hiển thị dữ liệu khu vực.
        </Alert>
      ) : (
        <section className="area-results" aria-busy={state.kind === 'loading'}>
          <div className="area-results__header">
            <h2>
              {state.kind === 'error'
                ? 'Kết quả'
                : !shown
                  ? 'Đang tải danh sách…'
                  : view === 'tree'
                    ? `Sơ đồ phân cấp mặt bằng · ${shown.total} ${RESULT_SUFFIX[query.status]}`
                    : `Kết quả: ${shown.total} ${RESULT_SUFFIX[query.status]}`}
            </h2>
            {state.kind !== 'error' && (
              <p>
                {view === 'tree'
                  ? 'Mở rộng / thu gọn từng nhánh'
                  : query.keyword
                    ? `Khớp không phân biệt dấu với "${query.keyword}"`
                    : 'Sắp xếp: Thứ tự phân cấp'}
              </p>
            )}
          </div>

          {state.kind === 'error' && (
            <div className="area-empty area-empty--inline">
              <span className="area-empty__icon area-empty__icon--danger">
                <Icon name="x-circle" />
              </span>
              <h3>Không tải được danh sách khu vực</h3>
              <p>Kết nối tới cơ sở dữ liệu bị gián đoạn. Điều kiện tìm kiếm của bạn được giữ nguyên.</p>
              <Button onClick={() => setRetryCount((n) => n + 1)}>Tải lại trang</Button>
            </div>
          )}

          {state.kind !== 'error' && shown && shown.total === 0 && (
            <div className="area-empty area-empty--inline">
              <span className="area-empty__icon area-empty__icon--neutral">
                <Icon name="search" />
              </span>
              <h3>Không tìm thấy khu vực nào phù hợp với điều kiện tìm kiếm</h3>
              <p>Vui lòng thử lại với từ khóa hoặc bộ lọc khác.</p>
              <div className="area-empty__actions">
                <Button variant="secondary" onClick={() => searchInput.current?.focus()}>
                  Điều chỉnh điều kiện
                </Button>
                <button type="button" className="area-filters__reset" onClick={reset}>
                  Đặt lại bộ lọc
                </button>
              </div>
            </div>
          )}

          {state.kind !== 'error' && shown && shown.total > 0 && view === 'table' && (
            <LookupTable rows={shown.items} onOpen={(code) => navigate(ROUTES.areaDetail(code))} />
          )}
          {state.kind !== 'error' && shown && shown.total > 0 && view === 'tree' && (
            <LookupTree key={queryKey} result={shown} expandAll={filtered} onOpen={(code) => navigate(ROUTES.areaDetail(code))} />
          )}
        </section>
      )}

      {view === 'table' && state.kind !== 'error' && shown && shown.total > 0 && (
        <Pagination
          page={shown.page}
          total={shown.total}
          size={AREA_PAGE_SIZE}
          sizes={[AREA_PAGE_SIZE]}
          unit="khu vực"
          disabled={state.kind === 'loading'}
          onPageChange={(page) => update({ page })}
          onSizeChange={() => undefined}
        />
      )}
    </>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="area-chip">
      {label}
      {onRemove && (
        <button type="button" aria-label={`Bỏ điều kiện ${label}`} onClick={onRemove}>
          <Icon name="x" size={14} />
        </button>
      )}
    </span>
  );
}

function openOnKey(event: KeyboardEvent, open: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    open();
  }
}

/** 12.1 · Bảng kết quả: nhấp một dòng để mở chi tiết khu vực (UC-ARE-13). */
function LookupTable({ rows, onOpen }: { rows: AreaListItem[]; onOpen: (code: string) => void }) {
  return (
    <div className="lookup-table__wrap">
      <table className="lookup-table">
        <thead>
          <tr>
            <th scope="col">Mã khu vực</th>
            <th scope="col">Tên khu vực</th>
            <th scope="col">Loại mặt bằng</th>
            <th scope="col">Khu vực cấp cha</th>
            <th scope="col">Cấp</th>
            <th scope="col">Diện tích (m²)</th>
            <th scope="col">Sức chứa</th>
            <th scope="col">Phân khu con</th>
            <th scope="col">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.code} tabIndex={0} onClick={() => onOpen(row.code)} onKeyDown={(e) => openOnKey(e, () => onOpen(row.code))}>
              <td>
                <Link to={ROUTES.areaDetail(row.code)} className="area-code" onClick={(e) => e.stopPropagation()}>
                  {row.code}
                </Link>
              </td>
              <td>{row.name}</td>
              <td>{areaTypeLabel(row.type)}</td>
              <td>{row.parentCode ?? '—'}</td>
              <td>{row.level}</td>
              <td>{formatAreaNumber(row.areaSize)}</td>
              <td>{formatCapacity(row.capacity, row.capacityUnit)}</td>
              <td>{row.childCount}</td>
              <td>
                <StatusBadge label={AREA_STATUS_BADGE[row.status].label} tone={AREA_STATUS_BADGE[row.status].tone} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type LookupTreeProps = {
  result: AreaSearchResult;
  /** Đang lọc: mở hết các nhánh để thấy mọi kết quả; mặc định chỉ mở nhánh đầu tiên. */
  expandAll: boolean;
  onOpen: (code: string) => void;
};

/** 12.3 · Sơ đồ cây Cấp 1 → Cấp 2 → Cấp 3 theo đúng bộ lọc; khu vực cha không khớp điều kiện hiển thị mờ để giữ ngữ cảnh. */
function LookupTree({ result, expandAll, onOpen }: LookupTreeProps) {
  const nodes = useMemo(() => {
    const matched = new Set(result.items.map((a) => a.code));
    const all = [...result.items, ...result.context];
    const byParent = new Map<string | null, AreaListItem[]>();
    const codes = new Set(all.map((a) => a.code));
    for (const area of all) {
      // Khu vực có cha không nằm trong kết quả (lọc theo khu vực cha) được đặt ở gốc của cây.
      const parent = area.parentCode && codes.has(area.parentCode) ? area.parentCode : null;
      byParent.set(parent, [...(byParent.get(parent) ?? []), area]);
    }
    for (const list of byParent.values()) list.sort((a, b) => a.code.localeCompare(b.code));
    return { matched, byParent };
  }, [result]);

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const parents = [...nodes.byParent.keys()].filter((k): k is string => k !== null);
    if (expandAll) return new Set(parents);
    const first = nodes.byParent.get(null)?.[0];
    if (!first) return new Set();
    return new Set([first.code, ...(nodes.byParent.get(first.code) ?? []).map((c) => c.code)]);
  });

  function toggle(code: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  const rows: { area: AreaListItem; depth: number }[] = [];
  const visit = (parent: string | null, depth: number) => {
    for (const area of nodes.byParent.get(parent) ?? []) {
      rows.push({ area, depth });
      if (expanded.has(area.code)) visit(area.code, depth + 1);
    }
  };
  visit(null, 0);

  return (
    <div className="lookup-table__wrap">
      <table className="lookup-table lookup-tree" role="treegrid">
        <thead>
          <tr>
            <th scope="col">Khu vực (Cấp 1 → Cấp 2 → Cấp 3)</th>
            <th scope="col">Loại mặt bằng</th>
            <th scope="col">Cấp</th>
            <th scope="col">Diện tích (m²)</th>
            <th scope="col">Sức chứa</th>
            <th scope="col">Phân khu con</th>
            <th scope="col">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ area, depth }) => {
            const hasChildren = (nodes.byParent.get(area.code) ?? []).length > 0;
            const open = expanded.has(area.code);
            const context = !nodes.matched.has(area.code);
            return (
              <tr key={area.code} aria-level={depth + 1} aria-expanded={hasChildren ? open : undefined} className={context ? 'lookup-tree__context' : undefined}>
                <td>
                  <span className="lookup-tree__cell" style={{ paddingLeft: depth * 28 }}>
                    {hasChildren ? (
                      <button
                        type="button"
                        className={open ? 'area-tree__toggle area-tree__toggle--open' : 'area-tree__toggle'}
                        aria-label={open ? `Thu gọn ${area.name}` : `Mở rộng ${area.name}`}
                        onClick={() => toggle(area.code)}
                      >
                        <Icon name="chevron" size={16} />
                      </button>
                    ) : (
                      <span className="area-tree__toggle-space" aria-hidden />
                    )}
                    <Icon name={areaIcon(area)} className="area-tree__icon" />
                    <button type="button" className="lookup-tree__name" onClick={() => onOpen(area.code)}>
                      <span>{area.name}</span>
                      <span className="area-code">{area.code}</span>
                    </button>
                  </span>
                </td>
                <td>{areaTypeLabel(area.type)}</td>
                <td>
                  <LevelBadge level={area.level} />
                </td>
                <td>{formatAreaNumber(area.areaSize)}</td>
                <td>{formatCapacity(area.capacity, area.capacityUnit)}</td>
                <td>{area.childCount}</td>
                <td>
                  <StatusBadge label={AREA_STATUS_BADGE[area.status].label} tone={AREA_STATUS_BADGE[area.status].tone} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
