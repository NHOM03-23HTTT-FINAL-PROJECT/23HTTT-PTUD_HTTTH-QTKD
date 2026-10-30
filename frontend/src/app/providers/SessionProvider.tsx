import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/button/Button';
import { Dialog } from '@/components/feedback/Dialog';
import { Icon } from '@/components/icon/Icon';
import { SESSION_IDLE_MS, SESSION_WARNING_MS } from '@/config/session';
import { REDIRECT_PARAM, ROUTES } from '@/constants/routes';
import { authApi } from '@/features/auth/api/authApi';
import { sessionStore } from '@/lib/auth/session';
import { signOutNotice, type SignOutReason } from '@/lib/auth/signOutNotice';
import { formatCountdown } from '@/utils/format';
import { useAuth, type CurrentUser } from './AuthProvider';
import './SessionProvider.css';

type SessionContextValue = {
  /** Đăng xuất theo UC-CHUNG-03: hỏi xác nhận nếu còn dữ liệu chưa lưu (A1). */
  requestLogout: () => void;
  /** Kết thúc phiên ngay với lý do cho trước (ví dụ tài khoản bị tạm khóa – 04.7). */
  endSession: (reason: SignOutReason) => void;
  setUnsaved: (id: string, description: string | null) => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'] as const;
/** Ghi lần thao tác cuối xuống storage tối đa mỗi 10 giây để khôi phục đúng sau khi tải lại trang. */
const PERSIST_INTERVAL_MS = 10 * 1000;

/**
 * Quản lý vòng đời phiên trong app shell: đăng xuất (03.0/03.1/03.3), cảnh báo và tự hủy phiên khi không thao
 * tác (03.2/03.4), phát hiện phiên bị thu hồi ở "request" tiếp theo – mỗi lần chuyển trang hoặc quay lại tab (03.5).
 */
/**
 * Bước 3–6 của UC-CHUNG-03: thu hồi phiên phía server, xóa phiên trình duyệt, về đăng nhập kèm thông báo lý do.
 * Dùng được cả ngoài app shell (ví dụ màn đổi mật khẩu bắt buộc).
 */
export function useEndSession() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const ended = useRef(false);
  const currentPath = useRef(location.pathname + location.search);
  currentPath.current = location.pathname + location.search;

  return useCallback(
    (reason: SignOutReason) => {
      if (ended.current || !user) return;
      ended.current = true;
      signOutNotice.save({ reason, identifier: user.username });
      if (reason === 'logout' || reason === 'expired') {
        // E1/E2: lỗi server hoặc mất mạng vẫn xóa phiên phía trình duyệt; phiên server được dọn sau.
        void authApi.logout(user.id, reason).catch(() => undefined);
      }
      // A2: đăng nhập lại sẽ quay về trang đang làm.
      const target = currentPath.current;
      const search =
        reason === 'expired' && target !== ROUTES.dashboard ? `?${REDIRECT_PARAM}=${encodeURIComponent(target)}` : '';
      navigate(`${ROUTES.login}${search}`, { replace: true });
      logout();
    },
    [logout, navigate, user],
  );
}

export function SessionProvider({ user, children }: { user: CurrentUser; children: ReactNode }) {
  const location = useLocation();
  const endSession = useEndSession();
  const [unsaved, setUnsavedMap] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [warningRemaining, setWarningRemaining] = useState<number | null>(null);

  const lastActivity = useRef(sessionStore.load()?.lastActiveAt ?? Date.now());
  const warningOpen = useRef(false);

  const continueSession = useCallback(() => {
    const now = Date.now();
    lastActivity.current = now;
    sessionStore.touch(now);
    warningOpen.current = false;
    setWarningRemaining(null);
  }, []);

  // Theo dõi thao tác và đếm thời gian không thao tác.
  useEffect(() => {
    let lastPersist = 0;
    function onActivity() {
      // Khi đang cảnh báo, người dùng phải chọn "Tiếp tục làm việc" để gia hạn.
      if (warningOpen.current) return;
      const now = Date.now();
      lastActivity.current = now;
      if (now - lastPersist > PERSIST_INTERVAL_MS) {
        lastPersist = now;
        sessionStore.touch(now);
      }
    }
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, onActivity, { passive: true }));

    const timer = window.setInterval(() => {
      const remaining = lastActivity.current + SESSION_IDLE_MS - Date.now();
      if (remaining <= 0) {
        endSession('expired');
      } else if (remaining <= SESSION_WARNING_MS) {
        warningOpen.current = true;
        setWarningRemaining(remaining);
      }
    }, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, onActivity));
      window.clearInterval(timer);
    };
  }, [endSession]);

  // A3: kiểm tra phiên ở mỗi lần chuyển trang và khi quay lại tab.
  const verifySession = useCallback(() => {
    const check = authApi.checkSession(user.id, user.signedInAt);
    if (check.status !== 'active') endSession(check.status);
  }, [endSession, user.id, user.signedInAt]);

  useEffect(() => {
    verifySession();
  }, [location.pathname, verifySession]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') verifySession();
    }
    window.addEventListener('focus', verifySession);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', verifySession);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [verifySession]);

  // Trình duyệt cũng hỏi lại khi đóng tab/tải lại trang lúc còn dữ liệu chưa lưu.
  const hasUnsaved = Object.keys(unsaved).length > 0;
  useEffect(() => {
    if (!hasUnsaved) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsaved]);

  const setUnsaved = useCallback((id: string, description: string | null) => {
    setUnsavedMap((current) => {
      if ((current[id] ?? null) === description) return current;
      const next = { ...current };
      if (description) next[id] = description;
      else delete next[id];
      return next;
    });
  }, []);

  const requestLogout = useCallback(() => {
    if (hasUnsaved) setConfirmOpen(true);
    else endSession('logout');
  }, [endSession, hasUnsaved]);

  const value = useMemo(() => ({ requestLogout, endSession, setUnsaved }), [requestLogout, endSession, setUnsaved]);
  const idleMinutes = Math.round(SESSION_IDLE_MS / 60000);

  return (
    <SessionContext.Provider value={value}>
      {children}

      {confirmOpen && (
        <Dialog
          title="Đăng xuất khỏi hệ thống?"
          icon="logout"
          width={500}
          initialFocus="first"
          onClose={() => setConfirmOpen(false)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
                Ở lại
              </Button>
              <Button variant="danger" onClick={() => endSession('logout')}>
                Đăng xuất
              </Button>
            </>
          }
        >
          <p className="dialog__body">Dữ liệu chưa được lưu sẽ bị mất. Bạn có chắc muốn đăng xuất?</p>
          {Object.entries(unsaved).map(([id, description]) => (
            <p key={id} className="session-unsaved">
              <Icon name="file" />
              Đang soạn: {description} (chưa lưu)
            </p>
          ))}
        </Dialog>
      )}

      {warningRemaining !== null && (
        <Dialog
          title="Phiên làm việc sắp hết hạn"
          icon="clock"
          onClose={continueSession}
          actions={
            <>
              <Button variant="secondary" onClick={() => endSession('logout')}>
                Đăng xuất
              </Button>
              <Button onClick={continueSession}>Tiếp tục làm việc</Button>
            </>
          }
        >
          <p className="dialog__body">
            Bạn đã không thao tác gần {idleMinutes} phút. Phiên sẽ tự kết thúc để bảo vệ dữ liệu; dữ liệu chưa lưu có
            thể bị mất.
          </p>
          <div className="session-timer" role="timer">
            <p className="session-timer__value">{formatCountdown(warningRemaining)}</p>
            <p className="session-timer__label">thời gian còn lại</p>
          </div>
        </Dialog>
      )}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession phải dùng bên trong SessionProvider');
  return context;
}

/**
 * Biểu mẫu gọi hook này khi đang có thay đổi chưa lưu, ví dụ
 * `useUnsavedChanges(dirty ? 'Tạo khách hàng – Công ty TNHH Minh Phát' : null)`.
 */
export function useUnsavedChanges(description: string | null) {
  const context = useContext(SessionContext);
  const id = useId();
  useEffect(() => {
    context?.setUnsaved(id, description);
    return () => context?.setUnsaved(id, null);
  }, [context, id, description]);
}
