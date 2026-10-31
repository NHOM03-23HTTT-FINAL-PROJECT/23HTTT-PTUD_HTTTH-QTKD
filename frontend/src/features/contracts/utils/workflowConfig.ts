import type {
  ParticipantMode,
  WorkflowDocType,
  WorkflowDraft,
  WorkflowErrors,
  WorkflowPerson,
  WorkflowStage,
  WorkflowStageKey,
} from '../types/workflowConfig';

export const DOC_TYPE_LABELS: Record<WorkflowDocType, string> = {
  contract: 'Hợp đồng',
  appendix: 'Phụ lục',
  'cancel-agreement': 'Thỏa thuận hủy',
  termination: 'Biên bản chấm dứt hợp đồng',
};

export const STAGE_LABELS: Record<WorkflowStageKey, string> = {
  draft: 'Lập & trình hồ sơ',
  sales: 'Rà soát kinh doanh',
  'dept-confirm': 'Xác nhận bộ phận liên quan',
  legal: 'Rà soát pháp lý',
  board: 'Phê duyệt',
  signing: 'Ký kết',
};

export const MODE_LABELS: Record<ParticipantMode, string> = {
  'role-department': 'Theo vai trò và phòng ban',
  specific: 'Chỉ định người cụ thể',
  rotation: 'Danh sách luân phiên',
};

/** Phạm vi áp dụng (phòng ban lập hồ sơ). */
export const WORKFLOW_SCOPES = ['Phòng Kinh doanh 1', 'Phòng Kinh doanh 2'];

export const CONFIRM_DEPARTMENTS = ['Phòng Khai thác', 'Phòng Kế toán'];

const APPROVAL_STAGES: WorkflowStageKey[] = ['sales', 'dept-confirm', 'legal', 'board'];

export function defaultStages(docType: WorkflowDocType | ''): WorkflowStage[] {
  const stage = (key: WorkflowStageKey, role: string, mode: ParticipantMode, enabled = true): WorkflowStage => ({
    key, enabled, role, mode, participants: [], backups: [], notify: [],
  });
  return [
    stage('draft', 'Nhân viên Kinh doanh', 'role-department'),
    stage('sales', 'Trưởng phòng Kinh doanh', 'specific'),
    ...(docType === 'appendix' ? [{ ...stage('dept-confirm', 'Trưởng bộ phận liên quan', 'specific', false), condition: '', confirmDepartment: '' }] : []),
    stage('legal', 'Nhân viên Pháp chế', 'rotation'),
    stage('board', 'Thành viên Ban Giám đốc', 'specific'),
    stage('signing', 'Người ký đại diện công ty', 'specific'),
  ];
}

export function emptyWorkflowDraft(): WorkflowDraft {
  return { name: '', docType: '', scope: '', stages: defaultStages('') };
}

/**
 * E2: mỗi giai đoạn bật phải xác định được ít nhất một người còn hoạt động, một người không vừa lập vừa duyệt,
 * người ký đại diện phải có thẩm quyền ký. Lỗi được chỉ ra tại từng giai đoạn.
 */
export function validateWorkflowDraft(draft: WorkflowDraft, people: WorkflowPerson[]): WorkflowErrors {
  const errors: WorkflowErrors = {};
  const byId = new Map(people.map((person) => [person.id, person]));
  if (!draft.name.trim()) errors.name = 'Nhập tên cấu hình.';
  if (!draft.docType) errors.docType = 'Chọn loại hồ sơ.';
  if (!draft.scope) errors.scope = 'Chọn phạm vi áp dụng.';
  const stageErrors: NonNullable<WorkflowErrors['stages']> = {};
  const drafters = new Set(draft.stages.find((stage) => stage.key === 'draft')?.participants ?? []);
  for (const stage of draft.stages) {
    if (!stage.enabled) continue;
    const chosen = stage.participants.map((id) => byId.get(id)).filter(Boolean) as WorkflowPerson[];
    if (stage.key === 'dept-confirm' && (!stage.condition?.trim() || !stage.confirmDepartment)) {
      stageErrors[stage.key] = 'Nhập điều kiện áp dụng và chọn bộ phận xác nhận.';
    } else if (chosen.length === 0) {
      stageErrors[stage.key] = 'Giai đoạn chưa có người tham gia.';
    } else if (chosen.some((person) => !person.active)) {
      const names = chosen.filter((person) => !person.active).map((person) => person.name).join(', ');
      stageErrors[stage.key] = `${names} đã bị vô hiệu hóa. Chọn người khác.`;
    } else if (stage.key === 'signing' && chosen.some((person) => !person.canSign)) {
      stageErrors[stage.key] = 'Người ký đại diện không có thẩm quyền ký.';
    } else if (APPROVAL_STAGES.includes(stage.key) && chosen.some((person) => drafters.has(person.id))) {
      stageErrors[stage.key] = 'Một người không được vừa lập vừa duyệt cùng một hồ sơ.';
    }
  }
  if (Object.keys(stageErrors).length > 0) errors.stages = stageErrors;
  return errors;
}

export function countWorkflowErrors(errors: WorkflowErrors): number {
  return ['name', 'docType', 'scope'].filter((key) => errors[key as keyof WorkflowErrors]).length + Object.keys(errors.stages ?? {}).length;
}

/** Giai đoạn khác phiên bản đang áp dụng – đánh dấu "Đã sửa" khi cập nhật (A1). */
export function stageChanged(current: WorkflowStage, saved?: WorkflowStage): boolean {
  return Boolean(saved) && JSON.stringify(current) !== JSON.stringify(saved);
}
