import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '@/components/icon/Icon';
import { StatusBadge } from '@/components/status-badge/StatusBadge';
import { ROUTES } from '@/constants/routes';
import { formatDateTime, formatTime } from '@/utils/format';
import type { Customer, CustomerStatus } from '../types/customer';
import type { DepartmentNotice } from '../types/customerStatus';

export const STATUS_LABEL: Record<CustomerStatus, string> = { active: 'Hoạt động', suspended: 'Tạm ngưng' };

/** Thanh 3 bước của thao tác tạm ngưng (frame 03.1 / 03.2). */
export function StepProgress({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="step-progress" aria-label="Các bước">
      {steps.map((label, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'todo';
        return (
          <li key={label} className={`step-progress__step step-progress__step--${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="step-progress__circle">{index + 1}</span>
            <span className="step-progress__label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

type MenuItem = {
  to: string;
  icon: IconName;
  label: string;
  hint: string;
  tone?: 'danger' | 'success';
  disabled?: boolean;
};

/**
 * Nút "Chỉnh sửa thông tin ▾" (frame 03.0 / 04.0): phần chính mở UC-CUS-02, mũi tên mở menu có thao tác tạm ngưng /
 * kích hoạt lại dành cho Trưởng phòng KD; mục không áp dụng cho trạng thái hiện tại bị mờ.
 */
export function CustomerActionsMenu({ customer, canChangeStatus }: { customer: Customer; canChangeStatus: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const suspended = customer.status === 'suspended';

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

  const statusItems: MenuItem[] = [
    {
      to: ROUTES.customerSuspend(customer.code),
      icon: 'pause',
      label: 'Tạm ngưng khách hàng',
      hint: suspended ? 'Khách hàng đã Tạm ngưng' : 'Ngăn phát sinh giao dịch mới · UC-CUS-03',
      tone: 'danger',
      disabled: suspended,
    },
    {
      to: ROUTES.customerReactivate(customer.code),
      icon: 'play',
      label: 'Kích hoạt lại khách hàng',
      hint: suspended ? 'Cho phép giao dịch trở lại · UC-CUS-04' : 'Chỉ khi khách hàng đang Tạm ngưng',
      tone: 'success',
      disabled: !suspended,
    },
  ];

  return (
    <div ref={rootRef} className="split-button">
      <Link to={ROUTES.customerEdit(customer.code)} className="btn btn--primary split-button__main">
        Chỉnh sửa thông tin
      </Link>
      <button
        type="button"
        className="btn btn--primary split-button__toggle"
        aria-label="Thao tác khác"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="chevron" />
      </button>
      {open && (
        <div className="action-menu" role="menu">
          <MenuLink item={{ to: ROUTES.customerEdit(customer.code), icon: 'edit', label: 'Cập nhật thông tin', hint: 'Sửa thông tin hồ sơ · UC-CUS-02' }} />
          {/* Nhân viên KD không có quyền đổi trạng thái nên chỉ thấy "Cập nhật thông tin" (ghi chú 03.0). */}
          {canChangeStatus && (
            <>
              <p className="action-menu__group">TRẠNG THÁI HỢP TÁC · CHỈ TRƯỞNG PHÒNG KD</p>
              {statusItems.map((item) => (
                <MenuLink key={item.label} item={item} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuLink({ item }: { item: MenuItem }) {
  const className = ['action-menu__item', item.tone && `action-menu__item--${item.tone}`, item.disabled && 'action-menu__item--disabled']
    .filter(Boolean)
    .join(' ');
  const content = (
    <>
      <Icon name={item.icon} className="action-menu__icon" />
      <span>
        <span className="action-menu__label">{item.label}</span>
        <span className="action-menu__hint">{item.hint}</span>
      </span>
    </>
  );
  if (item.disabled) {
    return (
      <span className={className} role="menuitem" aria-disabled="true">
        {content}
      </span>
    );
  }
  return (
    <Link to={item.to} className={className} role="menuitem">
      {content}
    </Link>
  );
}

/** "Lịch sử trạng thái": lần tạo hồ sơ và các lần chuyển trạng thái, mới nhất trước (frame 03.6 / 04.1). */
export function StatusHistoryCard({ customer }: { customer: Customer }) {
  const entries = customer.history.filter((entry, index) => index === 0 || entry.statusChange).reverse();
  return (
    <section className="side-card">
      <h2 className="side-card__title">Lịch sử trạng thái</h2>
      <ol className="history-timeline">
        {entries.map((entry) => {
          const to = entry.statusChange?.to;
          const tone = to === 'suspended' ? 'warning' : to === 'active' ? 'success' : 'neutral';
          return (
            <li key={`${entry.action}-${entry.at}`} className={`history-timeline__item history-timeline__item--${tone}`}>
              <span className="history-timeline__title">
                {entry.statusChange
                  ? `${STATUS_LABEL[entry.statusChange.from]} → ${STATUS_LABEL[entry.statusChange.to]}`
                  : 'Tạo hồ sơ · Hoạt động'}
              </span>
              <span className="history-timeline__meta">
                {entry.by} · {formatDateTime(entry.at)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** "Thông báo bộ phận liên quan" sau quyết định; gửi lỗi hiển thị "Chờ gửi lại" (A9). */
export function DepartmentNoticesCard({ notices }: { notices: DepartmentNotice[] }) {
  return (
    <section className="side-card">
      <h2 className="side-card__title">Thông báo bộ phận liên quan</h2>
      <ul className="notice-list">
        {notices.map((notice) => (
          <li key={notice.department} className="notice-list__item">
            <Icon
              name={notice.status === 'sent' ? 'check' : 'alert'}
              className={notice.status === 'sent' ? 'notice-list__icon--sent' : 'notice-list__icon--retry'}
            />
            <span className="notice-list__text">
              <span className="notice-list__name">Phòng {notice.department}</span>
              <span className="notice-list__meta">
                {notice.status === 'sent' ? `Đã gửi ${formatTime(notice.at)}` : 'Gửi thất bại – đã ghi nhận gửi lại'}
              </span>
            </span>
            <StatusBadge label={notice.status === 'sent' ? 'Đã gửi' : 'Chờ gửi lại'} tone={notice.status === 'sent' ? 'success' : 'warning'} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Một dòng nhãn – giá trị trong thẻ quyết định. */
export function DecisionItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="customer-detail__item">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
