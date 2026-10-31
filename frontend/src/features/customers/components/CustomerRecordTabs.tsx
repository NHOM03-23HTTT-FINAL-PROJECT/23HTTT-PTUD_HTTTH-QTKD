import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { Button } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { Dialog } from '@/components/feedback/Dialog';
import { useToast } from '@/components/feedback/Toast';
import { InputField } from '@/components/form/InputField';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { Icon, type IconName } from '@/components/icon/Icon';
import { StatusBadge, type BadgeTone } from '@/components/status-badge/StatusBadge';
import { ROUTES } from '@/constants/routes';
import { formatDate, formatTime, formatMoney, todayIso } from '@/utils/format';
import { customerRecordsApi } from '../api/customerRecordsApi';
import type { GroupState } from '../hooks/useCustomerRecords';
import type { Customer, CustomerField } from '../types/customer';
import type { ContractRecord, PaymentRecord, PriceListVersion } from '../types/customerRecords';
import { CUSTOMER_FIELD_LABELS } from '../utils/customerChanges';
import {
  CONTRACT_STATUS_LABELS,
  contractBadge,
  contractStatusAt,
  overlapRange,
  priceApplies,
  priceStatus,
  type ContractStatusKey,
  type PriceStatus,
} from '../utils/customerRecords';
import { DecisionItem } from './CustomerStatusPanels';

/* ---------- Phần dùng chung ---------- */

function FilterBar({ children, onApply }: { children: ReactNode; onApply: () => void }) {
  return (
    <form
      className="record-filters"
      onSubmit={(e) => {
        e.preventDefault();
        onApply();
      }}
    >
      {children}
      <Button type="submit" variant="secondary">
        Áp dụng
      </Button>
    </form>
  );
}

/** Một nhóm hồ sơ không tải được: báo đúng nhóm, không coi là rỗng, cho thử lại riêng (06.9). */
export function GroupError({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <Alert
      tone="danger"
      title={`Không tải được ${label}`}
      action={
        <button type="button" className="alert__link" onClick={onRetry}>
          Thử lại
        </button>
      }
    >
      Hệ thống chưa truy xuất được nhóm hồ sơ này; đây không phải danh sách rỗng. Các phần khác của hồ sơ vẫn xem được.
    </Alert>
  );
}

function EmptyRecords({ icon, title, children, action }: { icon: IconName; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="customer-empty">
      <span className="customer-empty__icon">
        <Icon name={icon} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action && <div className="customer-empty__actions">{action}</div>}
    </div>
  );
}

function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="record-card__header">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return <p className="record-loading">Đang tải {label}…</p>;
}

/* ---------- Tab Hợp đồng (06.2 / 06.8) ---------- */

type ContractFilters = { date: string; status: 'all' | ContractStatusKey; service: string };

export function ContractsTab({ state, onRetry }: { state: GroupState<ContractRecord[]>; onRetry: () => void }) {
  const today = todayIso();
  const [draft, setDraft] = useState<ContractFilters>({ date: today, status: 'all', service: 'all' });
  const [applied, setApplied] = useState(draft);
  const [selected, setSelected] = useState<string | null>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  if (state.status === 'loading') return <Loading label="hợp đồng" />;
  if (state.status === 'error') return <GroupError label="danh sách hợp đồng" onRetry={onRetry} />;

  const contracts = state.data;
  const services = [...new Set(contracts.map((c) => c.service))];
  const date = applied.date || today;
  const rows = contracts.filter(
    (c) => (applied.status === 'all' || contractStatusAt(c, date) === applied.status) && (applied.service === 'all' || c.service === applied.service),
  );
  const current = rows.find((c) => c.code === selected) ?? rows[0];
  const filteredView = applied.status !== 'all' || applied.service !== 'all';

  return (
    <>
      <FilterBar onApply={() => setApplied(draft)}>
        <InputField
          ref={dateRef}
          label="Thời điểm đối chiếu"
          type="date"
          value={draft.date}
          onChange={(e) => setDraft({ ...draft, date: e.target.value })}
        />
        <SelectField
          label="Trạng thái hợp đồng"
          placeholder="Tất cả trạng thái"
          options={Object.entries(CONTRACT_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          value={draft.status === 'all' ? '' : draft.status}
          onChange={(value) => setDraft({ ...draft, status: (value || 'all') as ContractFilters['status'] })}
        />
        <SelectField
          label="Dịch vụ"
          placeholder="Tất cả dịch vụ"
          options={services.map((s) => ({ value: s, label: s }))}
          value={draft.service === 'all' ? '' : draft.service}
          onChange={(value) => setDraft({ ...draft, service: value || 'all' })}
        />
      </FilterBar>

      {rows.length === 0 ? (
        <section className="customer-results">
          <div className="customer-results__header">
            <h2>{filteredView ? '0 hợp đồng phù hợp' : 'Chưa có hợp đồng'}</h2>
            <p>
              {applied.status !== 'all' ? `${CONTRACT_STATUS_LABELS[applied.status]} tại ${formatDate(date)}` : `Đối chiếu tại ${formatDate(date)}`} ·
              trong phạm vi quyền
            </p>
          </div>
          <EmptyRecords
            icon="file"
            title="Không có hợp đồng phù hợp"
            action={
              <Button variant="secondary" onClick={() => dateRef.current?.focus()}>
                Điều chỉnh điều kiện
              </Button>
            }
          >
            Không có hợp đồng nào của khách hàng trong phạm vi bạn được xem khớp điều kiện
            {applied.status !== 'all' ? `: ${CONTRACT_STATUS_LABELS[applied.status].toLowerCase()} tại ${formatDate(date)}` : ''}. Điều
            chỉnh thời điểm hoặc trạng thái để tra cứu lại.
          </EmptyRecords>
        </section>
      ) : (
        <div className="customer-layout">
          <section className="customer-results customer-layout__main">
            <CardHeader title={`${rows.length} hợp đồng của khách hàng`} subtitle={`Trong phạm vi quyền · đối chiếu tại ${formatDate(date)}`} />
            <table className="record-table">
              <thead>
                <tr>
                  <th scope="col">Mã hợp đồng</th>
                  <th scope="col">Dịch vụ</th>
                  <th scope="col">Thời hạn</th>
                  <th scope="col">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((contract) => {
                  const badge = contractBadge(contract, date);
                  return (
                    <tr key={contract.code} className={contract === current ? 'record-table__row--selected' : undefined}>
                      <td>
                        <button
                          type="button"
                          className="record-table__code"
                          aria-pressed={contract === current}
                          onClick={() => setSelected(contract.code)}
                        >
                          {contract.code}
                        </button>
                      </td>
                      <td>
                        <span className="record-table__main">{contract.service}</span>
                        <span className="record-table__sub">{contract.note}</span>
                      </td>
                      <td>
                        {formatDate(contract.start)} – {formatDate(contract.end)}
                      </td>
                      <td>
                        <StatusBadge label={badge.label} tone={badge.tone} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
          {current && (
            <aside className="customer-layout__side">
              <section className="side-card">
                <div>
                  <h2 className="side-card__title">
                    {current.code} · {current.service}
                  </h2>
                  <p className="side-card__subtitle">Hợp đồng đang chọn</p>
                </div>
                <dl className="customer-detail__grid customer-detail__grid--single">
                  <DecisionItem label="Thời hạn">
                    {formatDate(current.start)} – {formatDate(current.end)}
                  </DecisionItem>
                  <DecisionItem label="Ngày ký">{current.signedAt ? formatDate(current.signedAt) : 'Chưa ký'}</DecisionItem>
                  <DecisionItem label="Phụ lục">{current.appendix ?? 'Không có'}</DecisionItem>
                  <DecisionItem label="Bảng giá gắn hợp đồng">{current.priceList ?? '—'}</DecisionItem>
                  <DecisionItem label="Thông tin khách hàng trên hợp đồng">
                    {current.signedAt ? `Theo bản lưu khi ký ${formatDate(current.signedAt)}` : 'Theo hồ sơ hiện tại cho tới khi ký'}
                  </DecisionItem>
                </dl>
                {/* A4: mở chi tiết vẫn kiểm tra lại quyền tại trang hợp đồng. */}
                <Link to={ROUTES.contractDetail(current.code)} className="btn btn--secondary">
                  Mở chi tiết hợp đồng
                </Link>
              </section>
            </aside>
          )}
        </div>
      )}
    </>
  );
}

/* ---------- Tab Bảng giá (06.3 / 06.4) ---------- */

const PRICE_BADGE: Record<PriceStatus, { tone: BadgeTone; label: (date: string) => string }> = {
  current: { tone: 'success', label: () => 'Hiện hành' },
  'at-date': { tone: 'info', label: (date) => `Áp dụng tại ${formatDate(date)}` },
  replaced: { tone: 'neutral', label: () => 'Đã thay thế' },
  upcoming: { tone: 'neutral', label: () => 'Chưa hiệu lực' },
  pending: { tone: 'info', label: () => 'Chờ duyệt' },
  conflict: { tone: 'warning', label: () => 'Cần làm rõ' },
};

function rangeText(from: string, to?: string) {
  return `${formatDate(from)} – ${to ? formatDate(to) : 'nay'}`;
}

type PriceFilters = { date: string; service: string; contract: string };

export function PriceListsTab({
  state,
  customer,
  onRetry,
}: {
  state: GroupState<PriceListVersion[]>;
  customer: Customer;
  onRetry: () => void;
}) {
  const today = todayIso();
  const services = useMemo(() => (state.status === 'ok' ? [...new Set(state.data.map((v) => v.service))] : []), [state]);
  const [draft, setDraft] = useState<PriceFilters>({ date: today, service: '', contract: 'all' });
  const [applied, setApplied] = useState(draft);

  if (state.status === 'loading') return <Loading label="bảng giá" />;
  if (state.status === 'error') return <GroupError label="bảng giá" onRetry={onRetry} />;
  if (state.data.length === 0) {
    return (
      <section className="customer-results">
        <EmptyRecords icon="list" title="Khách hàng chưa có bảng giá">
          Không có bảng giá nào gắn với khách hàng trong phạm vi bạn được xem.
        </EmptyRecords>
      </section>
    );
  }

  const service = applied.service || services[0];
  const date = applied.date || today;
  const contracts = [...new Set(state.data.map((v) => v.contractCode).filter((c): c is string => Boolean(c)))];
  // A5.4: bảng giá gắn hợp đồng chỉ vào kết quả khi khớp hợp đồng đã chọn.
  const versions = state.data
    .filter((v) => v.service === service && (applied.contract === 'all' || v.contractCode === applied.contract))
    .sort((a, b) => b.from.localeCompare(a.from));
  const applicable = versions.filter((v) => priceApplies(v, date));
  const conflict = new Set(applicable.map((v) => v.code)).size > 1;
  const chosen = applicable.length === 1 ? applicable[0] : undefined;
  const currentOfChosen = chosen && versions.find((v) => v.code === chosen.code && priceApplies(v, today));
  const historical = chosen && !priceApplies(chosen, today);
  const shown = conflict ? applicable : versions;

  return (
    <>
      <FilterBar onApply={() => setApplied(draft)}>
        <InputField label="Thời điểm áp dụng" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        <SelectField
          label="Dịch vụ"
          placeholder="Chọn dịch vụ"
          options={services.map((s) => ({ value: s, label: s }))}
          value={draft.service || services[0]}
          onChange={(value) => setDraft({ ...draft, service: value })}
        />
        <SelectField
          label="Hợp đồng"
          placeholder="Tất cả hợp đồng"
          options={contracts.map((c) => ({ value: c, label: c }))}
          value={draft.contract === 'all' ? '' : draft.contract}
          onChange={(value) => setDraft({ ...draft, contract: value || 'all' })}
        />
      </FilterBar>

      {conflict && (
        <Alert tone="warning" title="Chưa xác định được giá áp dụng">
          Có {applicable.length} bảng giá cùng hiệu lực tại {formatDate(date)} và trùng phạm vi dịch vụ "{service}". Hệ thống không tự chọn
          bảng giá; liên hệ người phụ trách bảng giá để làm rõ trước khi dùng cho giao dịch.
        </Alert>
      )}
      {historical && chosen && (
        <Alert tone="info" title={`Đang xem giá lịch sử tại ${formatDate(date)}`}>
          Phiên bản {chosen.version} ({rangeText(chosen.from, chosen.to)}) là bảng giá áp dụng tại thời điểm đã chọn – không phải giá
          hiện hành.
          {currentOfChosen && ` Giá hiện hành là phiên bản ${currentOfChosen.version} từ ${formatDate(currentOfChosen.from)}.`}
        </Alert>
      )}
      {applicable.length === 0 && (
        <Alert tone="warning" title="Chưa có giá phù hợp">
          Không có bảng giá đã duyệt cho dịch vụ "{service}" tại {formatDate(date)}. Hệ thống không tự chọn giá thay nhân viên.
        </Alert>
      )}

      <section className="customer-results">
        <CardHeader
          title={conflict ? 'Bảng giá trùng hiệu lực và phạm vi' : 'Bảng giá theo thời điểm'}
          subtitle={conflict ? 'Cần làm rõ trước khi sử dụng' : 'Chỉ gồm bảng giá gắn với hợp đồng của khách hàng và đúng phạm vi dịch vụ'}
        />
        <table className="record-table">
          <thead>
            <tr>
              <th scope="col">Mã bảng giá</th>
              <th scope="col">Phiên bản</th>
              <th scope="col">Hiệu lực</th>
              <th scope="col">Phạm vi áp dụng</th>
              <th scope="col">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((version) => {
              const status: PriceStatus = conflict ? 'conflict' : priceStatus(version, date, today);
              const rowClass = conflict ? 'record-table__row--warning' : version === chosen ? 'record-table__row--selected' : undefined;
              return (
                <tr key={version.id} className={rowClass}>
                  <td className="record-table__code-text">{version.code}</td>
                  <td>v{version.version}</td>
                  <td>{rangeText(version.from, version.to)}</td>
                  <td>
                    <span className="record-table__main">{version.service}</span>
                    <span className="record-table__sub">
                      {version.contractCode ? `Gắn ${version.contractCode}` : 'Bảng giá riêng của khách hàng'}
                    </span>
                  </td>
                  <td>
                    <StatusBadge label={PRICE_BADGE[status].label(date)} tone={PRICE_BADGE[status].tone} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {conflict && (
        <div className="customer-layout">
          <section className="customer-card customer-layout__main">
            <div className="customer-card__heading">
              <h2>Phạm vi trùng lặp</h2>
            </div>
            <dl className="customer-detail__grid customer-detail__grid--single">
              <DecisionItem label="Khoảng thời gian trùng">
                {(() => {
                  const range = overlapRange(applicable);
                  return rangeText(range.from, range.to);
                })()}
              </DecisionItem>
              <DecisionItem label="Dịch vụ trùng">{service}</DecisionItem>
              <DecisionItem label="Kết quả">Chưa có giá áp dụng duy nhất – không hiển thị đơn giá đề xuất</DecisionItem>
            </dl>
          </section>
          <aside className="customer-layout__side">
            <section className="side-card">
              <h2 className="side-card__title">Người phụ trách bảng giá</h2>
              <dl className="customer-detail__grid customer-detail__grid--single">
                <DecisionItem label="Kinh doanh">{customer.ownerName}</DecisionItem>
                {(() => {
                  const latest = [...applicable].sort((a, b) => (b.approvedAt ?? '').localeCompare(a.approvedAt ?? ''))[0];
                  return (
                    latest?.approvedAt && (
                      <DecisionItem label="Phê duyệt gần nhất">
                        {latest.approvedBy} · {formatDate(latest.approvedAt)}
                      </DecisionItem>
                    )
                  );
                })()}
              </dl>
            </section>
          </aside>
        </div>
      )}

      {chosen && (
        <div className="customer-layout">
          <section className="customer-results customer-layout__main">
            <CardHeader
              title={`Đơn giá – ${chosen.code} phiên bản ${chosen.version}`}
              subtitle={`${historical ? 'Giá lịch sử' : 'Giá hiện hành'} · hiển thị theo bản đã duyệt và lưu`}
            />
            <table className="record-table">
              <thead>
                <tr>
                  <th scope="col">Hạng mục</th>
                  <th scope="col">Đơn vị tính</th>
                  <th scope="col">Đơn giá</th>
                </tr>
              </thead>
              <tbody>
                {chosen.items.map((item) => (
                  <tr key={item.name}>
                    <td>{item.name}</td>
                    <td>{item.unit}</td>
                    <td>{formatMoney(item.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <aside className="customer-layout__side">
            <section className="side-card">
              <h2 className="side-card__title">Thông tin phiên bản</h2>
              <dl className="customer-detail__grid customer-detail__grid--single">
                <DecisionItem label="Phiên bản">
                  {chosen.version}
                  {(() => {
                    const next = versions.find((v) => v.code === chosen.code && v.version === chosen.version + 1);
                    if (next && chosen.to && chosen.to < today) return ` · Đã thay thế bởi v${next.version}`;
                    return priceApplies(chosen, today) ? ' · Hiện hành' : '';
                  })()}
                </DecisionItem>
                <DecisionItem label="Hiệu lực">{rangeText(chosen.from, chosen.to)}</DecisionItem>
                {chosen.approvedAt && (
                  <DecisionItem label="Phê duyệt">
                    {chosen.approvedBy} · {formatDate(chosen.approvedAt)}
                  </DecisionItem>
                )}
                <DecisionItem label="Quan hệ">
                  {chosen.contractCode ? `Gắn ${chosen.contractCode} của khách hàng (đã kiểm tra)` : 'Bảng giá riêng của khách hàng'}
                </DecisionItem>
              </dl>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}

/* ---------- Tab Bảng thanh toán (06.5 / 06.6) ---------- */

const PAYMENT_STATE: Record<PaymentRecord['state'], { label: string; tone: BadgeTone }> = {
  reconciling: { label: 'Đang đối soát', tone: 'info' },
  issued: { label: 'Đã phát hành', tone: 'success' },
};

const SNAPSHOT_FIELDS: (keyof PaymentRecord['snapshot'] & CustomerField)[] = ['name', 'taxCode', 'address', 'representative'];

type PaymentFilters = { year: string; contract: string; status: 'all' | PaymentRecord['state'] };

export function PaymentsTab({ state, customer, onRetry }: { state: GroupState<PaymentRecord[]>; customer: Customer; onRetry: () => void }) {
  const years = useMemo(
    () => (state.status === 'ok' ? [...new Set(state.data.map((p) => p.period.slice(3)))].sort().reverse() : []),
    [state],
  );
  const [draft, setDraft] = useState<PaymentFilters>({ year: '', contract: 'all', status: 'all' });
  const [applied, setApplied] = useState(draft);
  const [selected, setSelected] = useState<string | null>(null);
  const [reporting, setReporting] = useState<PaymentRecord | null>(null);
  const [reported, setReported] = useState<Record<string, string>>({});

  if (state.status === 'loading') return <Loading label="bảng thanh toán" />;
  if (state.status === 'error') return <GroupError label="bảng thanh toán" onRetry={onRetry} />;
  if (state.data.length === 0) {
    return (
      <section className="customer-results">
        <EmptyRecords icon="inbox" title="Khách hàng chưa có bảng thanh toán">
          Không có bảng thanh toán nào của khách hàng trong phạm vi bạn được xem.
        </EmptyRecords>
      </section>
    );
  }

  const year = applied.year || years[0];
  const contracts = [...new Set(state.data.map((p) => p.contractCode))];
  const rows = state.data.filter(
    (p) =>
      p.period.endsWith(year) &&
      (applied.contract === 'all' || p.contractCode === applied.contract) &&
      (applied.status === 'all' || p.state === applied.status),
  );
  const differs = (p: PaymentRecord) => SNAPSHOT_FIELDS.some((f) => p.snapshot[f] !== customer[f]);
  const current = rows.find((p) => p.code === selected) ?? rows.find(differs) ?? rows[0];

  // Thời điểm trường trên hồ sơ được cập nhật gần nhất, để ghi chú nguồn giá trị hiện tại.
  function lastChangedAt(field: CustomerField): string | undefined {
    return [...customer.history].reverse().find((h) => h.changes?.some((c) => c.field === field))?.at;
  }

  return (
    <>
      <FilterBar onApply={() => setApplied(draft)}>
        <SelectField
          label="Kỳ thanh toán"
          placeholder="Chọn năm"
          options={years.map((y) => ({ value: y, label: `Năm ${y}` }))}
          value={draft.year || years[0]}
          onChange={(value) => setDraft({ ...draft, year: value })}
        />
        <SelectField
          label="Hợp đồng"
          placeholder="Tất cả hợp đồng"
          options={contracts.map((c) => ({ value: c, label: c }))}
          value={draft.contract === 'all' ? '' : draft.contract}
          onChange={(value) => setDraft({ ...draft, contract: value || 'all' })}
        />
        <SelectField
          label="Trạng thái"
          placeholder="Tất cả trạng thái"
          options={Object.entries(PAYMENT_STATE).map(([value, { label }]) => ({ value, label }))}
          value={draft.status === 'all' ? '' : draft.status}
          onChange={(value) => setDraft({ ...draft, status: (value || 'all') as PaymentFilters['status'] })}
        />
      </FilterBar>

      <section className="customer-results">
        <CardHeader
          title={`${rows.length} bảng thanh toán`}
          subtitle={`Trong phạm vi quyền · ${applied.contract === 'all' ? `năm ${year}` : applied.contract}`}
        />
        {rows.length === 0 ? (
          <EmptyRecords icon="inbox" title="Không có bảng thanh toán phù hợp">
            Điều chỉnh kỳ, hợp đồng hoặc trạng thái để tra cứu lại.
          </EmptyRecords>
        ) : (
          <table className="record-table">
            <thead>
              <tr>
                <th scope="col">Mã bảng TT</th>
                <th scope="col">Kỳ</th>
                <th scope="col">Hợp đồng</th>
                <th scope="col">Tổng tiền</th>
                <th scope="col">Ngày lập</th>
                <th scope="col">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((payment) => (
                <tr key={payment.code} className={payment === current ? 'record-table__row--selected' : undefined}>
                  <td>
                    <button type="button" className="record-table__code" aria-pressed={payment === current} onClick={() => setSelected(payment.code)}>
                      {payment.code}
                    </button>
                  </td>
                  <td>{payment.period}</td>
                  <td>{payment.contractCode}</td>
                  <td>{formatMoney(payment.total)}</td>
                  <td>{formatDate(payment.issuedAt)}</td>
                  <td>
                    <StatusBadge label={PAYMENT_STATE[payment.state].label} tone={PAYMENT_STATE[payment.state].tone} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {current && (
        <section className="customer-results">
          <CardHeader
            title={`Đối chiếu thông tin khách hàng · ${current.code}`}
            subtitle="Bảng thanh toán giữ thông tin tại thời điểm lập; khác với hồ sơ hiện tại không làm bảng cũ tự cập nhật."
            action={
              <div className="record-card__action">
                {reported[current.code] && (
                  <span className="record-card__note">Đã chuyển Kế toán lúc {formatTime(reported[current.code])}</span>
                )}
                <Button variant="secondary" onClick={() => setReporting(current)}>
                  Báo sai lệch cho Kế toán
                </Button>
              </div>
            }
          />
          <table className="record-table">
            <thead>
              <tr>
                <th scope="col">Trường</th>
                <th scope="col">Trên bảng thanh toán (lập {formatDate(current.issuedAt)})</th>
                <th scope="col">Hồ sơ khách hàng hiện tại (phiên bản {customer.version})</th>
              </tr>
            </thead>
            <tbody>
              {SNAPSHOT_FIELDS.map((field) => {
                const different = current.snapshot[field] !== customer[field];
                const changedAt = different ? lastChangedAt(field) : undefined;
                return (
                  <tr key={field} className={different ? 'record-table__row--warning' : undefined}>
                    <th scope="row">{CUSTOMER_FIELD_LABELS[field]}</th>
                    <td>
                      <span className="record-table__main">{current.snapshot[field]}</span>
                      {different && <span className="record-table__sub">Lưu tại thời điểm lập</span>}
                    </td>
                    <td>
                      <span className="record-table__main">{customer[field]}</span>
                      {different && <span className="record-table__sub">{changedAt ? `Cập nhật ${formatDate(changedAt)}` : 'Theo hồ sơ hiện tại'}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {reporting && (
        <ReportDiscrepancyDialog
          payment={reporting}
          customer={customer}
          onClose={() => setReporting(null)}
          onReported={(at) => {
            setReported((current) => ({ ...current, [reporting.code]: at }));
            setReporting(null);
          }}
        />
      )}
    </>
  );
}

/** 06.6 · Báo sai lệch: ghi nhận mã hồ sơ, nội dung và chuyển Kế toán; không sửa bảng thanh toán (A8.2). */
function ReportDiscrepancyDialog({
  payment,
  customer,
  onClose,
  onReported,
}: {
  payment: PaymentRecord;
  customer: Customer;
  onClose: () => void;
  onReported: (at: string) => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [content, setContent] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function send() {
    setAttempted(true);
    if (!content.trim() || !user || sending) return;
    setSending(true);
    setFailed(false);
    try {
      const { reportedAt } = await customerRecordsApi.reportDiscrepancy({
        userId: user.id,
        signedInAt: user.signedInAt,
        customerCode: customer.code,
        paymentCode: payment.code,
        content,
      });
      showToast({ title: 'Đã chuyển Kế toán', description: `${payment.code}: nội dung sai lệch đã được ghi nhận; bảng thanh toán không bị sửa.` });
      onReported(reportedAt);
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      title="Báo sai lệch bảng thanh toán"
      width={560}
      initialFocus="first"
      onClose={() => !sending && onClose()}
      actions={
        <>
          <Button variant="secondary" disabled={sending} onClick={onClose}>
            Hủy
          </Button>
          <Button disabled={sending} className={sending ? 'is-busy' : undefined} onClick={() => void send()}>
            {sending ? 'Đang chuyển…' : 'Chuyển Kế toán'}
          </Button>
        </>
      }
    >
      <p className="dialog__body">
        Nội dung được chuyển Phòng Kế toán xử lý theo nghiệp vụ liên quan. Màn hình tra cứu không sửa bảng thanh toán.
      </p>
      {failed && (
        <Alert tone="danger" title="Chưa chuyển được nội dung">
          Vui lòng thử lại; nội dung đã nhập vẫn được giữ.
        </Alert>
      )}
      <div className="customer-form__grid">
        <InputField
          label="Hồ sơ"
          value={`${payment.code} · Kỳ ${payment.period}`}
          disabled
          readOnly
          trailing={<Icon name="lock" size={16} className="field__lock" />}
        />
        <InputField label="Chuyển đến" value="Phòng Kế toán" disabled readOnly trailing={<Icon name="lock" size={16} className="field__lock" />} />
      </div>
      <TextAreaField
        label="Nội dung sai lệch"
        required
        placeholder="Mô tả thông tin sai lệch và đề nghị xử lý"
        value={content}
        error={attempted && !content.trim() ? 'Vui lòng nhập nội dung sai lệch.' : undefined}
        disabled={sending}
        onChange={(e) => setContent(e.target.value)}
      />
    </Dialog>
  );
}
