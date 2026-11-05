import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { IS_MOCK_AUTH } from '@/features/auth/api/authApi';
import { ApiError } from '@/lib/http/client';
import { notificationsApi } from '../api/notificationsApi';
import type { NotificationItem } from '../types/notification';
import { notificationTarget } from '../utils/notificationTarget';
import { useNotifications } from './useNotifications';

/** Kết quả mở một thông báo khi người dùng vẫn ở lại danh sách. */
export type OpenResult =
  | { kind: 'navigated' }
  /** A5 hoặc chưa có màn xử lý: hiện toàn văn tại chỗ. */
  | { kind: 'inline'; item: NotificationItem }
  /** E1 / E2 / lỗi mở hồ sơ: hiện thông điệp, quay lại danh sách. */
  | { kind: 'blocked'; item: NotificationItem; message: string };

export const OPEN_MESSAGES = {
  forbidden: 'Bạn không có quyền truy cập nội dung này',
  unavailable: 'Hồ sơ không còn khả dụng',
  failed: 'Không mở được hồ sơ. Hãy thử lại.',
} as const;

/**
 * UC-CHUNG-05 bước 5–7: đánh dấu đã đọc, kiểm tra hồ sơ, mở màn hình phù hợp.
 * E5: đánh dấu lỗi thì vẫn mở hồ sơ; thông báo giữ "Chưa đọc" và được đánh dấu lại ở lần mở sau.
 */
export function useOpenNotification() {
  const { user } = useAuth();
  const { refresh } = useNotifications();
  const navigate = useNavigate();

  return async function open(item: NotificationItem, options: { replace?: boolean; beforeNavigate?: () => void } = {}): Promise<OpenResult> {
    if (!user) return { kind: 'inline', item };
    let current = item;
    if (!item.isRead) {
      try {
        current = await notificationsApi.markRead(user.id, item.id);
        refresh();
      } catch {
        current = item;
      }
    }

    const target = notificationTarget(current, user, IS_MOCK_AUTH);
    if (!target) return { kind: 'inline', item: current };
    if (target.verify) {
      try {
        await target.verify();
      } catch (error) {
        const message = error instanceof ApiError && error.status === 403 ? OPEN_MESSAGES.forbidden
          : error instanceof ApiError && error.status === 404 ? OPEN_MESSAGES.unavailable
          : OPEN_MESSAGES.failed;
        return { kind: 'blocked', item: current, message };
      }
    }
    options.beforeNavigate?.();
    navigate(target.path, { replace: options.replace });
    return { kind: 'navigated' };
  };
}
