import {
  mockAcceptReview,
  mockCancelContract,
  mockCheckSubmit,
  mockCreateContract,
  mockDecideReview,
  mockGetContract,
  mockGetContractDetail,
  mockGetContractFormOptions,
  mockGetListFilterOptions,
  mockListApprovalInbox,
  mockListContracts,
  mockReplyCoordination,
  mockRequestCoordination,
  mockRetryPendingTask,
  mockSetContractAttachments,
  mockSubmitContract,
  mockUpdateContract,
} from '@/mocks/contractsServer';
import type {
  AcceptReviewRequest,
  ApprovalStepKey,
  CancelContractRequest,
  ContractListQuery,
  CoordinationReplyRequest,
  CoordinationRequest,
  CreateContractRequest,
  DecideReviewRequest,
  SetContractAttachmentsRequest,
  SubmitContractRequest,
  UpdateContractRequest,
} from '../types/contract';

const SAVE_LATENCY_MS = 700;
const LOAD_LATENCY_MS = 300;

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

type Actor = { userId: string; signedInAt: string };

/** Ranh giới API của Hợp đồng; khi có BE chỉ thay phần thân bằng HTTP và giữ nguyên chữ ký. */
export const contractsApi = {
  getFormOptions: mockGetContractFormOptions,
  getListFilterOptions: mockGetListFilterOptions,
  getContract: mockGetContract,
  async create(request: CreateContractRequest) {
    await delay(SAVE_LATENCY_MS);
    return mockCreateContract(request);
  },
  async setAttachments(request: SetContractAttachmentsRequest) {
    await delay(350);
    return mockSetContractAttachments(request);
  },
  async list(request: Actor & { query: ContractListQuery; variant: 'all' | 'tracking'; retry?: boolean }) {
    await delay(LOAD_LATENCY_MS);
    return mockListContracts(request);
  },
  async getDetail(request: Actor & { code: string; retry?: boolean }) {
    await delay(LOAD_LATENCY_MS);
    return mockGetContractDetail(request);
  },
  async update(request: UpdateContractRequest) {
    await delay(SAVE_LATENCY_MS);
    return mockUpdateContract(request);
  },
  async checkSubmit(request: Actor & { code: string }) {
    await delay(LOAD_LATENCY_MS);
    return mockCheckSubmit(request);
  },
  async submit(request: SubmitContractRequest) {
    await delay(SAVE_LATENCY_MS);
    return mockSubmitContract(request);
  },
  async cancel(request: CancelContractRequest) {
    await delay(SAVE_LATENCY_MS);
    return mockCancelContract(request);
  },
  async acceptReview(request: AcceptReviewRequest) {
    await delay(SAVE_LATENCY_MS);
    return mockAcceptReview(request);
  },
  async decide(request: DecideReviewRequest) {
    await delay(SAVE_LATENCY_MS);
    return mockDecideReview(request);
  },
  async retryPendingTask(request: Actor & { code: string }) {
    await delay(SAVE_LATENCY_MS);
    return mockRetryPendingTask(request);
  },
  async requestCoordination(request: CoordinationRequest) {
    await delay(SAVE_LATENCY_MS);
    return mockRequestCoordination(request);
  },
  async replyCoordination(request: CoordinationReplyRequest) {
    await delay(SAVE_LATENCY_MS);
    return mockReplyCoordination(request);
  },
  async inbox(request: Actor & { step: ApprovalStepKey; done: boolean }) {
    await delay(LOAD_LATENCY_MS);
    return mockListApprovalInbox(request);
  },
};
