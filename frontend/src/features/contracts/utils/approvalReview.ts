import { ApiError } from '@/lib/http/client';
import { BOARD_ROLES, LEGAL_ROLES } from '@/constants/roles';
import type { CurrentUser } from '@/app/providers/AuthProvider';
import type { ReviewDocument } from '../api/approvalApi';
import type { ApprovalStepKey, Contract } from '../types/contract';
import { latestRound, STEP_LABELS } from './contractStatus';

export function approvalStepFor(user: Pick<CurrentUser, 'roles'>): ApprovalStepKey | undefined {
  if (user.roles.includes('TP_KD')) return 'sales';
  if (user.roles.some(r => LEGAL_ROLES.includes(r))) return 'legal';
  if (user.roles.some(r => BOARD_ROLES.includes(r))) return 'board';
  return undefined;
}
export const approvalPermission = (step: ApprovalStepKey) => step === 'legal' ? 'approvals.review-legal' : 'approvals.approve';

export function approvalError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Chưa nhận được kết quả. Tải lại hồ sơ để kiểm tra trước khi gửi lại; nội dung nhận xét vẫn được giữ.';
  if (error.status === 403) return 'Bạn không có quyền hoặc không còn là người được giao xử lý. Hãy tải lại hồ sơ để kiểm tra phân công.';
  if (error.status === 409) return 'Lượt duyệt, bước xử lý hoặc phiên bản đã thay đổi. Hãy tải lại hồ sơ trước khi quyết định.';
  if (error.status === 400 || error.status === 422) return 'Kiểm tra nội dung nhận xét và thông tin lượt duyệt trước khi gửi.';
  if (error.status === 404) return 'Không tìm thấy hồ sơ hoặc lượt duyệt.';
  return 'Không thể xử lý yêu cầu. Hãy tải lại để kiểm tra kết quả trước khi gửi lại.';
}

export type ApprovalView = { kind: 'info' | 'accept' | 'decide' | 'stale'; message: string };
/** Display guards only. The BE revalidates the snapshot and authority inside the workflow transaction. */
export function approvalView(contract: Contract, user: Pick<CurrentUser, 'id' | 'roles' | 'permissions'>, doc?: ReviewDocument | null): ApprovalView {
  const role = approvalStepFor(user);
  const round = latestRound(contract);
  if (!role) return { kind: 'info', message: 'Theo dõi người đang xử lý tại mục Tiến độ phê duyệt.' };
  if (!user.permissions.has(approvalPermission(role))) return { kind: 'info', message: 'Bạn có quyền xem hồ sơ nhưng chưa có quyền quyết định tại bước này.' };
  if (!round) return { kind: 'info', message: 'Hồ sơ chưa được trình duyệt. Các thao tác rà soát sẽ xuất hiện sau khi trình hợp lệ.' };
  if (round.result !== 'in-progress') return { kind: 'info', message: 'Lượt duyệt này đã kết thúc. Không thể tiếp nhận hoặc ghi nhận thêm quyết định trên lượt cũ.' };
  const own = round.steps.find(s => s.key === role);
  const active = round.steps.find(s => ['pending-accept', 'reviewing', 'unassigned'].includes(s.state));
  if (own?.assigneeId !== user.id) {
    if (own?.state === 'done' || own?.state === 'stopped') return { kind: 'info', message: `Bước ${STEP_LABELS[role]} đã có kết quả.${active ? ` Hồ sơ đang ở bước ${STEP_LABELS[active.key]}.` : ''}` };
    if (!own?.assigneeId) return { kind: 'info', message: own?.state === 'waiting'
      ? `Chưa đến lượt ${STEP_LABELS[role]}. Trưởng bộ phận chỉ phân công khi các bước trước đã chấp thuận.`
      : `Bước ${STEP_LABELS[role]} đang chờ phân công người xử lý. Trưởng bộ phận thực hiện tại Phân công người duyệt.` };
    return { kind: 'info', message: `Bước ${STEP_LABELS[role]} được giao cho ${own.assigneeName ?? 'người khác'}. Bạn chỉ xem được hồ sơ, không thể quyết định thay.` };
  }
  if (!doc) return { kind: 'info', message: 'Đang kiểm tra lượt duyệt và quyền xử lý…' };
  if (doc.id !== contract.id || doc.version !== contract.version || doc.submittedVersion !== contract.version
    || doc.roundNo !== round.no || (round.id && doc.roundId !== round.id)) return { kind: 'stale', message: 'Nội dung đang xem không khớp lượt hoặc phiên bản hiện tại. Hãy tải lại hồ sơ và rà soát bản mới trước khi quyết định.' };
  if (doc.roundResult !== 'in-progress') return { kind: 'info', message: 'Lượt duyệt đã kết thúc. Kết quả đã lưu được giữ nguyên.' };
  const step = doc.steps.find(s => s.key === role);
  if (!step || step.assigneeId !== user.id) return { kind: 'info', message: 'Bạn không còn là người được giao xử lý tại bước này. Hãy tải lại hồ sơ.' };
  const previous = doc.steps.filter(s => s.order < step.order);
  if (previous.some(s => s.state !== 'done' || s.decision !== 'approve' || s.reviewedVersion !== doc.submittedVersion))
    return { kind: 'info', message: `Chưa đến lượt ${STEP_LABELS[role]}. Các bước trước phải chấp thuận trên cùng phiên bản và bàn giao hợp lệ.` };
  if (step.state === 'pending-accept' && (role === 'sales' ? doc.status === 'submitted' : doc.status === 'under-review'))
    return { kind: 'accept', message: 'Hồ sơ đã đến lượt và được giao cho bạn. Tiếp nhận để bắt đầu xem xét nội dung.' };
  if (step.state === 'reviewing' && doc.status === 'under-review') return { kind: 'decide', message: 'Kiểm tra nội dung và tài liệu của đúng phiên bản đang trình trước khi ghi nhận quyết định.' };
  if (step.state === 'done') {
    const next = doc.steps.find(s => s.order > step.order && ['pending-accept', 'reviewing', 'unassigned', 'waiting'].includes(s.state));
    return { kind: 'info', message: `Kết quả của bạn đã được lưu.${next ? ` Bước ${STEP_LABELS[next.key]} ${next.state === 'unassigned' ? 'đang chờ phân công người xử lý' : 'sẽ tiếp tục theo quy trình'}.` : ''}` };
  }
  return { kind: 'info', message: `Hồ sơ chưa được bàn giao đến ${STEP_LABELS[role]}. Bước trước cần hoàn tất việc chuyển hồ sơ trước khi bạn xử lý.` };
}
