import {
  CreateContractError,
  type Contract,
  type ContractDraft,
  type CreateContractRequest,
  type CreateContractResult,
  type SetContractAttachmentsRequest,
} from '@/features/contracts/types/contract';
import { parseContractValue, validateContractDraft } from '@/features/contracts/utils/contractValidation';
import { authorize, mockGetCustomer, mockGetCustomerOptions } from './customersServer';
import { mockGetAreaTree } from './areasServer';
import { mockStore } from './mockStore';
import {
  CONTRACT_SERVICE_CATALOG,
  CONTRACT_TEMPLATES,
  CONTRACT_TYPES,
  SIMULATED_CONTRACT_SAVE_ERROR_PREFIX,
} from './seed/contracts';

function nextContractCode(): string {
  const max = Math.max(
    30,
    ...mockStore.getStoredContracts().map((contract) => Number(/^HD-\d{4}-(\d+)$/.exec(contract.code)?.[1] ?? 0)),
  );
  return `HD-${new Date().getFullYear()}-${String(max + 1).padStart(3, '0')}`;
}

function normalizeDraft(draft: ContractDraft): ContractDraft {
  return {
    ...draft,
    title: draft.title.trim(),
    contractType: draft.contractType.trim(),
    value: draft.value.trim(),
    paymentTerm: draft.paymentTerm.trim(),
    content: draft.content.trim(),
    templateCode: draft.sourceMode === 'blank' ? '' : draft.templateCode,
    services: draft.services.map((item) => ({ ...item, areaCode: item.requiresArea ? item.areaCode : '' })),
  };
}

export function mockGetContractFormOptions() {
  return {
    customers: mockGetCustomerOptions().filter((customer) => customer.status === 'active'),
    areas: mockGetAreaTree().filter((area) => area.status === 'active'),
    templates: CONTRACT_TEMPLATES,
    services: CONTRACT_SERVICE_CATALOG,
    contractTypes: CONTRACT_TYPES,
  };
}

export function mockGetContract(code: string): Contract | undefined {
  return mockStore.getStoredContracts().find((contract) => contract.code === code);
}

/** SYS-CTR-01: kiểm tra lại quyền, khách hàng/khu vực và dữ liệu ngay trước khi tạo hồ sơ Nháp. */
export function mockCreateContract(request: CreateContractRequest): CreateContractResult {
  const { userId, signedInAt, idempotencyKey } = request;
  const user = authorize(userId, signedInAt, 'contracts.create', (code, sessionStatus) => {
    if (code === 'FORBIDDEN') {
      mockStore.audit({ action: 'CONTRACT_CREATE_REJECTED', username: '', detail: `Không có quyền tạo hợp đồng (${userId})` });
    }
    return new CreateContractError(code, { sessionStatus });
  });

  const processedCode = mockStore.getContractCodeByRequest(idempotencyKey);
  if (processedCode) return { contract: mockGetContract(processedCode)!, replayed: true };

  const draft = normalizeDraft(request.draft);
  const fieldErrors = validateContractDraft(draft);
  if (Object.keys(fieldErrors).length > 0) throw new CreateContractError('VALIDATION', { fieldErrors });

  const customer = mockGetCustomer(draft.customerCode);
  if (!customer || customer.status !== 'active') {
    mockStore.audit({
      action: 'CONTRACT_CREATE_REJECTED',
      username: user.username,
      detail: `Khách hàng ${draft.customerCode || '(trống)'} không còn hợp lệ`,
    });
    throw new CreateContractError('CUSTOMER_INACTIVE', {
      fieldErrors: { customerCode: 'Khách hàng không còn ở trạng thái Hoạt động. Chọn khách hàng khác.' },
    });
  }

  const activeAreas = new Set(mockGetAreaTree().filter((area) => area.status === 'active').map((area) => area.code));
  const invalidAreas = draft.services.filter((item) => item.requiresArea && !activeAreas.has(item.areaCode));
  if (invalidAreas.length > 0) {
    throw new CreateContractError('AREA_INACTIVE', {
      fieldErrors: {
        serviceAreas: Object.fromEntries(invalidAreas.map((item) => [item.id, 'Khu vực không còn Hoạt động. Chọn khu vực khác.'])),
      },
    });
  }

  if (
    draft.title.toUpperCase().startsWith(SIMULATED_CONTRACT_SAVE_ERROR_PREFIX) &&
    mockStore.takeOnce(`contract-save:${idempotencyKey}`)
  ) {
    mockStore.audit({ action: 'CONTRACT_CREATE_ERROR', username: user.username, detail: 'Lỗi lưu hồ sơ; không tạo bản ghi dở dang' });
    throw new CreateContractError('SAVE_FAILED');
  }

  const contract: Contract = {
    ...draft,
    code: nextContractCode(),
    value: parseContractValue(draft.value),
    status: 'draft',
    customerName: customer.name,
    ownerId: user.id,
    ownerName: user.fullName,
    createdAt: new Date().toISOString(),
    attachments: [],
  };
  mockStore.saveContract(contract, idempotencyKey);
  mockStore.audit({ action: 'CONTRACT_CREATED', username: user.username, detail: `Tạo ${contract.code} – ${contract.title}` });
  return { contract, replayed: false };
}

/** 01.10: tệp chỉ được bổ sung sau khi hồ sơ có mã; prototype lưu metadata thay cho nội dung tệp. */
export function mockSetContractAttachments(request: SetContractAttachmentsRequest): Contract {
  const user = authorize(request.userId, request.signedInAt, 'contracts.create', (code, sessionStatus) =>
    new CreateContractError(code, { sessionStatus }),
  );
  const current = mockGetContract(request.code);
  if (!current) throw new CreateContractError('NOT_FOUND');
  if (current.ownerId !== user.id) throw new CreateContractError('FORBIDDEN');
  const next = { ...current, attachments: request.attachments };
  mockStore.saveContract(next);
  mockStore.audit({
    action: 'CONTRACT_ATTACHMENTS_UPDATED',
    username: user.username,
    detail: `${request.code}: ${request.attachments.length} tệp đính kèm`,
  });
  return next;
}
