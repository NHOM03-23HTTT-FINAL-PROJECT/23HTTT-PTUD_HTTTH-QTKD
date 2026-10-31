import { useMemo } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { ButtonLink } from '@/components/button/Button';
import { Alert } from '@/components/feedback/Alert';
import { Icon, type IconName } from '@/components/icon/Icon';
import { StatusBadge } from '@/components/status-badge/StatusBadge';
import { ROUTES } from '@/constants/routes';
import { formatDate, formatDateTime, initials, todayIso } from '@/utils/format';
import { customersApi } from '../api/customersApi';
import { customerStatusApi } from '../api/customerStatusApi';
import { ContractsTab, PaymentsTab, PriceListsTab } from '../components/CustomerRecordTabs';
import {
  CustomerActionsMenu,
  DecisionItem,
  DepartmentNoticesCard,
  STATUS_LABEL,
  StatusHistoryCard,
} from '../components/CustomerStatusPanels';
import {
  formatChangeAfter,
  formatChangeBefore,
  formatFieldValue,
  truncate,
  type CustomerCatalogs,
} from '../components/customerFormat';
import { useCustomerRecords, type CustomerRecordsState } from '../hooks/useCustomerRecords';
import type { Customer, CustomerField, CustomerHistoryEntry, CustomerStatus, EditableCustomerField } from '../types/customer';
import type { CustomerRecordGroup } from '../types/customerRecords';
import { CUSTOMER_FIELD_LABELS } from '../utils/customerChanges';
import { contractStatusAt, priceApplies } from '../utils/customerRecords';
import './CustomerPages.css';
import './CustomerStatus.css';
import './CustomerList.css';
import './CustomerRecords.css';

/** State khi chuyển từ biểu mẫu tạo (01.7), chỉnh sửa (02.9), tạm ngưng (03.6/03.7) hay kích hoạt lại (04.5). */
export type CustomerDetailState = {
  created?: boolean;
  updated?: boolean;
  suspended?: boolean;
  /** Mở thao tác tạm ngưng khi khách hàng đã Tạm ngưng (03.7 – A2). */
  alreadySuspended?: boolean;
  reactivated?: boolean;
  /** Mở thao tác kích hoạt lại khi khách hàng đã Hoạt động (04 – A2). */
  alreadyActive?: boolean;
  /** Trường vừa cập nhật, gắn nhãn "Mới cập nhật". */
  changedFields?: EditableCustomerField[];
  /** Thao tác đã được lưu ở lần gửi trước (mất kết nối, thử lại – A6.4 / A6.3). */
  replayed?: boolean;
};

export const CUSTOMER_STATUS_BADGE: Record<CustomerStatus, { label: string; tone: 'success' | 'warning' }> = {
  active: { label: 'Hoạt động', tone: 'success' },
  suspended: { label: 'Tạm ngưng', tone: 'warning' },
};

const IDENTITY_FIELDS: CustomerField[] = ['name', 'taxCode', 'address', 'representative', 'customerGroup', 'serviceGroups'];

type TabKey = 'tong-quan' | 'hop-dong' | 'bang-gia' | 'bang-thanh-toan' | 'lich-su';

const TABS: { key: TabKey; label: string; group?: CustomerRecordGroup }[] = [
  { key: 'tong-quan', label: 'Tổng quan' },
  { key: 'hop-dong', label: 'Hợp đồng', group: 'contracts' },
  { key: 'bang-gia', label: 'Bảng giá', group: 'priceLists' },
  { key: 'bang-thanh-toan', label: 'Bảng thanh toán', group: 'payments' },
  { key: 'lich-su', label: 'Lịch sử' },
];

/**
 * UC-CUS-06 · Xem thông tin và hồ sơ khách hàng (06.1 → 06.10), đồng thời là trang đích của 01.7, 02.9, 03.6, 04.5.
 * Quyền xem được kiểm tra trên đúng khách hàng được yêu cầu, kể cả khi mở bằng đường dẫn trực tiếp.
 */
export function CustomerDetailPage() {
  const { code = '' } = useParams();
  const customer = customersApi.getCustomer(code);
  if (!customer) return <CannotOpenProfile />;
  return <CustomerProfile key={customer.code} customer={customer} />;
}

/** 06.10 · Không thể mở hồ sơ: không tồn tại hoặc ngoài quyền – không trả thông tin chi tiết (A2 / A8.3). */
function CannotOpenProfile() {
  return (
    <>
      <nav className="breadcrumb" aria-label="Đường dẫn">
        <Link to={ROUTES.customers}>Khách hàng</Link>
        <span className="breadcrumb__separator">/</span>
        <span className="breadcrumb__current" aria-current="page">
          Không thể mở hồ sơ
        </span>
      </nav>
      <section className="customer-results">
        <div className="customer-empty customer-empty--page">
          <span className="customer-empty__icon customer-empty__icon--neutral">
            <Icon name="lock" />
          </span>
          <h3>Không thể mở hồ sơ này</h3>
          <p>
            Hồ sơ không tồn tại hoặc bạn không có quyền truy cập. Hệ thống không hiển thị thông tin chi tiết. Nếu cần quyền xem, liên
            hệ người quản lý hoặc Quản trị hệ thống.
          </p>
          <div className="customer-empty__actions">
            <ButtonLink to={ROUTES.customers}>Quay lại danh sách</ButtonLink>
            <Link to={ROUTES.customers} className="btn btn--ghost">
              Tìm khách hàng khác
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function CustomerProfile({ customer }: { customer: Customer }) {
  const location = useLocation();
  const { can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const state = location.state as CustomerDetailState | null;
  const catalogs: CustomerCatalogs = useMemo(() => customersApi.getFormOptions(), []);
  const records = useCustomerRecords(customer.code);

  const requestedTab = searchParams.get('tab') as TabKey | null;
  const tab = TABS.some((t) => t.key === requestedTab) ? requestedTab! : 'tong-quan';
  // Giữ state điều hướng để banner kết quả thao tác không mất khi đổi tab.
  const selectTab = (key: TabKey) =>
    setSearchParams(key === 'tong-quan' ? {} : { tab: key }, { replace: true, state: location.state });

  const badge = CUSTOMER_STATUS_BADGE[customer.status];

  return (
    <>
      <nav className="breadcrumb" aria-label="Đường dẫn">
        <Link to={ROUTES.customers}>Khách hàng</Link>
        <span className="breadcrumb__separator">/</span>
        <span className="breadcrumb__current" aria-current="page">
          {customer.code}
        </span>
      </nav>

      <div className="page-header page-header--customer">
        <div className="page-header__title">
          <div className="customer-title">
            <h1>{customer.name}</h1>
            <StatusBadge label={badge.label} tone={badge.tone} />
          </div>
          <p>
            {customer.code} · MST {customer.taxCode} · Nhân viên phụ trách {customer.ownerName}
            {customer.suspension && ` · Tạm ngưng từ ${formatDateTime(customer.suspension.at)}`}
            {customer.status === 'active' && customer.reactivation && ` · Hoạt động lại từ ${formatDateTime(customer.reactivation.at)}`}
          </p>
        </div>
        <div className="page-header__actions">
          <ButtonLink to={ROUTES.customers} variant="secondary">
            Về danh sách
          </ButtonLink>
          {/* Menu "Chỉnh sửa thông tin ▾": Trưởng phòng KD có thêm thao tác trạng thái (03.0 / 04.0). */}
          {can('customers.update') && <CustomerActionsMenu customer={customer} canChangeStatus={can('customers.change-status')} />}
        </div>
      </div>

      <div className="profile-tabs" role="tablist" aria-label="Nhóm thông tin">
        {TABS.map((item) => {
          const count = item.group ? groupCount(records.state, item.group) : undefined;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              className={tab === item.key ? 'profile-tabs__tab profile-tabs__tab--active' : 'profile-tabs__tab'}
              onClick={() => selectTab(item.key)}
            >
              {item.label}
              {count !== undefined && <span className="profile-tabs__count">{count}</span>}
            </button>
          );
        })}
      </div>

      <ActionBanners customer={customer} state={state} />

      {tab === 'tong-quan' && (
        <OverviewTab customer={customer} catalogs={catalogs} state={state} records={records.state} onRetry={records.retry} onOpenTab={selectTab} />
      )}
      {tab === 'hop-dong' && <ContractsTab state={records.state.contracts} onRetry={() => records.retry('contracts')} />}
      {tab === 'bang-gia' && (
        <PriceListsTab state={records.state.priceLists} customer={customer} onRetry={() => records.retry('priceLists')} />
      )}
      {tab === 'bang-thanh-toan' && (
        <PaymentsTab state={records.state.payments} customer={customer} onRetry={() => records.retry('payments')} />
      )}
      {tab === 'lich-su' && (
        <div className="customer-layout">
          <section className="customer-card customer-layout__main">
            <div className="customer-card__heading">
              <h2>Lịch sử thay đổi</h2>
              <p>Tạo hồ sơ, cập nhật thông tin và chuyển trạng thái, mới nhất trước.</p>
            </div>
            <ol className="history-timeline">
              {[...customer.history].reverse().map((entry, index) => (
                <HistoryItem key={`${entry.action}-${entry.at}`} entry={entry} latest={index === 0} catalogs={catalogs} />
              ))}
            </ol>
          </section>
          <aside className="customer-layout__side">
            <StatusHistoryCard customer={customer} />
          </aside>
        </div>
      )}
    </>
  );
}

/** Số trên tab chỉ đếm hồ sơ trong phạm vi quyền; chưa tải xong hoặc lỗi thì không hiển thị số. */
function groupCount(state: CustomerRecordsState, group: CustomerRecordGroup): number | undefined {
  const groupState = state[group];
  if (groupState.status !== 'ok') return undefined;
  if (group === 'priceLists') return new Set(state.priceLists.status === 'ok' ? state.priceLists.data.map((v) => v.code) : []).size;
  return groupState.data.length;
}

function ActionBanners({ customer, state }: { customer: Customer; state: CustomerDetailState | null }) {
  return (
    <>
      {state?.created && (
        <Alert tone="success" title="Tạo khách hàng thành công">
          {state.replayed && 'Hồ sơ đã được lưu ở lần gửi trước, hệ thống không tạo thêm hồ sơ. '}
          Hồ sơ đã được lưu với mã {customer.code}, trạng thái Hoạt động, nhân viên phụ trách {customer.ownerName}.
        </Alert>
      )}
      {state?.updated && (
        <Alert tone="success" title="Đã cập nhật thông tin khách hàng">
          {state.replayed && 'Thay đổi đã được lưu ở lần gửi trước, hệ thống không ghi thêm lịch sử. '}
          Hồ sơ đã lưu phiên bản {customer.version}. Hợp đồng, bảng giá và bảng thanh toán đã chốt tiếp tục dùng thông tin tại thời
          điểm lập hoặc chốt.
        </Alert>
      )}
      {state?.suspended && customer.suspension && (
        <Alert tone="success" title="Đã tạm ngưng khách hàng">
          {state.replayed && 'Quyết định đã được ghi nhận ở lần gửi trước, hệ thống không ghi thêm lịch sử. '}
          Từ {formatDateTime(customer.suspension.at)} khách hàng không thể phát sinh hợp đồng hoặc bảng giá cho giao dịch mới. Hồ sơ
          đã phát sinh giữ nguyên trạng thái và được xử lý theo phương án.
        </Alert>
      )}
      {state?.alreadySuspended && customer.suspension && (
        <Alert
          tone="info"
          title="Khách hàng đang ở trạng thái Tạm ngưng"
          action={
            <a className="alert__link" href="#quyet-dinh-tam-ngung">
              Xem quyết định tạm ngưng
            </a>
          }
        >
          Khách hàng đã được tạm ngưng từ {formatDateTime(customer.suspension.at)} bởi {customer.suspension.decidedBy}. Hệ thống không
          thực hiện tạm ngưng lần nữa và không ghi thêm lịch sử chuyển trạng thái.
        </Alert>
      )}
      {state?.reactivated && (
        <Alert tone="success" title="Đã kích hoạt lại khách hàng">
          {state.replayed && 'Quyết định đã được ghi nhận ở lần gửi trước, hệ thống không ghi thêm lịch sử. '}
          Khách hàng được phép phát sinh giao dịch mới nếu đáp ứng điều kiện của từng phân hệ. Hợp đồng đã hủy hoặc hết hiệu lực
          không được tự khôi phục hay gia hạn.
        </Alert>
      )}
      {state?.alreadyActive && (
        <Alert tone="info" title="Khách hàng đang Hoạt động">
          Hệ thống không thực hiện kích hoạt lại và không ghi thêm lịch sử chuyển trạng thái.
        </Alert>
      )}
      {/* 06.7 – A3.1: vẫn xem theo quyền, không tự kích hoạt lại hay mở quyền giao dịch mới. */}
      {customer.status === 'suspended' && customer.suspension && !state?.suspended && !state?.alreadySuspended && (
        <Alert tone="warning" title={`Khách hàng đang Tạm ngưng từ ${formatDate(customer.suspension.at)}`}>
          Bạn vẫn xem được hồ sơ theo quyền. Khách hàng không được phát sinh hợp đồng, bảng giá cho giao dịch mới; việc xem không thay
          đổi trạng thái hay mở lại quyền giao dịch.
        </Alert>
      )}
    </>
  );
}

type OverviewProps = {
  customer: Customer;
  catalogs: CustomerCatalogs;
  state: CustomerDetailState | null;
  records: CustomerRecordsState;
  onRetry: (group: CustomerRecordGroup) => void;
  onOpenTab: (tab: TabKey) => void;
};

/** 06.1 · Tổng quan: nhận diện, đầu mối liên hệ, trạng thái hợp tác, hồ sơ liên quan, thông tin tạo/cập nhật. */
function OverviewTab({ customer, catalogs, state, records, onRetry, onOpenTab }: OverviewProps) {
  const { can } = useAuth();
  const recentlyChanged = new Set<CustomerField>(state?.updated ? state.changedFields ?? [] : []);
  const badge = CUSTOMER_STATUS_BADGE[customer.status];
  const last = customer.history[customer.history.length - 1];
  const notices = latestNotices(customer);
  const contactChanged = (['contactName', 'contactTitle', 'phone', 'email'] as CustomerField[]).some((f) => recentlyChanged.has(f));

  return (
    <div className="customer-layout">
      <div className="customer-layout__main">
        <section className="customer-card">
          <div className="customer-card__heading">
            <h2>Thông tin nhận diện</h2>
          </div>
          <dl className="customer-detail__grid">
            {IDENTITY_FIELDS.map((field) => (
              <div key={field} className="customer-detail__item">
                <dt>
                  {CUSTOMER_FIELD_LABELS[field]}
                  {recentlyChanged.has(field) && <span className="recent-tag">Mới cập nhật</span>}
                </dt>
                <dd>{formatFieldValue(field, customer[field], catalogs) || '—'}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="customer-card">
          <div className="record-card__title-row">
            <h2>
              Đầu mối liên hệ
              {contactChanged && <span className="recent-tag">Mới cập nhật</span>}
            </h2>
            {can('customers.update') && (
              <Link to={ROUTES.customerEdit(customer.code)} className="link-button">
                Quản lý người liên hệ
              </Link>
            )}
          </div>
          <div className="contact-row">
            <span className="contact-row__avatar">{initials(customer.contactName || customer.name)}</span>
            <span className="contact-row__who">
              <span className="contact-row__name">
                {customer.contactName || 'Chưa có người liên hệ chính'}
                {customer.contactName && <span className="recent-tag">Liên hệ chính</span>}
              </span>
              <span className="contact-row__title">{customer.contactTitle || 'Phương thức liên hệ chung của doanh nghiệp'}</span>
            </span>
            <span className="contact-row__channels">
              {customer.phone && <span>{customer.phone}</span>}
              {customer.email && <a href={`mailto:${customer.email}`}>{customer.email}</a>}
            </span>
          </div>
        </section>

        <StatusDecisionCards customer={customer} />
      </div>

      <aside className="customer-layout__side">
        <section className="side-card">
          <h2 className="side-card__title">Trạng thái hợp tác</h2>
          <div className="side-card__item">
            <span className="side-card__label">Trạng thái</span>
            <StatusBadge label={badge.label} tone={badge.tone} />
          </div>
          <div className="side-card__item">
            <span className="side-card__label">Hợp tác từ</span>
            <span className="side-card__value">{formatDate(customer.createdAt)}</span>
          </div>
          <div className="side-card__item">
            <span className="side-card__label">Nhân viên phụ trách</span>
            <span className="side-card__value">{customer.ownerName}</span>
          </div>
        </section>

        <RelatedRecordsCard records={records} onRetry={onRetry} onOpenTab={onOpenTab} />
        {notices && <DepartmentNoticesCard notices={notices} />}

        <section className="side-card">
          <h2 className="side-card__title">Tạo &amp; cập nhật</h2>
          <div className="side-card__item">
            <span className="side-card__label">Tạo hồ sơ</span>
            <span className="side-card__value">
              {customer.createdBy} · {formatDateTime(customer.createdAt)}
            </span>
          </div>
          <div className="side-card__item">
            <span className="side-card__label">Cập nhật lần cuối</span>
            <span className="side-card__value">
              {last.by} · {formatDateTime(last.at)}
              {last.statusChange && ` (${STATUS_LABEL[last.statusChange.to].toLowerCase()})`}
            </span>
          </div>
          <div className="side-card__item">
            <span className="side-card__label">Phiên bản</span>
            <span className="side-card__value">{customer.version}</span>
          </div>
        </section>
      </aside>
    </div>
  );
}

const RELATED: { group: CustomerRecordGroup; tab: TabKey; label: string; icon: IconName }[] = [
  { group: 'contracts', tab: 'hop-dong', label: 'Hợp đồng', icon: 'file' },
  { group: 'priceLists', tab: 'bang-gia', label: 'Bảng giá', icon: 'list' },
  { group: 'payments', tab: 'bang-thanh-toan', label: 'Bảng thanh toán', icon: 'inbox' },
];

/** Tóm tắt một nhóm hồ sơ liên quan, chỉ dựa trên hồ sơ trong phạm vi quyền. */
function summarize(records: CustomerRecordsState, group: CustomerRecordGroup): string {
  const today = todayIso();
  if (group === 'contracts' && records.contracts.status === 'ok') {
    const counts = new Map<string, number>();
    records.contracts.data.forEach((c) => {
      const key = contractStatusAt(c, today);
      const label = { active: 'đang hiệu lực', pending: 'chờ duyệt', expired: 'hết hiệu lực', upcoming: 'chưa hiệu lực', draft: 'dự thảo', cancelled: 'đã hủy' }[key];
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return counts.size ? [...counts].map(([label, n]) => `${n} ${label}`).join(' · ') : 'Chưa có hợp đồng';
  }
  if (group === 'priceLists' && records.priceLists.status === 'ok') {
    const current = records.priceLists.data.find((v) => priceApplies(v, today));
    if (current) return `${current.code} · phiên bản ${current.version} hiện hành từ ${formatDate(current.from)}`;
    const pending = records.priceLists.data.find((v) => v.state === 'pending');
    return pending ? `${pending.code} dự thảo đang chờ duyệt` : 'Chưa có bảng giá hiện hành';
  }
  if (group === 'payments' && records.payments.status === 'ok') {
    const [latest] = records.payments.data;
    if (!latest) return 'Chưa có bảng thanh toán';
    return `${records.payments.data.length} bảng · gần nhất kỳ ${latest.period} ${latest.state === 'reconciling' ? 'đang đối soát' : 'đã phát hành'}`;
  }
  return '';
}

function RelatedRecordsCard({
  records,
  onRetry,
  onOpenTab,
}: {
  records: CustomerRecordsState;
  onRetry: (group: CustomerRecordGroup) => void;
  onOpenTab: (tab: TabKey) => void;
}) {
  return (
    <section className="side-card">
      <div>
        <h2 className="side-card__title">Hồ sơ liên quan</h2>
        <p className="side-card__subtitle">Chỉ hiển thị hồ sơ trong phạm vi quyền của bạn.</p>
      </div>
      <ul className="related-list">
        {RELATED.map((item) => {
          const status = records[item.group].status;
          if (status === 'error') {
            return (
              <li key={item.group} className="related-list__item">
                <span className="related-list__icon related-list__icon--danger">
                  <Icon name="alert" />
                </span>
                <span className="related-list__text">
                  <span className="related-list__label">{item.label}</span>
                  <span className="related-list__summary related-list__summary--danger">
                    Không tải được nhóm hồ sơ này. Các phần khác vẫn xem được.
                  </span>
                </span>
                <button type="button" className="link-button" onClick={() => onRetry(item.group)}>
                  Thử lại
                </button>
              </li>
            );
          }
          return (
            <li key={item.group}>
              <button type="button" className="related-list__item related-list__item--link" onClick={() => onOpenTab(item.tab)}>
                <span className="related-list__icon">
                  <Icon name={item.icon} />
                </span>
                <span className="related-list__text">
                  <span className="related-list__label">{item.label}</span>
                  <span className="related-list__summary">{status === 'loading' ? 'Đang tải…' : summarize(records, item.group)}</span>
                </span>
                <Icon name="arrow-right" className="related-list__arrow" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function HistoryItem({ entry, latest, catalogs }: { entry: CustomerHistoryEntry; latest: boolean; catalogs: CustomerCatalogs }) {
  const version = entry.fromVersion ? `v${entry.fromVersion} → v${entry.version}` : entry.version ? `v${entry.version}` : '';
  const hasDetail = (entry.changes?.length ?? 0) > 0 || entry.reason;
  const statusTone =
    entry.statusChange?.to === 'suspended' ? ' history-timeline__item--warning' : entry.statusChange ? ' history-timeline__item--success' : '';

  return (
    <li className={`history-timeline__item${latest ? ' history-timeline__item--latest' : ''}${statusTone}`}>
      <span className="history-timeline__title">
        {entry.statusChange
          ? `${entry.action}: ${STATUS_LABEL[entry.statusChange.from]} → ${STATUS_LABEL[entry.statusChange.to]}`
          : entry.action}
      </span>
      <span className="history-timeline__meta">
        {entry.by} · {formatDateTime(entry.at)}
        {version && ` · ${version}`}
      </span>
      {hasDetail && (
        <div className="history-timeline__detail">
          {entry.changes?.map((change) => (
            <p key={change.field}>
              {CUSTOMER_FIELD_LABELS[change.field]}:{' '}
              {change.field === 'serviceGroups'
                ? formatChangeAfter(change, catalogs)
                : `${truncate(formatChangeBefore(change, catalogs))} → ${truncate(formatChangeAfter(change, catalogs))}`}
            </p>
          ))}
          {entry.reason && <p>Lý do: {entry.reason}</p>}
        </div>
      )}
    </li>
  );
}

/** Thông báo bộ phận của quyết định trạng thái hiện hành (tạm ngưng hoặc lần kích hoạt lại gần nhất). */
function latestNotices(customer: Customer) {
  if (customer.status === 'suspended') return customer.suspension?.notices.length ? customer.suspension.notices : null;
  return customer.reactivation?.notices ?? null;
}

function evidenceNames(files: { name: string }[]) {
  return files.length ? files.map((f) => f.name).join(', ') : '—';
}

/** Quyết định tạm ngưng hiện hành + phương án (03.6 / 03.7) hoặc quyết định kích hoạt lại gần nhất (04.5). */
function StatusDecisionCards({ customer }: { customer: Customer }) {
  const { suspension, reactivation } = customer;
  if (customer.status === 'suspended' && suspension) {
    const reasonGroup = customerStatusApi.getSuspensionReasonGroups().find((g) => g.code === suspension.reasonGroup)?.label;
    return (
      <>
        <section id="quyet-dinh-tam-ngung" className="customer-card">
          <div className="customer-card__heading">
            <h2>Quyết định tạm ngưng hiện hành</h2>
          </div>
          <dl className="customer-detail__grid customer-detail__grid--single">
            <DecisionItem label="Trạng thái">Hoạt động → Tạm ngưng</DecisionItem>
            <DecisionItem label="Nhóm lý do">{reasonGroup ?? suspension.reasonGroup}</DecisionItem>
            <DecisionItem label="Nội dung">{suspension.reason}</DecisionItem>
            <DecisionItem label="Căn cứ">{evidenceNames(suspension.evidence)}</DecisionItem>
            <DecisionItem label="Người xác nhận">
              {suspension.decidedBy} · {suspension.decidedByTitle}
            </DecisionItem>
            <DecisionItem label="Thời điểm áp dụng">{formatDateTime(suspension.at)}</DecisionItem>
            {suspension.coordinationNote && <DecisionItem label="Ghi chú phối hợp">{suspension.coordinationNote}</DecisionItem>}
          </dl>
        </section>
        {suspension.plan.length > 0 && (
          <section className="customer-card">
            <div className="customer-card__heading">
              <h2>Phương án xử lý đã ghi nhận</h2>
            </div>
            <ul className="check-list">
              {suspension.plan.map((item) => (
                <li key={item.id} className="check-list__item">
                  <Icon name="info" className="icon-tone--info" />
                  <span className="check-list__text">
                    <span className="check-list__label">
                      {item.code} · {item.option}
                    </span>
                    <span className="check-list__detail">{item.planNote}</span>
                  </span>
                  <StatusBadge label={item.department} tone="info" />
                </li>
              ))}
            </ul>
          </section>
        )}
      </>
    );
  }
  if (customer.status === 'active' && reactivation) {
    return (
      <>
        <section className="customer-card">
          <div className="customer-card__heading">
            <h2>Quyết định kích hoạt lại</h2>
          </div>
          <dl className="customer-detail__grid customer-detail__grid--single">
            <DecisionItem label="Trạng thái">Tạm ngưng → Hoạt động</DecisionItem>
            <DecisionItem label="Lý do">{reactivation.reason}</DecisionItem>
            {reactivation.exception && (
              <DecisionItem label="Quyết định ngoại lệ">
                {reactivation.exception.decisionNo} · {reactivation.exception.content}
              </DecisionItem>
            )}
            <DecisionItem label="Căn cứ">{evidenceNames(reactivation.evidence)}</DecisionItem>
            <DecisionItem label="Người xác nhận">
              {reactivation.decidedBy} · {reactivation.decidedByTitle}
            </DecisionItem>
            <DecisionItem label="Thời điểm">{formatDateTime(reactivation.at)}</DecisionItem>
          </dl>
        </section>
        {(customer.closedRecords?.length ?? 0) > 0 && (
          <section className="customer-card">
            <div className="customer-card__heading">
              <h2>Hồ sơ liên quan (giữ nguyên trạng thái)</h2>
            </div>
            <ul className="check-list">
              {customer.closedRecords!.map((record) => (
                <li key={record.code} className="check-list__item">
                  <Icon name="info" className="icon-tone--neutral" />
                  <span className="check-list__text">
                    <span className="check-list__label">
                      {record.code} · {record.title}
                    </span>
                    <span className="check-list__detail">{record.note}</span>
                  </span>
                  <StatusBadge label={record.status} tone="neutral" />
                </li>
              ))}
            </ul>
          </section>
        )}
      </>
    );
  }
  return null;
}
