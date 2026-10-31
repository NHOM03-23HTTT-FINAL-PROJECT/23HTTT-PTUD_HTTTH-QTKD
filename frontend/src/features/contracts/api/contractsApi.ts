import {
  mockCreateContract,
  mockGetContract,
  mockGetContractFormOptions,
  mockSetContractAttachments,
} from '@/mocks/contractsServer';
import type { CreateContractRequest, SetContractAttachmentsRequest } from '../types/contract';

const SAVE_LATENCY_MS = 700;

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Ranh giới API của Hợp đồng; khi có BE chỉ thay phần thân bằng HTTP và giữ nguyên chữ ký. */
export const contractsApi = {
  getFormOptions: mockGetContractFormOptions,
  getContract: mockGetContract,
  async create(request: CreateContractRequest) {
    await delay(SAVE_LATENCY_MS);
    return mockCreateContract(request);
  },
  async setAttachments(request: SetContractAttachmentsRequest) {
    await delay(350);
    return mockSetContractAttachments(request);
  },
};
