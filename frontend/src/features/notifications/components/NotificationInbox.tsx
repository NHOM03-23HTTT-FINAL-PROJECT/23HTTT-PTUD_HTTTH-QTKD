import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { Button } from '@/components/button/Button';
import { Pagination } from '@/components/data-table/Pagination';
import { Alert } from '@/components/feedback/Alert';
import { Icon } from '@/components/icon/Icon';
import { ROUTES } from '@/constants/routes';
import { formatDateTime } from '@/utils/format';
import { notificationsApi } from '../api/notificationsApi';
import { useNotifications } from '../hooks/useNotifications';
import { useOpenNotification } from '../hooks/useOpenNotification';
import type { NotificationFilter, NotificationItem, NotificationPage } from '../types/notification';
import { KIND_LABELS, RECORD_LABELS } from '../utils/notificationTarget';
import './Notifications.css';

const PANEL_PAGE_SIZE = 10;
const PAGE_SIZES = [10, 20, 50] as const;
const FILTERS: { key: NotificationFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'unread', label: 'Chưa đọc' },
];

type Load = { kind: 'loading' } | { kind: 'ok'; data: NotificationPage } | { kind: 'error' };
/** Thông báo đang mở tại chỗ: toàn văn (A5) hoặc kèm thông điệp không mở được hồ sơ (E1/E2). */
type Expanded = { id: string; message?: string };

type InboxProps =
  /** Bảng xổ từ chuông: 10 thông báo/trang, có nút "Xem tất cả thông báo". `onClose` đóng bảng trước khi chuyển màn. */
  | { variant: 'panel'; id: string; onClose: () => void }
  /** Trang danh sách đầy đủ `/thong-bao`: chọn số dòng mỗi trang. */
  | { variant: 'page' };

/**
 * UC-CHUNG-05 · Hộp thư thông báo của chính người dùng: mới nhất trước, lọc Tất cả / Chưa đọc, phân trang,
 * đánh dấu tất cả đã đọc; chọn một thông báo để đánh dấu đã đọc và mở hồ sơ liên quan.
 */
export function NotificationInbox(props: InboxProps) {
  const isPanel = props.variant === 'panel';
  const close = isPanel ? props.onClose : undefined;
  const { user } = useAuth();
  const { unread, setUnread } = useNotifications();
  const open = useOpenNotification();
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(isPanel ? PANEL_PAGE_SIZE : 20);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Expanded | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const opening = useRef(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoad((previous) => (previous.kind === 'ok' ? previous : { kind: 'loading' }));
    notificationsApi
      .list(user.id, { filter, page, pageSize })
      .then((data) => {
        if (!active) return;
        // Trang hiện tại trống vì danh sách vừa ngắn lại (ví dụ đã đọc hết ở bộ lọc "Chưa đọc"): lùi về trang cuối còn dữ liệu.
        const lastPage = Math.max(1, Math.ceil(data.total / pageSize));
        if (data.items.length === 0 && page > lastPage) { setPage(lastPage); return; }
        setLoad({ kind: 'ok', data });
        setUnread(data.unreadCount);
      })
      .catch(() => active && setLoad({ kind: 'error' }));
    return () => { active = false; };
  }, [user, filter, page, pageSize, reload, setUnread]);

  if (!user) return null;

  function changeFilter(next: NotificationFilter) {
    if (next === filter) return;
    setFilter(next); setPage(1); setExpanded(null); setNotice(null); setLoad({ kind: 'loading' });
  }

  function updateItem(item: NotificationItem) {
    setLoad((previous) => previous.kind !== 'ok' ? previous : {
      kind: 'ok',
      data: { ...previous.data, items: previous.data.items.map((n) => (n.id === item.id ? item : n)) },
    });
  }

  async function select(item: NotificationItem) {
    if (opening.current) return;
    opening.current = true; setBusyId(item.id); setNotice(null);
    try {
      const result = await open(item, { beforeNavigate: close });
      if (result.kind === 'navigated') return;
      updateItem(result.item);
      setExpanded(result.kind === 'blocked' ? { id: item.id, message: result.message } : { id: item.id });
    } finally {
      opening.current = false; setBusyId(null);
    }
  }

  async function markAllRead() {
    if (!user || markingAll) return;
    setMarkingAll(true); setNotice(null);
    try {
      await notificationsApi.markAllRead(user.id);
      setUnread(0);
      setNotice({ tone: 'success', text: 'Đã đánh dấu tất cả là đã đọc.' });
      setReload((n) => n + 1);
    } catch {
      setNotice({ tone: 'danger', text: 'Chưa đánh dấu được. Trạng thái đọc được giữ nguyên; hãy thử lại.' });
    } finally {
      setMarkingAll(false);
    }
  }

  const data = load.kind === 'ok' ? load.data : null;
  // Số dùng chung với chuông: bảng xổ và trang danh sách có thể cùng mở và cùng đánh dấu đã đọc.
  const unreadCount = unread ?? data?.unreadCount ?? 0;
  const markAllLabel = markingAll ? 'Đang đánh dấu…' : 'Đánh dấu tất cả đã đọc';

  const tabs = (
    <div className="notification-inbox__tabs" role="tablist" aria-label="Lọc thông báo">
      {FILTERS.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={filter === item.key}
          className={filter === item.key ? 'notification-inbox__tab notification-inbox__tab--active' : 'notification-inbox__tab'}
          onClick={() => changeFilter(item.key)}
        >
          {item.label}
          {item.key === 'unread' && unreadCount > 0 && <span className="notification-inbox__count">{unreadCount}</span>}
        </button>
      ))}
    </div>
  );

  const body = (
    <>
      {notice && <div className="notification-inbox__notice"><Alert tone={notice.tone} title={notice.text} /></div>}

      <div className="notification-inbox__scroll">
        {load.kind === 'loading' && <p className="notification-inbox__state">Đang tải thông báo…</p>}

        {load.kind === 'error' && (
          <div className="notification-inbox__notice">
            <Alert
              tone="danger"
              title="Không tải được thông báo"
              action={<Button variant="secondary" onClick={() => { setLoad({ kind: 'loading' }); setReload((n) => n + 1); }}>Tải lại</Button>}
            />
          </div>
        )}

        {data && data.items.length === 0 && (
          <p className="notification-inbox__state">
            {filter === 'unread' ? 'Không có thông báo chưa đọc.' : 'Bạn chưa có thông báo nào'}
          </p>
        )}

        {data && data.items.length > 0 && (
          <ul className="notification-inbox__list">
            {data.items.map((item) => {
              const isExpanded = expanded?.id === item.id;
              return (
                <li key={item.id} className={item.isRead ? 'notification' : 'notification notification--unread'}>
                  <button
                    type="button"
                    className="notification__button"
                    onClick={() => select(item)}
                    disabled={busyId !== null}
                    aria-busy={busyId === item.id}
                    aria-expanded={isExpanded}
                  >
                    <span className="notification__dot" aria-hidden />
                    <span className="notification__body">
                      <span className="notification__meta">
                        <span className="notification__kind">{KIND_LABELS[item.kind] ?? KIND_LABELS.General}</span>
                        <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
                      </span>
                      <span className={isExpanded ? 'notification__content notification__content--full' : 'notification__content'}>
                        {item.content}
                      </span>
                      <span className="notification__record">
                        {RECORD_LABELS[item.recordType] ?? 'Hồ sơ'}
                        {item.recordTitle ? ` · ${item.recordTitle}` : ''}
                      </span>
                      <span className="visually-hidden">{item.isRead ? 'Đã đọc' : 'Chưa đọc'}</span>
                    </span>
                    {busyId === item.id && <span className="notification__busy">Đang mở…</span>}
                  </button>
                  {isExpanded && expanded.message && (
                    <div className="notification__alert">
                      <Alert tone="warning" title={expanded.message} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {data && (isPanel ? data.total > pageSize : data.total > 0) && (
        <Pagination
          page={page}
          total={data.total}
          size={pageSize}
          sizes={isPanel ? [PANEL_PAGE_SIZE] : PAGE_SIZES}
          unit="thông báo"
          disabled={busyId !== null}
          onPageChange={(next) => { setPage(next); setExpanded(null); }}
          onSizeChange={(next) => { setPageSize(next); setPage(1); setExpanded(null); }}
        />
      )}
    </>
  );

  if (props.variant === 'panel') {
    return (
      <div id={props.id} className="notification-panel notification-inbox" role="dialog" aria-label="Thông báo">
        <div className="notification-inbox__header">
          <p className="notification-inbox__title">Thông báo</p>
          <button type="button" className="notification-inbox__mark-all" onClick={markAllRead} disabled={markingAll || unreadCount === 0}>
            <Icon name="check" />
            {markAllLabel}
          </button>
        </div>
        {tabs}
        {body}
        <Link to={ROUTES.notifications} className="notification-panel__view-all" onClick={props.onClose}>
          Xem tất cả thông báo
          <Icon name="arrow-right" />
        </Link>
      </div>
    );
  }

  return (
    <div className="notifications-page">
      <div className="page-header">
        <div className="page-header__title">
          <h1>Thông báo</h1>
          <p>{unreadCount > 0 ? `Bạn có ${unreadCount} thông báo chưa đọc.` : 'Bạn đã đọc hết thông báo.'}</p>
        </div>
        <div className="page-header__actions">
          <Button variant="secondary" onClick={markAllRead} disabled={markingAll || unreadCount === 0}>
            <Icon name="check" />
            {markAllLabel}
          </Button>
        </div>
      </div>
      <section className="notification-inbox notification-inbox--page" aria-label="Danh sách thông báo">
        {tabs}
        {body}
      </section>
    </div>
  );
}
