import type { UploadedFile } from '@/components/file-upload/FileUploadField';
import type { SessionCheck } from '@/features/auth/types/auth';

export type ContractSourceMode = 'template' | 'blank';

export type ContractServiceItem = {
  id: string;
  serviceCode: string;
  serviceName: string;
  unit: string;
  requiresArea: boolean;
  areaCode: string;
};

/** Dữ liệu người dùng nhập trong SYS-CTR-01; giá trị hợp đồng giữ dạng chuỗi để báo lỗi đúng dữ liệu gốc. */
export type ContractDraft = {
  customerCode: string;
  sourceMode: ContractSourceMode;
  templateCode: string;
  title: string;
  contractType: string;
  effectiveFrom: string;
  effectiveTo: string;
  value: string;
  paymentTerm: string;
  services: ContractServiceItem[];
  content: string;
};

export type ContractFieldErrors = Partial<Record<Exclude<keyof ContractDraft, 'services'>, string>> & {
  services?: string;
  serviceAreas?: Record<string, string>;
};

/** Trạng thái hồ sơ theo đặc tả SYS-CTR-01 → 11; MVP1 kết thúc ở Đã duyệt (BUSINESS-RULES CTR-05). */
export type ContractStatus =
  | 'draft'
  | 'submitted'
  | 'under-review'
  | 'revision-requested'
  | 'rejected'
  | 'approved'
  | 'cancelled';

/** Tuyến duyệt hợp đồng: Trưởng phòng Kinh doanh → Pháp chế → Ban Giám đốc. */
export type ApprovalStepKey = 'sales' | 'legal' | 'board';

/**
 * Tình trạng một bước trong lượt (SYS-CTR-11 bước 5–7): Chờ tiếp nhận, Đang rà soát, Đang chờ phân công,
 * Đã hoàn thành, Chưa đến lượt hoặc Không thực hiện khi lượt đã dừng ở bước trước.
 */
export type ApprovalStepState = 'waiting' | 'pending-accept' | 'reviewing' | 'unassigned' | 'done' | 'stopped' | 'skipped';

export type ApprovalDecision = 'approve' | 'revision' | 'reject';

export type ApprovalRoundResult = 'in-progress' | 'completed' | 'revision' | 'rejected' | 'withdrawn';

export type ApprovalStep = {
  key: ApprovalStepKey;
  label: string;
  assigneeId?: string;
  assigneeName?: string;
  assignedAt?: string;
  acceptedAt?: string;
  state: ApprovalStepState;
  decision?: ApprovalDecision;
  decidedById?: string;
  decidedByName?: string;
  decidedAt?: string;
  comment?: string;
  /** Phiên bản hồ sơ được rà soát ở bước này. */
  reviewedVersion?: number;
};

export type ApprovalAction =
  | 'submit'
  | 'accept'
  | 'approve'
  | 'handoff-legal'
  | 'handoff-board'
  | 'assign'
  | 'request-revision'
  | 'reject'
  | 'withdraw'
  | 'coordinate'
  | 'coordination-reply';

export type ApprovalLogEntry = {
  at: string;
  stepKey: ApprovalStepKey;
  actorName: string;
  action: ApprovalAction;
  from: ContractStatus;
  to: ContractStatus;
  note?: string;
  version: number;
  /** Ý kiến nội bộ của Pháp chế khi phối hợp phòng ban; ẩn với người ngoài Pháp chế (SYS-CTR-11 A9). */
  internal?: boolean;
};

/** Yêu cầu phối hợp phòng ban chuyên môn trong bước Pháp chế (SYS-CTR-08 A1). */
export type LegalCoordination = {
  id: string;
  department: string;
  content: string;
  requestedByName: string;
  requestedAt: string;
  reply?: string;
  repliedByName?: string;
  repliedAt?: string;
};

export type ApprovalRound = {
  no: number;
  submittedById: string;
  submittedByName: string;
  submittedAt: string;
  contractVersion: number;
  configCode: string;
  configVersion: number;
  result: ApprovalRoundResult;
  endedAt?: string;
  steps: ApprovalStep[];
  log: ApprovalLogEntry[];
  coordinations: LegalCoordination[];
};

export type Contract = Omit<ContractDraft, 'value'> & {
  code: string;
  value: number;
  status: ContractStatus;
  customerName: string;
  ownerId: string;
  ownerName: string;
  /** Phòng ban quản lý hồ sơ – phạm vi xem của Trưởng phòng (SYS-CTR-02 A2). */
  departmentCode: string;
  createdAt: string;
  updatedAt: string;
  /** Phiên bản hồ sơ cho kiểm tra sửa đồng thời và đối chiếu bản được trình. */
  version: number;
  attachments: UploadedFile[];
  rounds: ApprovalRound[];
  /** Yêu cầu chỉnh sửa gần nhất (SYS-CTR-03 A3). */
  revisionRequest?: { stepLabel: string; byName: string; at: string; content: string };
  rejection?: { stepLabel: string; byName: string; at: string; reason: string };
  cancellation?: { byName: string; at: string; reason: string };
  /** Việc còn chờ xử lý lại sau khi kết quả đã lưu (thông báo hoặc chuyển ký kết lỗi tạm thời). */
  pendingTask?: string;
};

export type ContractListItem = Pick<
  Contract,
  'code' | 'title' | 'contractType' | 'customerCode' | 'customerName' | 'effectiveFrom' | 'effectiveTo' | 'status' | 'ownerName' | 'updatedAt'
> & { stepLabel?: string; areaCodes: string[] };

export type ContractScope = 'own' | 'department' | 'granted' | 'assigned';

export type ContractListQuery = {
  keyword: string;
  status: ContractStatus | '';
  areaCode: string;
  contractType: string;
  page: number;
  size: number;
};

export type ContractListResult = { items: ContractListItem[]; total: number; page: number; size: number; scope: ContractScope };

export type ApprovalInboxItem = ContractListItem & {
  value: number;
  submittedAt: string;
  previousStep?: string;
  assignedAt?: string;
  decidedAt?: string;
  decision?: ApprovalDecision;
};

export type ContractActionErrorCode =
  | 'VALIDATION'
  | 'FORBIDDEN'
  | 'NOT_OWNER'
  | 'NOT_ASSIGNEE'
  | 'STATUS'
  | 'NOT_FOUND'
  | 'LOAD_FAILED'
  | 'CONFLICT'
  | 'SAVE_FAILED'
  | 'NETWORK'
  | 'SESSION_ENDED'
  | 'MISSING'
  | 'AREA_INACTIVE'
  | 'NO_APPROVER'
  | 'STEP_NOT_READY'
  | 'STEP_DONE'
  | 'VERSION_MISMATCH';

/** Lỗi chung cho thao tác trên hồ sơ đã có mã (xem, sửa, trình, hủy, rà soát, phê duyệt). */
export class ContractActionError extends Error {
  readonly code: ContractActionErrorCode;
  readonly fieldErrors?: ContractFieldErrors;
  readonly sessionStatus?: Exclude<SessionCheck['status'], 'active'>;
  /** Trạng thái mới nhất của hồ sơ khi thao tác bị từ chối vì trạng thái. */
  readonly status?: ContractStatus;
  /** Thông tin bắt buộc còn thiếu hoặc hạng mục dùng khu vực Tạm ngưng. */
  readonly items?: string[];

  constructor(
    code: ContractActionErrorCode,
    extra: Pick<ContractActionError, 'fieldErrors' | 'sessionStatus' | 'status' | 'items'> = {},
  ) {
    super(code);
    this.name = 'ContractActionError';
    this.code = code;
    this.fieldErrors = extra.fieldErrors;
    this.sessionStatus = extra.sessionStatus;
    this.status = extra.status;
    this.items = extra.items;
  }
}

type Actor = { userId: string; signedInAt: string };

export type UpdateContractRequest = Actor & { code: string; baseVersion: number; draft: ContractDraft };
export type SubmitContractRequest = Actor & { code: string; idempotencyKey: string };
export type CancelContractRequest = Actor & { code: string; reason: string };
export type AcceptReviewRequest = Actor & { code: string };
export type DecideReviewRequest = Actor & {
  code: string;
  step: ApprovalStepKey;
  roundNo: number;
  viewedVersion: number;
  decision: ApprovalDecision;
  comment: string;
};
export type DecideReviewResult = { contract: Contract; notificationFailed: boolean; pendingTask?: string };
export type CoordinationRequest = Actor & { code: string; department: string; content: string };
export type CoordinationReplyRequest = Actor & { code: string; id: string; reply: string };

/** Kiểm tra trước khi mở hộp thoại xác nhận trình (SYS-CTR-04 bước 3–5). */
export type SubmitCheck = { salesReviewer: string; configLabel: string; resubmit: boolean };

export type CreateContractRequest = {
  userId: string;
  signedInAt: string;
  idempotencyKey: string;
  draft: ContractDraft;
};

export type CreateContractResult = { contract: Contract; replayed: boolean };

export type SetContractAttachmentsRequest = {
  userId: string;
  signedInAt: string;
  code: string;
  attachments: UploadedFile[];
};

export type CreateContractErrorCode =
  | 'VALIDATION'
  | 'CUSTOMER_INACTIVE'
  | 'AREA_INACTIVE'
  | 'SAVE_FAILED'
  | 'NETWORK'
  | 'FORBIDDEN'
  | 'SESSION_ENDED'
  | 'NOT_FOUND';

export class CreateContractError extends Error {
  readonly code: CreateContractErrorCode;
  readonly fieldErrors?: ContractFieldErrors;
  readonly sessionStatus?: Exclude<SessionCheck['status'], 'active'>;

  constructor(
    code: CreateContractErrorCode,
    extra: Pick<CreateContractError, 'fieldErrors' | 'sessionStatus'> = {},
  ) {
    super(code);
    this.name = 'CreateContractError';
    this.code = code;
    this.fieldErrors = extra.fieldErrors;
    this.sessionStatus = extra.sessionStatus;
  }
}

export type ContractTemplate = {
  code: string;
  name: string;
  version: string;
  title: string;
  contractType: string;
  paymentTerm: string;
  content: string;
  services: Omit<ContractServiceItem, 'id' | 'areaCode'>[];
};

export type ContractServiceOption = Omit<ContractServiceItem, 'id' | 'areaCode'>;
