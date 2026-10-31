import type { SessionCheck } from '@/features/auth/types/auth';

/** Loại hồ sơ áp dụng cấu hình người tham gia (SYS-CTR-10 bước 3). */
export type WorkflowDocType = 'contract' | 'appendix' | 'cancel-agreement' | 'termination';

/**
 * 5 giai đoạn cố định theo thứ tự, cộng giai đoạn tùy chọn "Xác nhận bộ phận liên quan" cho phụ lục (A2).
 * Quản trị không thêm, xóa hoặc đảo thứ tự giai đoạn.
 */
export type WorkflowStageKey = 'draft' | 'sales' | 'dept-confirm' | 'legal' | 'board' | 'signing';

/** Cách xác định người: theo vai trò và phòng ban, chỉ định người cụ thể hoặc danh sách luân phiên. */
export type ParticipantMode = 'role-department' | 'specific' | 'rotation';

export type WorkflowStage = {
  key: WorkflowStageKey;
  /** Chỉ giai đoạn tùy chọn mới tắt được. */
  enabled: boolean;
  role: string;
  mode: ParticipantMode;
  /** Người tham gia; với Ký kết là người ký đại diện công ty. */
  participants: string[];
  /** Người dự phòng hoặc được ủy quyền (Ký kết: người được ủy quyền ký). */
  backups: string[];
  /** Người nhận thông báo (Ký kết: người theo dõi ký). */
  notify: string[];
  /** Điều kiện áp dụng và bộ phận xác nhận – chỉ dùng cho giai đoạn tùy chọn của phụ lục. */
  condition?: string;
  confirmDepartment?: string;
};

export type WorkflowVersion = {
  version: number;
  activatedAt: string;
  activatedByName: string;
  summary: string;
  stages: WorkflowStage[];
};

export type WorkflowConfig = {
  code: string;
  name: string;
  docType: WorkflowDocType;
  scope: string;
  version: number;
  activatedAt: string;
  activatedByName: string;
  stages: WorkflowStage[];
  history: WorkflowVersion[];
};

/** Một dòng trong danh sách "Cấu hình người tham gia": loại hồ sơ + phạm vi, có thể chưa cấu hình. */
export type WorkflowConfigRow = { docType: WorkflowDocType; scope: string; config?: WorkflowConfig };

export type WorkflowDraft = {
  name: string;
  docType: WorkflowDocType | '';
  scope: string;
  stages: WorkflowStage[];
};

/** Người trong danh mục người dùng (kèm thẩm quyền ký) để chọn vào từng giai đoạn. */
export type WorkflowPerson = {
  id: string;
  name: string;
  title: string;
  department: string;
  active: boolean;
  canSign: boolean;
};

export type WorkflowStageErrors = Partial<Record<WorkflowStageKey, string>>;
export type WorkflowErrors = { name?: string; docType?: string; scope?: string; stages?: WorkflowStageErrors };

export type WorkflowErrorCode =
  | 'VALIDATION'
  | 'DUPLICATE_SCOPE'
  | 'CONFLICT'
  | 'SAVE_FAILED'
  | 'FORBIDDEN'
  | 'SESSION_ENDED'
  | 'NETWORK';

export class WorkflowConfigError extends Error {
  readonly code: WorkflowErrorCode;
  readonly errors?: WorkflowErrors;
  readonly sessionStatus?: Exclude<SessionCheck['status'], 'active'>;

  constructor(code: WorkflowErrorCode, extra: Pick<WorkflowConfigError, 'errors' | 'sessionStatus'> = {}) {
    super(code);
    this.name = 'WorkflowConfigError';
    this.code = code;
    this.errors = extra.errors;
    this.sessionStatus = extra.sessionStatus;
  }
}

export type ActivateWorkflowRequest = {
  userId: string;
  signedInAt: string;
  idempotencyKey: string;
  /** Mã cấu hình khi cập nhật (A1); trống khi tạo mới. */
  code?: string;
  /** Phiên bản đang áp dụng lúc mở biểu mẫu – phát hiện thay đổi đồng thời (E4). */
  baseVersion?: number;
  /** Xác nhận thay thế phiên bản đang áp dụng của cùng loại hồ sơ + phạm vi (E3). */
  replaceExisting?: boolean;
  draft: WorkflowDraft;
};

export type ActivateWorkflowResult = { config: WorkflowConfig; replayed: boolean };
