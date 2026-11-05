import type { NotificationItem, NotificationPage, NotificationQuery } from '@/features/notifications/types/notification';
import { ApiError } from '@/lib/http/client';

/*
 * Hộp thư thông báo giả lập cho chế độ prototype. Lưu trong bộ nhớ theo người dùng; tải lại trang thì về dữ liệu mẫu.
 * recordId là mã hợp đồng mock (HD-2026-xxx) để mở màn chi tiết hợp đồng mock.
 */
const LATENCY_MS = 250;
const delay = () => new Promise((resolve) => window.setTimeout(resolve, LATENCY_MS));

const SEED: Omit<NotificationItem, 'id' | 'createdAt'>[] = [
  { kind: 'ReviewRequired', recordType: 'Contract', recordId: 'HD-2026-016', recordTitle: 'Hợp đồng lưu kho lạnh 2026–2027',
    content: 'Hồ sơ Hợp đồng lưu kho lạnh 2026–2027: under-review. ', isRead: false },
  { kind: 'RevisionRequested', recordType: 'Contract', recordId: 'HD-2026-014', recordTitle: 'Hợp đồng lưu kho và bốc xếp hàng tiêu dùng',
    content: 'Hồ sơ Hợp đồng lưu kho và bốc xếp hàng tiêu dùng: revision-requested. Bổ sung phụ lục giá bốc xếp.', isRead: false },
  { kind: 'ReviewAssigned', recordType: 'Contract', recordId: 'HD-2026-013', recordTitle: 'Hợp đồng dịch vụ kho bãi và bốc xếp 2026–2027',
    content: 'Bạn được phân công rà soát hồ sơ Hợp đồng dịch vụ kho bãi và bốc xếp 2026–2027.', isRead: false },
  { kind: 'General', recordType: 'Contract', recordId: 'HD-2026-012', recordTitle: 'Hợp đồng vận hành thiết bị nâng',
    content: 'Hợp đồng Demo chờ rà soát; dữ liệu thử nghiệm.', isRead: true },
];

const boxes = new Map<string, NotificationItem[]>();

function box(userId: string): NotificationItem[] {
  let items = boxes.get(userId);
  if (!items) {
    const now = Date.now();
    items = SEED.map((item, index) => ({
      ...item,
      id: `${userId}-n${index + 1}`,
      createdAt: new Date(now - (index + 1) * 47 * 60_000).toISOString(),
    }));
    boxes.set(userId, items);
  }
  return items;
}

export async function mockListNotifications(userId: string, { filter, page, pageSize }: NotificationQuery): Promise<NotificationPage> {
  await delay();
  const all = box(userId);
  const matching = filter === 'unread' ? all.filter((n) => !n.isRead) : all;
  return {
    items: matching.slice((page - 1) * pageSize, page * pageSize).map((n) => ({ ...n })),
    total: matching.length,
    unreadCount: all.filter((n) => !n.isRead).length,
    page,
    pageSize,
  };
}

export async function mockUnreadNotificationCount(userId: string): Promise<number> {
  await delay();
  return box(userId).filter((n) => !n.isRead).length;
}

export async function mockMarkNotificationRead(userId: string, id: string): Promise<NotificationItem> {
  await delay();
  const item = box(userId).find((n) => n.id === id);
  if (!item) throw new ApiError(404, 'NOT_FOUND');
  item.isRead = true;
  return { ...item };
}

export async function mockMarkAllNotificationsRead(userId: string): Promise<number> {
  await delay();
  const unread = box(userId).filter((n) => !n.isRead);
  unread.forEach((n) => { n.isRead = true; });
  return unread.length;
}
