import {
  WorkflowConfigError,
  type ActivateWorkflowRequest,
  type ActivateWorkflowResult,
  type WorkflowConfig,
  type WorkflowConfigRow,
  type WorkflowDocType,
  type WorkflowDraft,
} from '@/features/contracts/types/workflowConfig';
import { DOC_TYPE_LABELS, STAGE_LABELS, validateWorkflowDraft, WORKFLOW_SCOPES } from '@/features/contracts/utils/workflowConfig';
import { authorize } from './customersServer';
import { mockStore } from './mockStore';
import {
  SEED_WORKFLOW_CONFIGS,
  SIMULATED_CONFLICT_PREFIX,
  SIMULATED_CONTRACT_SAVE_ERROR_PREFIX,
  WORKFLOW_PEOPLE,
} from './seed/contracts';

const DOC_TYPES = Object.keys(DOC_TYPE_LABELS) as WorkflowDocType[];

function allConfigs(): WorkflowConfig[] {
  const stored = mockStore.getStoredWorkflowConfigs();
  return [...SEED_WORKFLOW_CONFIGS.filter((seed) => !stored.some((item) => item.code === seed.code)), ...stored];
}

function fail(code: 'SESSION_ENDED' | 'FORBIDDEN', sessionStatus?: WorkflowConfigError['sessionStatus']) {
  return new WorkflowConfigError(code, { sessionStatus });
}

export function mockGetWorkflowPeople() {
  return WORKFLOW_PEOPLE;
}

/** Phiên bản đang áp dụng duy nhất của loại hồ sơ + phạm vi; dùng khi trình và chuyển bước hồ sơ. */
export function mockFindActiveWorkflow(docType: WorkflowDocType, scope: string): WorkflowConfig | undefined {
  return allConfigs().find((config) => config.docType === docType && config.scope === scope);
}

export function mockGetWorkflowConfig(code: string): WorkflowConfig | undefined {
  return allConfigs().find((config) => config.code === code);
}

/** 10.1: mỗi loại hồ sơ + phạm vi một dòng, kể cả dòng "Chưa cấu hình". */
export function mockListWorkflowConfigs(userId: string, signedInAt: string): WorkflowConfigRow[] {
  authorize(userId, signedInAt, 'workflows.manage', fail);
  return WORKFLOW_SCOPES.flatMap((scope) =>
    DOC_TYPES.map((docType) => ({ docType, scope, config: mockFindActiveWorkflow(docType, scope) })),
  );
}

function nextCode(draft: WorkflowDraft): string {
  const prefix = { contract: 'HD', appendix: 'PL', 'cancel-agreement': 'TH', termination: 'CD' }[draft.docType as WorkflowDocType];
  const scopeNo = WORKFLOW_SCOPES.indexOf(draft.scope) + 1;
  return `QT-${prefix}-KD${scopeNo}`;
}

function summarize(draft: WorkflowDraft, previous?: WorkflowConfig): string {
  if (!previous) return `Khởi tạo ${draft.stages.filter((stage) => stage.enabled).length} giai đoạn cho ${DOC_TYPE_LABELS[draft.docType as WorkflowDocType]} · ${draft.scope}.`;
  const changed = draft.stages.filter((stage) => JSON.stringify(stage) !== JSON.stringify(previous.stages.find((item) => item.key === stage.key)));
  return changed.length ? `Cập nhật người tham gia: ${changed.map((stage) => STAGE_LABELS[stage.key]).join(', ')}.` : 'Kích hoạt lại không đổi người tham gia.';
}

/**
 * SYS-CTR-10 bước 9–10: kiểm tra lại quyền và tính hợp lệ, phạm vi trùng (E3), thay đổi đồng thời (E4),
 * rồi lưu phiên bản mới làm phiên bản đang áp dụng duy nhất. Lượt duyệt đã tạo giữ phiên bản gắn lúc trình.
 */
export function mockActivateWorkflow(request: ActivateWorkflowRequest): ActivateWorkflowResult {
  const user = authorize(request.userId, request.signedInAt, 'workflows.manage', (code, sessionStatus) => {
    if (code === 'FORBIDDEN') mockStore.audit({ action: 'WORKFLOW_ACTIVATE_REJECTED', username: '', detail: `Không có quyền quản trị quy trình (${request.userId})` });
    return fail(code, sessionStatus);
  });

  // E6: yêu cầu lặp trả lại kết quả của yêu cầu trước, không tạo phiên bản trùng.
  const processed = mockStore.getWorkflowCodeByRequest(request.idempotencyKey);
  if (processed) return { config: mockGetWorkflowConfig(processed)!, replayed: true };

  const { draft } = request;
  const errors = validateWorkflowDraft(draft, WORKFLOW_PEOPLE);
  if (Object.keys(errors).length > 0) throw new WorkflowConfigError('VALIDATION', { errors });

  const current = request.code ? mockGetWorkflowConfig(request.code) : undefined;
  const sameScope = mockFindActiveWorkflow(draft.docType as WorkflowDocType, draft.scope);
  if (sameScope && sameScope.code !== current?.code && !request.replaceExisting) {
    throw new WorkflowConfigError('DUPLICATE_SCOPE');
  }
  const base = current ?? sameScope;
  if (draft.name.toUpperCase().startsWith(SIMULATED_CONFLICT_PREFIX) && base && mockStore.takeOnce(`workflow-conflict:${request.idempotencyKey}`)) {
    // Giả lập Quản trị khác vừa kích hoạt phiên bản mới của cùng cấu hình.
    mockStore.saveWorkflowConfig({ ...base, version: base.version + 1, activatedAt: new Date().toISOString(), activatedByName: 'Trần Văn Hải', history: [...base.history, { version: base.version + 1, activatedAt: new Date().toISOString(), activatedByName: 'Trần Văn Hải', summary: 'Cập nhật người nhận thông báo.', stages: base.stages }] });
  }
  const latest = base ? mockGetWorkflowConfig(base.code) : undefined;
  if (current && request.baseVersion !== undefined && latest && latest.version !== request.baseVersion) {
    throw new WorkflowConfigError('CONFLICT');
  }
  if (draft.name.toUpperCase().startsWith(SIMULATED_CONTRACT_SAVE_ERROR_PREFIX) && mockStore.takeOnce(`workflow-save:${request.idempotencyKey}`)) {
    mockStore.audit({ action: 'WORKFLOW_ACTIVATE_REJECTED', username: user.username, detail: 'Lỗi lưu cấu hình; giữ phiên bản đang áp dụng' });
    throw new WorkflowConfigError('SAVE_FAILED');
  }

  const now = new Date().toISOString();
  const version = (latest?.version ?? 0) + 1;
  const stages = draft.stages.map((stage) => ({ ...stage }));
  const config: WorkflowConfig = {
    code: latest?.code ?? nextCode(draft),
    name: draft.name.trim(),
    docType: draft.docType as WorkflowDocType,
    scope: draft.scope,
    version,
    activatedAt: now,
    activatedByName: user.fullName,
    stages,
    history: [...(latest?.history ?? []), { version, activatedAt: now, activatedByName: user.fullName, summary: summarize(draft, latest), stages }],
  };
  mockStore.saveWorkflowConfig(config, request.idempotencyKey);
  mockStore.audit({ action: 'WORKFLOW_ACTIVATED', username: user.username, detail: `${config.code} v${version} – ${config.name}` });
  return { config, replayed: false };
}
