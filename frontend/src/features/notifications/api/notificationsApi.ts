import { IS_MOCK_AUTH } from '@/features/auth/api/authApi';
import { apiRequest } from '@/lib/http/client';
import {
  mockListNotifications,
  mockMarkAllNotificationsRead,
  mockMarkNotificationRead,
  mockUnreadNotificationCount,
} from '@/mocks/notificationsServer';
import type { NotificationItem, NotificationPage, NotificationQuery } from '../types/notification';

/**
 * UC-CHUNG-05 · Hộp thư thông báo. Người nhận luôn lấy từ JWT/phiên ở BE, không gửi trong request.
 * Chế độ prototype dùng mock trong bộ nhớ với cùng chữ ký.
 */
export const notificationsApi = IS_MOCK_AUTH
  ? {
      list: (userId: string, query: NotificationQuery) => mockListNotifications(userId, query),
      unreadCount: (userId: string) => mockUnreadNotificationCount(userId),
      markRead: (userId: string, id: string) => mockMarkNotificationRead(userId, id),
      markAllRead: (userId: string) => mockMarkAllNotificationsRead(userId),
    }
  : {
      list: (_userId: string, { filter, page, pageSize }: NotificationQuery) =>
        apiRequest<NotificationPage>(`/notifications?filter=${filter}&page=${page}&pageSize=${pageSize}`),
      unreadCount: (_userId: string) =>
        apiRequest<{ count: number }>('/notifications/unread-count').then((r) => r.count),
      markRead: (_userId: string, id: string) =>
        apiRequest<NotificationItem>(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST', body: '{}' }),
      markAllRead: (_userId: string) =>
        apiRequest<{ updated: number }>('/notifications/read-all', { method: 'POST', body: '{}' }).then((r) => r.updated),
    };
