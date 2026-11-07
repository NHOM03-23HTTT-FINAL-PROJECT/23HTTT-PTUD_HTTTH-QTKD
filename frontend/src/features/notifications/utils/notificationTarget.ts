import type { CurrentUser } from '@/app/providers/AuthProvider';
import { BOARD_ROLES, LEGAL_ROLES } from '@/constants/roles';
import { ROUTES } from '@/constants/routes';
import { approvalApi, approvalReviewPath } from '@/features/contracts/api/approvalApi';
import type { ApprovalStepKey } from '@/features/contracts/types/contract';
import type { NotificationItem, NotificationKind, NotificationRecordType } from '../types/notification';

export const KIND_LABELS: Record<NotificationKind, string> = {
  General: 'Thông báo chung',
  ReviewAssigned: 'Được phân công',
  ReviewAssignmentRequired: 'Hồ sơ chờ phân công',
  AssignmentRevoked: 'Thay đổi phân công',
  ReviewRequired: 'Hồ sơ cần xử lý',
  ApprovalResult: 'Kết quả duyệt',
  RevisionRequested: 'Yêu cầu chỉnh sửa',
};

export const RECORD_LABELS: Record<NotificationRecordType, string> = {
  Contract: 'Hợp đồng',
  PaymentStatement: 'Bảng thanh toán',
  Customer: 'Khách hàng',
  Area: 'Khu vực',
  PriceList: 'Bảng giá',
  VolumePeriod: 'Kỳ sản lượng',
  UserAccount: 'Tài khoản',
};

/** Bước duyệt hợp đồng của vai trò người dùng; BE vẫn kiểm tra assignee và phạm vi khi đọc hồ sơ. */
function approvalStep(user: CurrentUser): ApprovalStepKey | null {
  const role = user.primaryRole.code;
  if (role === 'TP_KD') return 'sales';
  if (LEGAL_ROLES.includes(role)) return 'legal';
  if (BOARD_ROLES.includes(role)) return 'board';
  return null;
}

/**
 * Màn hình mở khi chọn thông báo (UC-CHUNG-05 bước 6–7).
 * - `verify` kiểm tra quyền và hồ sơ còn tồn tại trước khi chuyển màn (E1/E2); ném ApiError 403/404.
 * - null: không có màn xử lý phù hợp (A5 hoặc hồ sơ chưa có màn API) → ở lại danh sách và hiện toàn văn.
 * Màn đích tự quyết định thao tác theo trạng thái mới nhất, nên bước đã kết thúc chỉ còn chế độ xem (E3).
 */
export function notificationTarget(
  item: NotificationItem,
  user: CurrentUser,
  mock: boolean,
): { path: string; verify?: () => Promise<unknown> } | null {
  if (item.recordType !== 'Contract' || item.kind === 'AssignmentRevoked') return null;
  if (item.kind === 'ReviewAssignmentRequired') return user.permissions.has('approvals.assign') ? { path: ROUTES.approvalAssignments } : null;
  if (mock) return user.permissions.has('contracts.view') ? { path: ROUTES.contractDetail(item.recordId) } : null;
  const step = approvalStep(user);
  if (!step) return null;
  return { path: approvalReviewPath(item.recordId, step), verify: () => approvalApi.read(item.recordId, step) };
}
