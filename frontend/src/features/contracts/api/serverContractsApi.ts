import { api, ApiError, json } from '@/features/contracts/api/contractHttp';
import { getContractAccessToken } from './contractHttp';
import type { mockGetContractFormOptions, mockGetListFilterOptions } from '@/mocks/contractsServer';
import {
  ContractActionError,
  CreateContractError,
  type Contract,
  type ContractListResult,
  type CreateContractRequest,
  type CreateContractResult,
  type SetContractAttachmentsRequest,
  type UpdateContractRequest,
  type CancelContractRequest,
  type SubmitCheck,
  type SubmitContractRequest,
} from '../types/contract';

type Options = ReturnType<typeof mockGetContractFormOptions>;
type Filters = ReturnType<typeof mockGetListFilterOptions>;

let options: Options = {
  customers: [],
  areas: [],
  services: [],
  templates: [],
  contractTypes: [],
};

let filters: Filters = {
  areas: [],
  contractTypes: [],
  coordinationDepartments: [],
};

const cache = new Map<string, Contract>();
const fileKeys = new Map<string, string>();

const keyFor = (signature: string) => {
  let key = fileKeys.get(signature);
  if (!key) {
    key = crypto.randomUUID();
    fileKeys.set(signature, key);
  }
  return key;
};

const remember = (contract: Contract) => {
  cache.set(contract.code, contract);
  return contract;
};

async function action<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await api<T>(path, init);
  } catch (error) {
    if (error instanceof ApiError) {
      throw new ContractActionError(
        error.status === 401 ? 'SESSION_ENDED' : (error.code as ContractActionError['code']),
        error.details,
      );
    }
    throw error;
  }
}

export const serverContractsApi = {
  getFormOptions: () => options,

  async loadFormOptions() {
    options = await action<Options>('/contracts/form-options');
    return options;
  },

  getListFilterOptions: () => filters,

  async loadListFilterOptions() {
    filters = await action<Filters>('/contracts/filter-options');
    return filters;
  },

  getContract: (code: string) => cache.get(code),

  async create(request: CreateContractRequest): Promise<CreateContractResult> {
    try {
      const result = await api<CreateContractResult>('/contracts', {
        method: 'POST',
        headers: { 'Idempotency-Key': request.idempotencyKey },
        body: json({ draft: request.draft }),
      });
      remember(result.contract);
      return result;
    } catch (error) {
      if (error instanceof ApiError) {
        throw new CreateContractError(
          error.status === 401 ? 'SESSION_ENDED' : (error.code as CreateContractError['code']),
          error.details,
        );
      }
      throw error;
    }
  },

  async list(request: { query: import('../types/contract').ContractListQuery; variant: 'all' | 'tracking' }) {
    const params = new URLSearchParams(
      Object.entries({ ...request.query, view: request.variant })
        .filter(([, value]) => value !== '' && value != null)
        .map(([key, value]) => [key, String(value)]),
    );
    return action<ContractListResult>(`/contracts?${params}`);
  },

  async getDetail(request: { code: string }) {
    return remember(await action<Contract>(`/contracts/${encodeURIComponent(request.code)}`));
  },

  async update(request: UpdateContractRequest) {
    return remember(
      await action<Contract>(`/contracts/${encodeURIComponent(request.code)}`, {
        method: 'PUT',
        body: json({ baseVersion: request.baseVersion, draft: request.draft }),
      }),
    );
  },

  async checkSubmit(request: { code: string }) {
    return action<SubmitCheck>(`/contracts/${encodeURIComponent(request.code)}/submit-check`);
  },

  async submit(request: SubmitContractRequest) {
    const result = await action<CreateContractResult>(`/contracts/${encodeURIComponent(request.code)}/submit`, {
      method: 'POST',
      headers: { 'Idempotency-Key': request.idempotencyKey },
    });
    remember(result.contract);
    return result;
  },

  async cancel(request: CancelContractRequest) {
    const result = await action<CreateContractResult>(
      `/contracts/${encodeURIComponent(request.code)}/cancel`,
      {
        method: 'POST',
        headers: {
          'Idempotency-Key':
            request.idempotencyKey ??
            keyFor(`cancel:${request.code}:${request.baseVersion}:${request.reason}`),
        },
        body: json({ baseVersion: request.baseVersion, reason: request.reason }),
      },
    );
    return remember(result.contract);
  },

  async setAttachments(request: SetContractAttachmentsRequest) {
    let current = cache.get(request.code);
    if (!current) {
      current = await this.getDetail({ code: request.code });
    }

    const root = `/contracts/${encodeURIComponent(request.code)}/attachments`;

    for (const old of current.attachments.filter(
      (item) => item.id && !request.attachments.some((file) => file.id === item.id),
    )) {
      const result = await action<CreateContractResult>(`${root}/${old.id}?baseVersion=${current.version}`, {
        method: 'DELETE',
        headers: {
          'Idempotency-Key': keyFor(`delete:${request.code}:${old.id}:${current.version}`),
        },
      });
      current = remember(result.contract);
    }

    for (const file of request.attachments.filter((item) => item.file && !item.id)) {
      const body = new FormData();
      body.set('file', file.file!);
      body.set('baseVersion', String(current.version));

      const result = await action<CreateContractResult>(root, {
        method: 'POST',
        body,
        headers: {
          'Idempotency-Key': keyFor(
            `upload:${request.code}:${current.version}:${file.name}:${file.size}:${file.file!.lastModified}`,
          ),
        },
      });
      current = remember(result.contract);
    }

    return current;
  },

  async requestCancellation(
    code: string,
    body: { baseVersion: number; party: string; reason: string },
    key: string,
  ) {
    const result = await action<CreateContractResult>(
      `/contracts/${encodeURIComponent(code)}/cancellation-requests`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: json(body),
      },
    );
    return remember(result.contract);
  },

  async decideCancellation(
    code: string,
    id: string,
    body: { baseVersion: number; approve: boolean; reason: string },
    key: string,
  ) {
    const result = await action<CreateContractResult>(
      `/contracts/${encodeURIComponent(code)}/cancellation-requests/${id}/decision`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: json(body),
      },
    );
    return remember(result.contract);
  },

  async download(code: string, id: string, name: string) {
    const response = await fetch(`/api/v1/contracts/${encodeURIComponent(code)}/attachments/${id}`, {
      headers: {
        Authorization: `Bearer ${(await getContractAccessToken()) ?? ''}`,
      },
    });

    if (!response.ok) {
      throw new ContractActionError(response.status === 401 ? 'SESSION_ENDED' : 'LOAD_FAILED');
    }

    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
