import type { BadgeTone } from '@/components/status-badge/StatusBadge';
import type {
  ApprovalAction,
  ApprovalDecision,
  ApprovalRound,
  ApprovalRoundResult,
  ApprovalStep,
  ApprovalStepKey,
  ApprovalStepState,
  Contract,
  ContractStatus,
} from '../types/contract';

export const CONTRACT_STATUS_BADGE: Record<ContractStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Nháp', tone: 'neutral' },
  submitted: { label: 'Đã trình', tone: 'info' },
  'under-review': { label: 'Đang rà soát', tone: 'accent' },
  'revision-requested': { label: 'Yêu cầu chỉnh sửa', tone: 'warning' },
  rejected: { label: 'Bị từ chối', tone: 'danger' },
  approved: { label: 'Đã duyệt', tone: 'success' },
  cancelled: { label: 'Đã hủy', tone: 'neutral' },
};

export const CONTRACT_STATUS_OPTIONS = (Object.keys(CONTRACT_STATUS_BADGE) as ContractStatus[]).map((value) => ({
  value,
  label: CONTRACT_STATUS_BADGE[value].label,
}));

export const STEP_LABELS: Record<ApprovalStepKey, string> = {
  sales: 'Trưởng phòng Kinh doanh',
  legal: 'Pháp chế',
  board: 'Ban Giám đốc',
};

export const STEP_ORDER: ApprovalStepKey[] = ['sales', 'legal', 'board'];

export const STEP_STATE_BADGE: Record<ApprovalStepState, { label: string; tone: BadgeTone }> = {
  waiting: { label: 'Chưa đến lượt', tone: 'neutral' },
  'pending-accept': { label: 'Chờ tiếp nhận', tone: 'info' },
  reviewing: { label: 'Đang xử lý', tone: 'accent' },
  unassigned: { label: 'Đang chờ phân công', tone: 'warning' },
  done: { label: 'Đã hoàn thành', tone: 'success' },
  stopped: { label: 'Đã dừng lượt', tone: 'danger' },
  skipped: { label: 'Không thực hiện', tone: 'neutral' },
};

export const ROUND_RESULT_BADGE: Record<ApprovalRoundResult, { label: string; tone: BadgeTone }> = {
  'in-progress': { label: 'Đang xử lý', tone: 'accent' },
  completed: { label: 'Hoàn tất', tone: 'success' },
  revision: { label: 'Yêu cầu chỉnh sửa', tone: 'warning' },
  rejected: { label: 'Bị từ chối', tone: 'danger' },
  withdrawn: { label: 'Đã rút', tone: 'neutral' },
};

export const DECISION_LABELS: Record<ApprovalDecision, string> = {
  approve: 'Chấp thuận',
  revision: 'Yêu cầu chỉnh sửa',
  reject: 'Từ chối',
};

export const ACTION_LABELS: Record<ApprovalAction, string> = {
  submit: 'Trình duyệt',
  accept: 'Tiếp nhận rà soát',
  approve: 'Chấp thuận',
  'handoff-legal': 'Gửi hồ sơ sang Pháp chế',
  'handoff-board': 'Trình Ban Giám đốc',
  assign: 'Phân công người được giao',
  'request-revision': 'Yêu cầu chỉnh sửa',
  reject: 'Từ chối',
  withdraw: 'Rút hồ sơ',
  coordinate: 'Yêu cầu phối hợp phòng ban',
  'coordination-reply': 'Ghi nhận phản hồi phối hợp',
};

/** Trạng thái người phụ trách còn được sửa và trình (CTR-01). */
export const EDITABLE_STATUSES: ContractStatus[] = ['draft', 'revision-requested'];

export function latestRound(contract: Contract): ApprovalRound | undefined {
  return contract.rounds[contract.rounds.length - 1];
}

/** Bước đang giữ hồ sơ trong lượt đang chạy; không có khi lượt đã kết thúc. */
export function activeStep(round?: ApprovalRound): ApprovalStep | undefined {
  if (!round || round.result !== 'in-progress') return undefined;
  return round.steps.find((step) => step.state === 'pending-accept' || step.state === 'reviewing' || step.state === 'unassigned');
}

/** Nhãn ngắn hiển thị cạnh trạng thái trong danh sách, ví dụ "Pháp chế". */
export function stepLabelOf(contract: Contract): string | undefined {
  return activeStep(latestRound(contract))?.label;
}

export function contractAreaCodes(contract: Pick<Contract, 'services'>): string[] {
  return [...new Set(contract.services.map((item) => item.areaCode).filter(Boolean))];
}
