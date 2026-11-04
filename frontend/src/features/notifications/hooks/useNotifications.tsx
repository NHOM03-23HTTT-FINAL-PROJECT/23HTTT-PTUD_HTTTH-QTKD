import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { notificationsApi } from '../api/notificationsApi';

/** Làm mới số chưa đọc định kỳ để chuông và khối "Thông báo chưa đọc" không lệch quá lâu so với server. */
const POLL_MS = 60_000;

type NotificationsContextValue = {
  /** null khi chưa tải được lần nào; giao diện khi đó không hiện số. */
  unread: number | null;
  refresh: () => void;
  /** Cập nhật ngay từ kết quả API (danh sách, đánh dấu đã đọc) để không phải gọi lại. */
  setUnread: (count: number) => void;
  /** Bảng thông báo xổ từ chuông; mở được từ nơi khác như khối "thông báo chưa đọc" ở dashboard. */
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [unread, setUnreadState] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const request = useRef(0);

  const refresh = useCallback(() => {
    const attempt = ++request.current;
    notificationsApi
      .unreadCount(userId)
      .then((count) => { if (attempt === request.current) setUnreadState(count); })
      // Lỗi đếm không chặn màn đang làm; giữ số gần nhất và thử lại ở lần làm mới sau.
      .catch(() => undefined);
  }, [userId]);

  const setUnread = useCallback((count: number) => {
    request.current++;
    setUnreadState(Math.max(0, count));
  }, []);

  useEffect(() => {
    setUnreadState(null);
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      request.current++;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const value = useMemo(() => ({ unread, refresh, setUnread, panelOpen, setPanelOpen }), [unread, refresh, setUnread, panelOpen]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const value = useContext(NotificationsContext);
  if (!value) throw new Error('useNotifications must be used inside NotificationsProvider');
  return value;
}
