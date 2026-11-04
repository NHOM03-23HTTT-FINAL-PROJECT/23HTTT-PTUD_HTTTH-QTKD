import { useEffect, useId, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Icon } from '@/components/icon/Icon';
import { useNotifications } from '../hooks/useNotifications';
import { NotificationInbox } from './NotificationInbox';

/** Chuông trên Topbar: chấm đỏ khi còn thông báo chưa đọc; bấm để xổ bảng thông báo (UC-CHUNG-05 trigger). */
export function NotificationBell() {
  const { unread, panelOpen, setPanelOpen } = useNotifications();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const { pathname } = useLocation();
  const label = unread ? `Thông báo, ${unread} chưa đọc` : 'Thông báo';

  // Đổi màn hình thì đóng bảng.
  useEffect(() => { setPanelOpen(false); }, [pathname, setPanelOpen]);

  useEffect(() => {
    if (!panelOpen) return;
    function handlePointer(event: PointerEvent) {
      const target = event.target as Element | null;
      // Nút mở bảng ở nơi khác (ví dụ khối "thông báo chưa đọc" ở dashboard) tự xử lý việc mở.
      if (rootRef.current?.contains(target) || target?.closest?.('[data-notification-trigger]')) return;
      setPanelOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setPanelOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [panelOpen, setPanelOpen]);

  return (
    <div className="notification-bell" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="topbar__icon-button"
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={panelOpen}
        aria-controls={panelOpen ? panelId : undefined}
        onClick={() => setPanelOpen(!panelOpen)}
      >
        <Icon name="bell" />
        {unread ? <span className="topbar__unread" aria-hidden /> : null}
      </button>
      {panelOpen && <NotificationInbox variant="panel" id={panelId} onClose={() => setPanelOpen(false)} />}
    </div>
  );
}
