import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/button/Button';
import { Icon, type IconName } from '@/components/icon/Icon';
import { StatusBadge, type BadgeTone } from '@/components/status-badge/StatusBadge';
import { ROUTES } from '@/constants/routes';
import { formatDate, formatDateTime, todayIso } from '@/utils/format';
import type { RecordState } from '../hooks/useAreaRecords';
import type { Area, AreaContract, AreaHistoryEntry, AreaHistoryKind, AreaPriceList, AreaRecordData, AreaService, AreaStaff } from '../types/area';
import { AREA_FIELD_LABELS } from '../utils/areaChanges';
import { AREA_STATUS_BADGE, areaTypeLabel, formatAreaNumber, formatCapacity } from '../utils/areaFormat';
import { LevelBadge } from './HierarchyChain';

const numberFormat = new Intl.NumberFormat('vi-VN');

/** Số ngày từ hôm nay tới ngày "YYYY-MM-DD" (âm khi đã qua). */
export function daysUntil(date: string, today = todayIso()): number {
  return Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
}

export function isContractActive(contract: AreaContract, today = todayIso()): boolean {
  return contract.from <= today && today <= contract.to;
}

/** Hợp đồng còn hiệu lực dưới 30 ngày được cảnh báo (13.6). */
export function expiresSoon(contract: AreaContract, today = todayIso()): boolean {
  return isContractActive(contract, today) && daysUntil(contract.to, today) <= 30;
}

/* ---------- Khung chung của tab liên kết ---------- */

type RecordCardProps<T> = {
  title: (data: T | null) => string;
  description: string;
  state: RecordState<T>;
  /** Tên module nguồn dùng trong thông báo lỗi, ví dụ "bảng giá". */
  source: string;
  action?: ReactNode;
  onRetry: () => void;
  children: (data: T) => ReactNode;
};

/** Thẻ của một tab liên kết: đang tải, lỗi riêng kèm "Thử lại" (13.8) – không dùng "không có dữ liệu" thay cho lỗi. */
function RecordCard<T>({ title, description, state, source, action, onRetry, children }: RecordCardProps<T>) {
  return (
    <section className="area-card">
      <div className="area-card__heading-row">
        <div className="area-card__heading">
          <h2>{title(state.status === 'ok' ? state.data : null)}</h2>
          {state.status !== 'error' && <p>{description}</p>}
        </div>
        {state.status === 'ok' && action}
      </div>
      {state.status === 'loading' && <p className="area-loading">Đang tải dữ liệu {source}…</p>}
      {state.status === 'error' && (
        <div className="area-empty area-empty--inline area-empty--plain">
          <span className="area-empty__icon area-empty__icon--danger">
            <Icon name="x-circle" />
          </span>
          <h3>Không tải được dữ liệu {source}</h3>
          <p>
            Phân hệ {source.charAt(0).toUpperCase() + source.slice(1)} đang gặp sự cố truy vấn. Thông tin chung và các tab khác của khu
            vực vẫn sử dụng bình thường.
          </p>
          <Button variant="secondary" onClick={onRetry}>
            Thử lại
          </Button>
        </div>
      )}
      {state.status === 'ok' && children(state.data)}
    </section>
  );
}

function EmptyRows({ icon, text }: { icon: IconName; text: string }) {
  return (
    <div className="area-empty area-empty--inline">
      <span className="area-empty__icon area-empty__icon--neutral">
        <Icon name={icon} />
      </span>
      <p>{text}</p>
    </div>
  );
}


/* ---------- 13.2 · Phân khu con ---------- */

export function ChildrenTab({ area, items, onOpen }: { area: Area; items: Area[]; onOpen: (code: string) => void }) {
  const totalSize = items.reduce((sum, a) => sum + (a.areaSize ?? 0), 0);
  const sameUnit = items.every((a) => a.capacityUnit === area.capacityUnit);
  const totalCapacity = items.reduce((sum, a) => sum + (a.capacity ?? 0), 0);
  const percent = area.areaSize ? Math.round((totalSize / area.areaSize) * 100) : null;

  return (
    <section className="area-card">
      <div className="area-card__heading">
        <h2>Phân khu con trực thuộc ({items.length})</h2>
        <p>Nhấp một dòng để mở hồ sơ chi tiết của phân khu con.</p>
      </div>
      {items.length === 0 ? (
        <EmptyRows
          icon="layers"
          text={
            area.level >= 3
              ? `Khu vực Cấp ${area.level} là cấp thấp nhất – không thể tạo phân khu con (ARE-03).`
              : `Chưa có phân khu con. Có thể tạo phân khu Cấp ${area.level + 1} và chọn ${area.code} làm khu vực cấp cha.`
          }
        />
      ) : (
        <>
          <div className="lookup-table__wrap">
            <table className="lookup-table">
              <thead>
                <tr>
                  <th scope="col">Mã khu vực</th>
                  <th scope="col">Tên khu vực</th>
                  <th scope="col">Loại mặt bằng</th>
                  <th scope="col">Cấp</th>
                  <th scope="col">Diện tích (m²)</th>
                  <th scope="col">Sức chứa</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col" aria-label="Mở" />
                </tr>
              </thead>
              <tbody>
                {items.map((child) => (
                  <tr
                    key={child.code}
                    tabIndex={0}
                    onClick={() => onOpen(child.code)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(child.code))}
                  >
                    <td>
                      <span className="area-code">{child.code}</span>
                    </td>
                    <td>{child.name}</td>
                    <td>{areaTypeLabel(child.type)}</td>
                    <td>
                      <LevelBadge level={child.level} />
                    </td>
                    <td>{formatAreaNumber(child.areaSize)}</td>
                    <td>{formatCapacity(child.capacity, child.capacityUnit)}</td>
                    <td>
                      <StatusBadge label={AREA_STATUS_BADGE[child.status].label} tone={AREA_STATUS_BADGE[child.status].tone} />
                    </td>
                    <td className="lookup-table__arrow">
                      <Icon name="arrow-right" size={16} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="area-card__footnote">
            Tổng diện tích phân khu: {numberFormat.format(totalSize)} / {formatAreaNumber(area.areaSize)} m²
            {percent !== null && ` (${percent}%)`}
            {sameUnit && area.capacity !== null &&
              ` · Tổng sức chứa phân khu: ${numberFormat.format(totalCapacity)} / ${formatCapacity(area.capacity, area.capacityUnit)}.`}
          </p>
        </>
      )}
    </section>
  );
}

/* ---------- 13.3 · Dịch vụ khai thác ---------- */

type ServicesTabProps = {
  state: RecordState<AreaService[]>;
  /** Chỉ Trưởng phòng Khai thác thấy "Gán dịch vụ" (13.3 / 13.9). */
  onAssign?: () => void;
  onRetry: () => void;
};

export function ServicesTab({ state, onAssign, onRetry }: ServicesTabProps) {
  return (
    <RecordCard
      title={(data) => `Dịch vụ được phép cung cấp tại khu vực${data ? ` (${data.length})` : ''}`}
      description="Chỉ dịch vụ trong danh mục này mới được chọn khi lập bảng giá, hợp đồng, ghi nhận sản lượng tại khu vực."
      state={state}
      source="dịch vụ"
      action={
        onAssign && (
          <Button variant="secondary" onClick={onAssign}>
            Gán dịch vụ
          </Button>
        )
      }
      onRetry={onRetry}
    >
      {(data) =>
        data.length === 0 ? (
          <EmptyRows icon="list" text="Chưa gán dịch vụ nào cho khu vực này." />
        ) : (
          <div className="lookup-table__wrap">
            <table className="lookup-table lookup-table--static">
              <thead>
                <tr>
                  <th scope="col">Dịch vụ</th>
                  <th scope="col">Nhóm dịch vụ</th>
                  <th scope="col">Đơn vị tính</th>
                  <th scope="col">Áp dụng từ</th>
                  <th scope="col">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {data.map((service) => (
                  <tr key={service.name}>
                    <td>{service.name}</td>
                    <td>{service.group}</td>
                    <td>{service.unit}</td>
                    <td>{formatDate(service.since)}</td>
                    <td>
                      <StatusBadge label="Được phép" tone="success" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    </RecordCard>
  );
}

/* ---------- 13.4 · Nhân sự phụ trách ---------- */

type StaffTabProps = {
  state: RecordState<AreaStaff[]>;
  /** Chỉ Trưởng phòng Khai thác thấy "Phân công nhân sự" và "Kết thúc" (13.4 / 13.9). */
  onAssign?: () => void;
  onEnd?: (person: AreaStaff) => void;
  onRetry: () => void;
};

export function StaffTab({ state, onAssign, onEnd, onRetry }: StaffTabProps) {
  return (
    <RecordCard
      title={(data) => `Nhân sự phụ trách địa bàn${data ? ` (${data.length})` : ''}`}
      description="Cán bộ khai thác được phân công phụ trách khu vực theo ca trực."
      state={state}
      source="nhân sự"
      action={
        onAssign && (
          <Button variant="secondary" onClick={onAssign}>
            Phân công nhân sự
          </Button>
        )
      }
      onRetry={onRetry}
    >
      {(data) =>
        data.length === 0 ? (
          <EmptyRows icon="users" text="Chưa phân công nhân sự phụ trách khu vực này." />
        ) : (
          <div className="lookup-table__wrap">
            <table className="lookup-table lookup-table--static">
              <thead>
                <tr>
                  <th scope="col">Nhân viên</th>
                  <th scope="col">Chức danh</th>
                  <th scope="col">Ca trực</th>
                  <th scope="col">Phụ trách từ</th>
                  <th scope="col">Liên hệ</th>
                  {onEnd && <th scope="col" aria-label="Thao tác" />}
                </tr>
              </thead>
              <tbody>
                {data.map((person) => (
                  <tr key={person.staffCode}>
                    <td>
                      <span className="lookup-table__stack">
                        <span>{person.name}</span>
                        <small>{person.staffCode}</small>
                      </span>
                    </td>
                    <td>{person.title}</td>
                    <td>{person.shift}</td>
                    <td>{formatDate(person.since)}</td>
                    <td>{person.phone}</td>
                    {onEnd && (
                      <td className="lookup-table__action">
                        <button type="button" className="area-filters__reset" onClick={() => onEnd(person)}>
                          Kết thúc
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    </RecordCard>
  );
}

/* ---------- 13.5 · Bảng giá dịch vụ ---------- */

const PRICE_STATUS: Record<AreaPriceList['status'], { label: string; tone: BadgeTone }> = {
  active: { label: 'Đang áp dụng', tone: 'success' },
  approved: { label: 'Đã duyệt', tone: 'info' },
};

export function PriceListsTab({ state, onRetry }: { state: RecordState<AreaPriceList[]>; onRetry: () => void }) {
  return (
    <RecordCard
      title={(data) => `Bảng giá đang áp dụng tại khu vực${data ? ` (${data.length})` : ''}`}
      description="Dữ liệu từ module Bảng giá: bảng giá đang hiệu lực và đã duyệt chờ hiệu lực."
      state={state}
      source="bảng giá"
      onRetry={onRetry}
    >
      {(data) =>
        data.length === 0 ? (
          <EmptyRows icon="file" text="Chưa có bảng giá nào áp dụng tại khu vực này." />
        ) : (
          <div className="lookup-table__wrap">
            <table className="lookup-table lookup-table--static">
              <thead>
                <tr>
                  <th scope="col">Mã bảng giá</th>
                  <th scope="col">Khách hàng · Hợp đồng</th>
                  <th scope="col">Dịch vụ áp dụng</th>
                  <th scope="col">Hiệu lực</th>
                  <th scope="col">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {data.map((price) => (
                  <tr key={price.code}>
                    <td>
                      <span className="area-code" title="Module Bảng giá chưa có trong prototype">
                        {price.code}
                      </span>
                    </td>
                    <td>
                      <span className="lookup-table__stack">
                        <span>{price.customer}</span>
                        <small>{price.contract}</small>
                      </span>
                    </td>
                    <td>{price.services}</td>
                    <td>
                      {formatDate(price.from)} – {formatDate(price.to)}
                    </td>
                    <td>
                      <StatusBadge label={PRICE_STATUS[price.status].label} tone={PRICE_STATUS[price.status].tone} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    </RecordCard>
  );
}

/* ---------- 13.6 · Hợp đồng & Sản lượng ---------- */

const TOP_CONTRACTS = 3;

export function ContractsTab({ area, state, onRetry }: { area: Area; state: RecordState<AreaRecordData['contracts']>; onRetry: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const data = state.status === 'ok' ? state.data : null;
  const active = data ? data.items.filter((c) => isContractActive(c)) : [];
  const expiring = active.filter((c) => expiresSoon(c));

  return (
    <>
      {data && (
        <div className="summary-cards">
          <SummaryCard label="Hợp đồng đang khai thác" value={active.length} note={`tại khu vực ${area.code}`} icon="list" />
          <SummaryCard label="Sắp hết hạn" value={expiring.length} note="trong 30 ngày tới" icon="clock" />
          <SummaryCard
            label={`Nâng hạ kỳ ${data.output?.period ?? '—'}`}
            value={data.output ? numberFormat.format(data.output.lifts) : '—'}
            note="container"
            icon="activity"
          />
          <SummaryCard
            label={`Lưu bãi kỳ ${data.output?.period ?? '—'}`}
            value={data.output ? numberFormat.format(data.output.storageTeuDays) : '—'}
            note="TEU-ngày"
            icon="grid"
          />
        </div>
      )}
      <RecordCard
        title={(d) => `Hợp đồng có chỉ định khu vực${d ? ` (${d.items.length})` : ''}`}
        description={
          showAll || (data?.items.length ?? 0) <= TOP_CONTRACTS
            ? 'Toàn bộ hợp đồng có chỉ định khu vực, sắp theo sản lượng kỳ gần nhất.'
            : `Hiển thị ${TOP_CONTRACTS} hợp đồng có sản lượng lớn nhất kỳ gần nhất.`
        }
        state={state}
        source="hợp đồng và sản lượng"
        action={
          data && data.items.length > TOP_CONTRACTS && (
            <button type="button" className="area-filters__reset" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Thu gọn' : `Xem tất cả ${data.items.length} hợp đồng`}
            </button>
          )
        }
        onRetry={onRetry}
      >
        {(d) => {
          if (d.items.length === 0) return <EmptyRows icon="file" text="Chưa có hợp đồng nào chỉ định khu vực này." />;
          // Sản lượng nâng hạ (container) trước, lưu bãi (TEU-ngày) sau – hai đơn vị không so sánh trực tiếp.
          const sorted = [...d.items].sort((a, b) => a.volumeUnit.localeCompare(b.volumeUnit) || b.volume - a.volume);
          const rows = showAll ? sorted : sorted.slice(0, TOP_CONTRACTS);
          return (
            <div className="lookup-table__wrap">
              <table className="lookup-table lookup-table--static">
                <thead>
                  <tr>
                    <th scope="col">Số hợp đồng</th>
                    <th scope="col">Khách hàng</th>
                    <th scope="col">Hiệu lực</th>
                    <th scope="col">Sản lượng kỳ {d.output?.period ?? 'gần nhất'}</th>
                    <th scope="col">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((contract) => (
                    <tr key={contract.code}>
                      <td>
                        <Link to={ROUTES.contractDetail(contract.code)} className="area-code">
                          {contract.code}
                        </Link>
                      </td>
                      <td>{contract.customer}</td>
                      <td>
                        {formatDate(contract.from)} – {formatDate(contract.to)}
                      </td>
                      <td>{contract.volume ? `${numberFormat.format(contract.volume)} ${contract.volumeUnit}` : 'Chưa phát sinh'}</td>
                      <td>
                        <span className="lookup-table__stack lookup-table__stack--badges">
                          {isContractActive(contract) ? (
                            <StatusBadge label="Có hiệu lực" tone="success" />
                          ) : (
                            <StatusBadge label="Chưa hiệu lực" tone="neutral" />
                          )}
                          {expiresSoon(contract) && <StatusBadge label={`Hết hạn sau ${daysUntil(contract.to)} ngày`} tone="warning" />}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }}
      </RecordCard>
    </>
  );
}

export function SummaryCard({ label, value, note, icon }: { label: string; value: ReactNode; note: string; icon: IconName }) {
  return (
    <div className="summary-card">
      <div className="summary-card__text">
        <span className="summary-card__label">{label}</span>
        <span className="summary-card__value">{value}</span>
        <span className="summary-card__note">{note}</span>
      </div>
      <span className="summary-card__icon">
        <Icon name={icon} />
      </span>
    </div>
  );
}

/* ---------- 13.7 · Lịch sử biến động ---------- */

const KIND_FILTERS: { value: AreaHistoryKind | 'all'; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'create', label: 'Tạo mới' },
  { value: 'update', label: 'Chỉnh sửa' },
  { value: 'status', label: 'Đổi trạng thái' },
  { value: 'assignment', label: 'Nhân sự & dịch vụ' },
];

function historyTag(entry: AreaHistoryEntry): { label: string; tone: BadgeTone } {
  switch (entry.kind) {
    case 'create':
      return { label: 'Tạo mới', tone: 'neutral' };
    case 'update':
      return { label: 'Chỉnh sửa', tone: 'info' };
    case 'status':
      return { label: 'Đổi trạng thái', tone: entry.detail.startsWith('Hoạt động →') ? 'warning' : 'success' };
    case 'assignment':
      return { label: 'Nhân sự & dịch vụ', tone: 'accent' };
  }
}

const HISTORY_PAGE = 6;

export function HistoryTab({ area }: { area: Area }) {
  const [kind, setKind] = useState<AreaHistoryKind | 'all'>('all');
  const [limit, setLimit] = useState(HISTORY_PAGE);
  const entries = [...area.history].reverse().filter((h) => kind === 'all' || h.kind === kind);
  const shown = entries.slice(0, limit);

  return (
    <section className="area-card">
      <div className="area-card__heading-row">
        <div className="area-card__heading">
          <h2>Lịch sử biến động ({area.history.length})</h2>
          <p>Nhật ký Audit log: người thao tác, thời điểm, hành động và giá trị trước/sau (ARE-11).</p>
        </div>
        <div className="area-segmented" role="radiogroup" aria-label="Loại hành động">
          {KIND_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={kind === option.value}
              className={kind === option.value ? 'area-segmented__option area-segmented__option--active' : 'area-segmented__option'}
              onClick={() => {
                setKind(option.value);
                setLimit(HISTORY_PAGE);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <EmptyRows icon="history" text="Chưa có sự kiện nào thuộc loại hành động này." />
      ) : (
        <ol className="audit-timeline">
          {shown.map((entry, index) => {
            const tag = historyTag(entry);
            const detail = entry.changes?.length
              ? entry.changes.map((c) => `${AREA_FIELD_LABELS[c.field]} ${c.before} → ${c.after}`).join(' · ')
              : entry.detail;
            return (
              <li key={`${entry.at}-${index}`} className={`audit-timeline__item audit-timeline__item--${tag.tone}`}>
                <span className="audit-timeline__title">
                  {entry.action}
                  <StatusBadge label={tag.label} tone={tag.tone} />
                </span>
                <span className="audit-timeline__meta">
                  {formatDateTime(entry.at)} · {entry.by}
                  {entry.byTitle && ` · ${entry.byTitle}`}
                </span>
                <span className="audit-timeline__detail">
                  {entry.reason ? `${detail.replace(/\.?$/, '.')} Lý do: ${entry.reason}` : detail}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <div className="area-card__footer">
        <span>
          Hiển thị {shown.length} / {entries.length} sự kiện{kind === 'all' ? ' gần nhất' : ''}
        </span>
        {shown.length < entries.length && (
          <button type="button" className="area-filters__reset" onClick={() => setLimit((n) => n + HISTORY_PAGE)}>
            Xem thêm
          </button>
        )}
      </div>
    </section>
  );
}

/* ---------- Ranh giới & bản đồ mô phỏng (13.1) ---------- */

/** Sơ đồ mô phỏng vị trí: khu vực đang xem (viền nét đứt), các phân khu con bên trong, một khu vực lân cận cùng cấp. */
export function AreaMap({ area, items, neighbor }: { area: Area; items: Area[]; neighbor?: Area }) {
  return (
    <section className="area-card">
      <div className="area-card__heading">
        <h2>Ranh giới &amp; bản đồ mô phỏng</h2>
        <p>
          Tọa độ tâm {area.gps || 'chưa cập nhật'} · Diện tích {formatAreaNumber(area.areaSize)} m²
        </p>
      </div>
      <div className="area-map" role="img" aria-label={`Sơ đồ mô phỏng ${area.name} và ${items.length} phân khu con`}>
        <div className="area-map__zone">
          <span className="area-map__zone-label">{area.name}</span>
          <div className="area-map__children">
            {items.length === 0 ? (
              <span className="area-map__empty">Không có phân khu con</span>
            ) : (
              items.slice(0, 4).map((child) => (
                <span key={child.code} className="area-map__child">
                  {child.name} · {child.code}
                </span>
              ))
            )}
          </div>
          <span className="area-map__pin">
            <Icon name="map-pin" size={18} />
          </span>
        </div>
        {neighbor && <div className="area-map__neighbor">{neighbor.name}</div>}
        <div className="area-map__road">Đường nội bộ cảng</div>
      </div>
    </section>
  );
}
