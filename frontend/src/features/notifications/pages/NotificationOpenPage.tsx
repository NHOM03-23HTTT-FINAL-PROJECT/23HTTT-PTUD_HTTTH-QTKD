import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { ButtonLink } from '@/components/button/Button';
import { ROUTES } from '@/constants/routes';
import { Alert } from '@/components/feedback/Alert';
import { ApiError } from '@/lib/http/client';
import { notificationsApi } from '../api/notificationsApi';
import { useNotifications } from '../hooks/useNotifications';
import { useOpenNotification } from '../hooks/useOpenNotification';
import type { NotificationItem } from '../types/notification';
import '../components/Notifications.css';

type State =
  | { kind: 'opening' }
  | { kind: 'shown'; item: NotificationItem; message?: string }
  | { kind: 'error'; message: string };

/**
 * UC-CHUNG-05 A4 · Đường dẫn trong email `/thong-bao/:id`. Chưa đăng nhập thì RequireAuth chuyển sang đăng nhập
 * kèm đường dẫn này; sau đó tiếp tục từ bước 5 với đúng thông báo (BE chỉ trả thông báo của chính người nhận).
 */
export function NotificationOpenPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const { refresh } = useNotifications();
  const open = useOpenNotification();
  const [state, setState] = useState<State>({ kind: 'opening' });

  useEffect(() => {
    if (!user) return;
    let active = true;
    setState({ kind: 'opening' });
    notificationsApi
      .markRead(user.id, id)
      .then(async (item) => {
        refresh();
        if (!active) return;
        const result = await open(item, { replace: true });
        if (!active || result.kind === 'navigated') return;
        setState({ kind: 'shown', item: result.item, message: result.kind === 'blocked' ? result.message : undefined });
      })
      .catch((error) => {
        if (!active) return;
        setState({
          kind: 'error',
          message: error instanceof ApiError && error.status === 404
            ? 'Không tìm thấy thông báo này trong hộp thư của bạn.'
            : 'Không mở được thông báo. Hãy thử lại từ danh sách thông báo.',
        });
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id]);

  return (
    <div className="notification-open">
      <div className="page-header">
        <div className="page-header__title">
          <h1>Thông báo</h1>
        </div>
        <div className="page-header__actions">
          <ButtonLink to={ROUTES.notifications} variant="secondary">Xem tất cả thông báo</ButtonLink>
        </div>
      </div>
      {state.kind === 'opening' && <p className="notification-inbox__state">Đang mở thông báo…</p>}
      {state.kind === 'error' && <Alert tone="danger" title={state.message} />}
      {state.kind === 'shown' && (
        <>
          {state.message && <Alert tone="warning" title={state.message} />}
          <p className="notification-open__content">{state.item.content}</p>
        </>
      )}
    </div>
  );
}
