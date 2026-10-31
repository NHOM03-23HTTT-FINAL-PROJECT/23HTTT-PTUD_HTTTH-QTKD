import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { Button, ButtonLink } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { useToast } from '@/components/feedback/Toast';
import { Icon, type IconName } from '@/components/icon/Icon';
import { StatusBadge } from '@/components/status-badge/StatusBadge';
import { ROUTES } from '@/constants/routes';
import { formatDateTime, todayIso } from '@/utils/format';
import { areasApi } from '../api/areasApi';
import {
  AreaMap,
  ChildrenTab,
  ContractsTab,
  expiresSoon,
  HistoryTab,
  isContractActive,
  PriceListsTab,
  ServicesTab,
  StaffTab,
  SummaryCard,
} from '../components/AreaRecordTabs';
import { EndStaffDialog, ServicesDialog, StaffAssignDialog, StatusDialog } from '../components/AreaOperationDialogs';
import { ChangeParentFlow } from '../components/ChangeParentFlow';
import { ExportProfileDialog } from '../components/ExportProfileDialog';
import { HierarchyChain, type ChainNode } from '../components/HierarchyChain';
import { PathChangeTable } from '../components/PathChangeTable';
import { useAreaRecords, type AreaRecordsState } from '../hooks/useAreaRecords';
import type {
  Area,
  AreaField,
  AreaFieldChange,
  AreaPathChange,
  AreaRecordData,
  AreaRecordGroup,
  AreaRef,
  AreaStaff,
  AreaStatus,
} from '../types/area';
import { AREA_FIELD_LABELS, currentVersionEntry } from '../utils/areaChanges';
import { AREA_STATUS_BADGE, areaTypeLabel, formatAreaSize, formatCapacity } from '../utils/areaFormat';
import { ancestryOf, childrenOf } from '../utils/areaHierarchy';
import './Areas.css';

/** State khi chuyển từ biểu mẫu tạo (01.6), chỉnh sửa (04.7) hoặc sau khi đổi khu vực cha (02.7). */
export type AreaDetailState = {
  created?: boolean;
  /** Hồ sơ/thay đổi đã được ghi ở lần gửi trước, không ghi thêm. */
  replayed?: boolean;
  hierarchy?: { changes: AreaPathChange[]; previousParent: AreaRef | null };
  updated?: { changes: AreaFieldChange[]; version: number; reason: string; by: string; at: string };
  /** Vừa tạm ngưng / mở lại khu vực. */
  statusChanged?: { status: AreaStatus; reason: string };
};

/** Hộp thoại thao tác chỉ dành cho Trưởng phòng Khai thác. */
type Operation = { kind: 'staff' } | { kind: 'end-staff'; person: AreaStaff } | { kind: 'services' } | { kind: 'status' };

type TabKey = 'tong-quan' | 'phan-khu-con' | 'dich-vu' | 'nhan-su' | 'bang-gia' | 'hop-dong' | 'lich-su';

const TABS: { key: TabKey; label: string; group?: AreaRecordGroup }[] = [
  { key: 'tong-quan', label: 'Tổng quan' },
  { key: 'phan-khu-con', label: 'Phân khu con' },
  { key: 'dich-vu', label: 'Dịch vụ khai thác', group: 'services' },
  { key: 'nhan-su', label: 'Nhân sự phụ trách', group: 'staff' },
  { key: 'bang-gia', label: 'Bảng giá dịch vụ', group: 'priceLists' },
  { key: 'hop-dong', label: 'Hợp đồng & Sản lượng', group: 'contracts' },
  { key: 'lich-su', label: 'Lịch sử biến động' },
];

/**
 * UC-ARE-13 · Xem hồ sơ chi tiết và thông tin liên kết của khu vực (13.1 → 13.11); đồng thời là trang đích của 01.6,
 * 02.7 và 04.7. Người không có quyền quản lý khu vực xem ở chế độ chỉ đọc (13.9).
 */
export function AreaDetailPage() {
  const { code = '' } = useParams();
  const area = areasApi.getArea(code);
  if (!area) return <AreaNotFound />;
  // key theo phiên bản để làm mới toàn bộ trang sau khi cập nhật.
  return <AreaProfile key={`${area.id}-${area.version}`} area={area} />;
}

/** 13.10 · Không hiển thị tên hay chi tiết hồ sơ khi AreaId không hợp lệ hoặc đã bị gỡ. */
export function AreaNotFound() {
  const { can } = useAuth();
  // Phòng Khai thác (có quyền tạo/cập nhật) dùng Danh sách khu vực; các phòng khác dùng Tra cứu khu vực.
  const operations = can('areas.update');
  const listPath = operations ? ROUTES.areas : ROUTES.areaLookup;
  return (
    <>
      <nav className="breadcrumb" aria-label="Đường dẫn">
        <span>Khu vực khai thác</span>
        <span className="breadcrumb__separator">/</span>
        <Link to={listPath}>{operations ? 'Danh sách khu vực' : 'Tra cứu khu vực'}</Link>
        <span className="breadcrumb__separator">/</span>
        <span className="breadcrumb__current" aria-current="page">
          Không tìm thấy hồ sơ
        </span>
      </nav>
      <section className="area-card area-empty area-empty--page">
        <span className="area-empty__icon area-empty__icon--neutral">
          <Icon name="alert" />
        </span>
        <h3>Hồ sơ khu vực không tồn tại hoặc đã bị gỡ bỏ khỏi hệ thống</h3>
        <p>Đường dẫn có thể đã cũ hoặc khu vực đã bị xóa mềm. Vui lòng quay lại danh sách để tìm khu vực khác.</p>
        <ButtonLink to={listPath}>Quay lại danh sách khu vực</ButtonLink>
      </section>
    </>
  );
}

function AreaProfile({ area }: { area: Area }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [changingParent, setChangingParent] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [operation, setOperation] = useState<Operation | null>(null);
  const { showToast } = useToast();
  const [exportedAt, setExportedAt] = useState<string | null>(null);
  const state = location.state as AreaDetailState | null;
  const records = useAreaRecords(area.id);
  // Cập nhật/điều chỉnh phân cấp: Trưởng phòng và Nhân viên Khai thác được giao quyền (UC-ARE-04 / 02).
  const canUpdate = can('areas.update');
  // Phân công nhân sự, gán dịch vụ, tạm ngưng: chỉ Trưởng phòng Khai thác (13.1 / 13.3 / 13.4).
  const canManage = can('areas.manage');

  // Vùng làm việc giữ vị trí cuộn giữa các trang: đưa về đầu để thấy banner kết quả (01.6 / 02.7 / 04.7).
  useEffect(() => {
    document.querySelector('.app-shell__workspace')?.scrollTo(0, 0);
  }, []);

  const tree = areasApi.getTree();
  const chain = ancestryOf(tree, area.code);
  const parent = chain.length > 1 ? chain[chain.length - 2] : null;
  const children = childrenOf(tree, area.code);
  const neighbor = parent ? childrenOf(tree, parent.code).find((a) => a.code !== area.code) : undefined;
  const listPath = canUpdate ? ROUTES.areas : ROUTES.areaLookup;
  const changedFields = new Set<AreaField>(state?.updated?.changes.map((c) => c.field) ?? []);
  if (state?.hierarchy) changedFields.add('parentCode');

  const requestedTab = searchParams.get('tab') as TabKey | null;
  const tab = TABS.some((t) => t.key === requestedTab) ? requestedTab! : 'tong-quan';
  // Giữ state điều hướng để banner kết quả thao tác không mất khi đổi tab.
  const selectTab = (key: TabKey) => setSearchParams(key === 'tong-quan' ? {} : { tab: key }, { replace: true, state: location.state });

  /** Sau phân công / gán dịch vụ: tải lại nhóm liên kết và đọc lại hồ sơ để tab Lịch sử biến động có mục mới. */
  function afterOperation(group: AreaRecordGroup, title: string, description: string) {
    setOperation(null);
    records.retry(group);
    showToast({ title, description });
    navigate(`${location.pathname}${location.search}`, { replace: true, state: location.state });
  }

  const badge = AREA_STATUS_BADGE[area.status];
  const versionEntry = currentVersionEntry(area);
  const lastEntry = area.history[area.history.length - 1];
  const openArea = (code: string) => navigate(ROUTES.areaDetail(code));

  function tabCount(key: TabKey, group?: AreaRecordGroup): number | undefined {
    if (key === 'phan-khu-con') return children.length;
    if (key === 'lich-su') return area.history.length;
    if (!group) return undefined;
    const groupState = records.state[group];
    if (groupState.status !== 'ok') return undefined;
    return group === 'contracts' ? (groupState.data as AreaRecordData['contracts']).items.length : (groupState.data as unknown[]).length;
  }

  const chainNodes: ChainNode[] = [
    ...chain.map((node) => ({
      code: node.code,
      name: node.name,
      level: node.level,
      linked: true,
      current: node.code === area.code,
      note: node.code === area.code ? (state?.created ? 'Vừa tạo' : 'Đang xem') : undefined,
    })),
    ...children.map((child) => ({ code: child.code, name: child.name, level: child.level, linked: true })),
  ];

  return (
    <>
      <nav className="breadcrumb" aria-label="Đường dẫn">
        <span>Khu vực khai thác</span>
        <span className="breadcrumb__separator">/</span>
        <Link to={listPath}>{canUpdate ? 'Danh sách khu vực' : 'Tra cứu khu vực'}</Link>
        <span className="breadcrumb__separator">/</span>
        <span className="breadcrumb__current" aria-current="page">
          {area.code}
        </span>
      </nav>

      <div className="page-header">
        <div className="page-header__title">
          <div className="area-title">
            <h1>{area.name}</h1>
            <StatusBadge label={badge.label} tone={badge.tone} />
          </div>
          <p>
            {area.code} · {areaTypeLabel(area.type)} · Cấp {area.level}
            {parent ? ` · Thuộc ${parent.name} (${parent.code})` : ' · Khu vực Cấp 1 độc lập'}
            {!canUpdate && ' · Chế độ chỉ xem'}
          </p>
        </div>
        <div className="page-header__actions">
          <Button variant="secondary" onClick={() => setExporting(true)}>
            Xuất file lý lịch
          </Button>
          <ButtonLink to={listPath} variant="secondary">
            Về danh sách
          </ButtonLink>
          {canUpdate && (
            <AreaActionsMenu
              area={area}
              canManage={canManage}
              onChangeParent={() => setChangingParent(true)}
              onOperation={(kind) => setOperation({ kind })}
            />
          )}
        </div>
      </div>

      <ResultBanners area={area} parent={parent} state={state} />
      {exportedAt && (
        <Alert tone="success" title="Đã xuất file lý lịch khu vực">
          Tệp lý lịch {area.code} được mở để in/lưu PDF lúc {formatDateTime(exportedAt)}; nhật ký đã ghi nhận người xuất và thời
          điểm xuất.
        </Alert>
      )}

      <div className="area-tabs" role="tablist" aria-label="Nhóm thông tin">
        {TABS.map((item) => {
          const count = tabCount(item.key, item.group);
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              className={tab === item.key ? 'area-tabs__tab area-tabs__tab--active' : 'area-tabs__tab'}
              onClick={() => selectTab(item.key)}
            >
              {count === undefined ? item.label : `${item.label} (${count})`}
            </button>
          );
        })}
      </div>

      {tab === 'tong-quan' && (
        <>
          <OverviewSummary items={children} records={records.state} />
          <div className="area-layout">
            <div className="area-layout__main">
              <section className="area-card">
                <div className="area-card__heading">
                  <h2>Thông tin định danh &amp; thông số kỹ thuật</h2>
                </div>
                <dl className="area-detail__grid">
                  <DetailItem label="Mã khu vực" changed={changedFields.has('code')} value={<span className="area-code">{area.code}</span>} />
                  <DetailItem label="Tên khu vực" changed={changedFields.has('name')} value={area.name} />
                  <DetailItem label="Loại mặt bằng" changed={changedFields.has('type')} value={areaTypeLabel(area.type)} />
                  <DetailItem
                    label="Khu vực cấp cha"
                    changed={changedFields.has('parentCode')}
                    value={
                      parent ? (
                        <Link to={ROUTES.areaDetail(parent.code)} className="area-detail__link">
                          {parent.code} · {parent.name}
                        </Link>
                      ) : (
                        'Không có – khu vực Cấp 1'
                      )
                    }
                  />
                  <DetailItem label="Cấp phân cấp" value={`Cấp ${area.level}`} />
                  <DetailItem label="Trạng thái" value={<StatusBadge label={badge.label} tone={badge.tone} />} />
                  <DetailItem label="Tọa độ GPS" changed={changedFields.has('gps')} value={area.gps || '—'} />
                  <DetailItem label="Diện tích mặt bằng" changed={changedFields.has('areaSize')} value={formatAreaSize(area.areaSize)} />
                  <DetailItem
                    label="Sức chứa thiết kế"
                    changed={changedFields.has('capacity') || changedFields.has('capacityUnit')}
                    value={formatCapacity(area.capacity, area.capacityUnit)}
                  />
                  <DetailItem label="Mô tả quy chuẩn kỹ thuật" changed={changedFields.has('standards')} value={area.standards || '—'} wide />
                </dl>
              </section>

              {state?.updated && state.updated.changes.length > 0 && (
                <section className="area-card">
                  <div className="area-card__heading">
                    <h2>Thay đổi vừa lưu</h2>
                    <p>
                      Ghi nhật ký: {state.updated.by} · {formatDateTime(state.updated.at)}
                      {state.updated.reason && ` · Lý do: ${state.updated.reason}`}
                    </p>
                  </div>
                  <div className="path-table__wrap">
                    <table className="path-table">
                      <thead>
                        <tr>
                          <th scope="col">Trường</th>
                          <th scope="col">Trước</th>
                          <th scope="col">Sau</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.updated.changes.map((change) => (
                          <tr key={change.field}>
                            <th scope="row">{AREA_FIELD_LABELS[change.field]}</th>
                            <td>
                              <del className="path-table__before">{change.before}</del>
                            </td>
                            <td>
                              <span className="path-table__after">{change.after}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {state?.hierarchy && state.hierarchy.changes.length > 0 && (
                <section className="area-card">
                  <div className="area-card__heading">
                    <h2>Thay đổi cấu trúc phân cấp</h2>
                    <p>Thông tin snapshot trên bảng giá, hợp đồng đã phát sinh được giữ nguyên (ARE-08).</p>
                  </div>
                  <PathChangeTable changes={state.hierarchy.changes} saved />
                </section>
              )}

              <AreaMap area={area} items={children} neighbor={neighbor} />
            </div>

            <aside className="area-layout__side">
              <section className="side-card">
                <h2 className="side-card__title">Vị trí trong sơ đồ phân cấp</h2>
                <p className="side-card__subtitle">Tối đa 3 cấp logic (ARE-03).</p>
                <HierarchyChain nodes={chainNodes} />
                <div className="side-card__item">
                  <span className="side-card__label">Đường dẫn phân cấp (HierarchyPath)</span>
                  <span className="side-card__value">{area.path}</span>
                </div>
              </section>
              <section className="side-card">
                <h2 className="side-card__title">Tạo &amp; cập nhật</h2>
                <div className="side-card__item">
                  <span className="side-card__label">Phiên bản</span>
                  <span className="side-card__value">
                    Phiên bản {area.version} · {formatDateTime(versionEntry.at)} · {versionEntry.by}
                  </span>
                </div>
                <div className="side-card__item">
                  <span className="side-card__label">Người tạo</span>
                  <span className="side-card__value">
                    {area.createdBy} · {formatDateTime(area.createdAt)}
                  </span>
                </div>
                <div className="side-card__item">
                  <span className="side-card__label">Nhật ký gần nhất (ARE-11)</span>
                  <span className="side-card__value">
                    {lastEntry.changes?.length
                      ? `${lastEntry.action}: ${lastEntry.changes.map((c) => AREA_FIELD_LABELS[c.field].toLowerCase()).join(', ')}`
                      : `${lastEntry.action} – ${lastEntry.detail}`}
                  </span>
                </div>
              </section>
            </aside>
          </div>
        </>
      )}

      {tab === 'phan-khu-con' && <ChildrenTab area={area} items={children} onOpen={openArea} />}
      {tab === 'dich-vu' && (
        <ServicesTab
          state={records.state.services}
          onAssign={canManage ? () => setOperation({ kind: 'services' }) : undefined}
          onRetry={() => records.retry('services')}
        />
      )}
      {tab === 'nhan-su' && (
        <StaffTab
          state={records.state.staff}
          onAssign={canManage ? () => setOperation({ kind: 'staff' }) : undefined}
          onEnd={canManage ? (person) => setOperation({ kind: 'end-staff', person }) : undefined}
          onRetry={() => records.retry('staff')}
        />
      )}
      {tab === 'bang-gia' && <PriceListsTab state={records.state.priceLists} onRetry={() => records.retry('priceLists')} />}
      {tab === 'hop-dong' && <ContractsTab area={area} state={records.state.contracts} onRetry={() => records.retry('contracts')} />}
      {tab === 'lich-su' && <HistoryTab area={area} />}

      {changingParent && (
        <ChangeParentFlow
          area={area}
          onClose={() => setChangingParent(false)}
          onChanged={(result) => {
            setChangingParent(false);
            const next: AreaDetailState = {
              replayed: result.replayed,
              hierarchy: { changes: result.changes, previousParent: result.previousParent },
            };
            navigate(ROUTES.areaDetail(area.code), { replace: true, state: next });
          }}
        />
      )}

      {operation?.kind === 'staff' && (
        <StaffAssignDialog
          area={area}
          current={records.state.staff.status === 'ok' ? records.state.staff.data : []}
          onClose={() => setOperation(null)}
          onDone={(person) => {
            afterOperation('staff', 'Đã phân công nhân sự', `${person.name} phụ trách ${area.code} – ${person.shift}.`);
            selectTab('nhan-su');
          }}
        />
      )}
      {operation?.kind === 'end-staff' && (
        <EndStaffDialog
          area={area}
          person={operation.person}
          onClose={() => setOperation(null)}
          onDone={() => afterOperation('staff', 'Đã kết thúc phân công', `${operation.person.name} thôi phụ trách ${area.code}.`)}
        />
      )}
      {operation?.kind === 'services' && (
        <ServicesDialog
          area={area}
          current={records.state.services.status === 'ok' ? records.state.services.data : []}
          onClose={() => setOperation(null)}
          onDone={(summary) => {
            afterOperation('services', 'Đã cập nhật dịch vụ khai thác', `Danh mục dịch vụ của ${area.code}: ${summary}.`);
            selectTab('dich-vu');
          }}
        />
      )}
      {operation?.kind === 'status' && (
        <StatusDialog
          area={area}
          parent={parent}
          childCount={children.length}
          activeContracts={
            records.state.contracts.status === 'ok' ? records.state.contracts.data.items.filter((c) => isContractActive(c)).length : null
          }
          onClose={() => setOperation(null)}
          onDone={(next) => {
            setOperation(null);
            const entry = next.history[next.history.length - 1];
            const state: AreaDetailState = { statusChanged: { status: next.status, reason: entry.reason ?? '' } };
            navigate(ROUTES.areaDetail(area.code), { replace: true, state });
          }}
        />
      )}

      {exporting && (
        <ExportProfileDialog
          area={area}
          chain={chain}
          items={children}
          records={records.state}
          onClose={() => setExporting(false)}
          onExported={(at) => {
            setExporting(false);
            setExportedAt(at);
          }}
        />
      )}
    </>
  );
}

function ResultBanners({ area, parent, state }: { area: Area; parent: Area | null; state: AreaDetailState | null }) {
  return (
    <>
      {state?.created && (
        <Alert tone="success" title="Tạo mới khu vực thành công">
          {state.replayed && 'Hồ sơ đã được ghi ở lần gửi trước, hệ thống không tạo thêm hồ sơ. '}
          Hồ sơ {area.code} đã được lưu với trạng thái Hoạt động. Nhật ký đã ghi nhận người tạo, thời điểm và toàn bộ thông số ban đầu.
        </Alert>
      )}
      {state?.updated && (
        <Alert tone="success" title="Cập nhật thông tin khu vực thành công">
          {state.replayed
            ? 'Thay đổi đã được ghi ở lần gửi trước, hệ thống không áp dụng lại. '
            : `Đã lưu phiên bản ${state.updated.version} với ${state.updated.changes.length} thay đổi. `}
          Thông tin khu vực trên bảng giá, hợp đồng, phiếu sản lượng đã phát sinh được giữ nguyên.
        </Alert>
      )}
      {state?.statusChanged &&
        (state.statusChanged.status === 'suspended' ? (
          <Alert tone="warning" title="Đã tạm ngưng khu vực">
            {area.code} chuyển sang Tạm ngưng (phiên bản {area.version}). Không lập mới bảng giá, hợp đồng, phiếu sản lượng tại khu vực
            và phân khu con; hợp đồng đang khai thác giữ hiệu lực. Lý do: {state.statusChanged.reason}
          </Alert>
        ) : (
          <Alert tone="success" title="Đã mở lại hoạt động khu vực">
            {area.code} trở lại Hoạt động (phiên bản {area.version}). Lý do: {state.statusChanged.reason}
          </Alert>
        ))}
      {state?.hierarchy && !state.updated && (
        <Alert tone="success" title="Cập nhật cấu trúc phân cấp thành công">
          {state.replayed
            ? 'Thay đổi đã được ghi ở lần gửi trước, hệ thống không áp dụng lại.'
            : `${area.name} đã chuyển từ ${state.hierarchy.previousParent?.name ?? 'Cấp 1 độc lập'} sang ${parent?.name ?? '—'} (${
                state.hierarchy.changes[0]?.levelBefore === area.level ? `vẫn ở Cấp ${area.level}` : `nay ở Cấp ${area.level}`
              }). Đường dẫn phân cấp của ${state.hierarchy.changes.length - 1} phân khu con trực thuộc đã được đồng bộ lại.`}
        </Alert>
      )}
    </>
  );
}

/** 13.1 · Thẻ tóm tắt số phân khu, bảng giá, hợp đồng, sản lượng; số liệu liên kết chưa tải xong thì hiển thị "…". */
function OverviewSummary({ items, records }: { items: Area[]; records: AreaRecordsState }) {
  const today = todayIso();
  const prices = records.priceLists;
  const contracts = records.contracts;
  // Như tab Bảng giá (13.5): gồm bảng giá đang áp dụng và đã duyệt chờ hiệu lực.
  const activePrices = prices.status === 'ok' ? prices.data.length : null;
  const upcomingPrices = prices.status === 'ok' ? prices.data.filter((p) => p.status === 'approved' && p.from > today).length : null;
  const activeContracts = contracts.status === 'ok' ? contracts.data.items.filter((c) => isContractActive(c)) : null;
  const output = contracts.status === 'ok' ? contracts.data.output : null;

  const pending = (state: { status: string }, value: ReactNode) => (state.status === 'ok' ? value : state.status === 'error' ? '—' : '…');

  return (
    <div className="summary-cards">
      <SummaryCard
        label="Phân khu con"
        value={items.length}
        note={items.length ? items.map((c) => c.name).join(', ') : 'Chưa có phân khu con'}
        icon="layers"
      />
      <SummaryCard
        label="Bảng giá đang hiệu lực"
        value={pending(prices, activePrices)}
        note={prices.status === 'error' ? 'Không tải được dữ liệu bảng giá' : `${upcomingPrices ?? 0} bảng giá sắp hiệu lực`}
        icon="file"
      />
      <SummaryCard
        label="Hợp đồng đang khai thác"
        value={pending(contracts, activeContracts?.length)}
        note={`${activeContracts?.filter((c) => expiresSoon(c)).length ?? 0} hợp đồng hết hạn ≤ 30 ngày`}
        icon="list"
      />
      <SummaryCard
        label={`Sản lượng kỳ ${output?.period ?? 'gần nhất'}`}
        value={pending(contracts, output ? output.lifts.toLocaleString('vi-VN') : '0')}
        note="container nâng hạ"
        icon="activity"
      />
    </div>
  );
}

function DetailItem({ label, value, wide, changed }: { label: string; value: ReactNode; wide?: boolean; changed?: boolean }) {
  return (
    <div className={wide ? 'area-detail__item area-detail__item--wide' : 'area-detail__item'}>
      <dt>{label}</dt>
      <dd>{value}</dd>
      {changed && <span className="area-tag area-tag--info">Mới cập nhật</span>}
    </div>
  );
}

type MenuItem = { label: string; hint: string; icon: IconName; onSelect?: () => void; tone?: 'danger' };

/**
 * "Chỉnh sửa ▾" (13.1 / 04.0): Cập nhật thông tin (UC-ARE-04), Điều chỉnh phân cấp (UC-ARE-02) cho người có quyền cập nhật;
 * nhóm Phân công nhân sự, Gán dịch vụ, Tạm ngưng / Mở lại chỉ Trưởng phòng Khai thác thấy và thực hiện.
 */
type AreaActionsMenuProps = {
  area: Area;
  canManage: boolean;
  onChangeParent: () => void;
  onOperation: (kind: 'staff' | 'services' | 'status') => void;
};

function AreaActionsMenu({ area, canManage, onChangeParent, onOperation }: AreaActionsMenuProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const editItems: MenuItem[] = [
    {
      label: 'Cập nhật thông tin',
      hint: 'Tên, loại, tọa độ, diện tích, sức chứa, quy chuẩn',
      icon: 'edit',
      onSelect: () => navigate(ROUTES.areaEdit(area.code)),
    },
    { label: 'Điều chỉnh phân cấp', hint: 'Đổi khu vực cấp cha (UC-ARE-02)', icon: 'layers', onSelect: onChangeParent },
  ];
  const otherItems: MenuItem[] = [
    { label: 'Phân công nhân sự', hint: 'Giao cán bộ phụ trách theo ca trực', icon: 'users', onSelect: () => onOperation('staff') },
    { label: 'Gán dịch vụ', hint: 'Danh mục dịch vụ được phép tại khu vực', icon: 'list', onSelect: () => onOperation('services') },
    area.status === 'active'
      ? { label: 'Tạm ngưng khu vực', hint: 'Hạn chế bảng giá, hợp đồng, sản lượng mới', icon: 'pause', tone: 'danger', onSelect: () => onOperation('status') }
      : { label: 'Mở lại hoạt động', hint: 'Cho phép phát sinh giao dịch mới trở lại', icon: 'play', onSelect: () => onOperation('status') },
  ];

  const renderItem = (item: MenuItem) => (
    <button
      key={item.label}
      type="button"
      role="menuitem"
      className={['area-menu__item', item.tone && `area-menu__item--${item.tone}`, !item.onSelect && 'area-menu__item--disabled'].filter(Boolean).join(' ')}
      disabled={!item.onSelect}
      onClick={() => {
        setOpen(false);
        item.onSelect?.();
      }}
    >
      <Icon name={item.icon} className="area-menu__icon" />
      <span>
        <span className="area-menu__label">{item.label}</span>
        <span className="area-menu__hint">{item.hint}</span>
      </span>
    </button>
  );

  return (
    <div ref={rootRef} className="area-split">
      <button type="button" className="btn btn--primary area-split__main" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Chỉnh sửa
      </button>
      <button
        type="button"
        className="btn btn--primary area-split__toggle"
        aria-label="Mở thao tác chỉnh sửa"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="chevron" />
      </button>
      {open && (
        <div className="area-menu" role="menu">
          {editItems.map(renderItem)}
          {/* Nhân viên Khai thác chỉ thấy "Cập nhật thông tin" và "Điều chỉnh phân cấp". */}
          {canManage && (
            <>
              <p className="area-menu__group">THAO TÁC KHU VỰC · TRƯỞNG PHÒNG KHAI THÁC</p>
              {otherItems.map(renderItem)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
