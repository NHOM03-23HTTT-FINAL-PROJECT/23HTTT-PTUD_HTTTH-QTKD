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

export type Contract = Omit<ContractDraft, 'value'> & {
  code: string;
  value: number;
  status: 'draft';
  customerName: string;
  ownerId: string;
  ownerName: string;
  createdAt: string;
  attachments: UploadedFile[];
};

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
