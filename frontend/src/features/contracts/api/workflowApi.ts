import {
  mockActivateWorkflow,
  mockGetWorkflowConfig,
  mockGetWorkflowPeople,
  mockListWorkflowConfigs,
} from '@/mocks/workflowServer';
import type { ActivateWorkflowRequest } from '../types/workflowConfig';

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Cấu hình người tham gia hồ sơ (SYS-CTR-10); khi có BE chỉ thay phần thân bằng HTTP. */
export const workflowApi = {
  getPeople: mockGetWorkflowPeople,
  getConfig: mockGetWorkflowConfig,
  async list(userId: string, signedInAt: string) {
    await delay(300);
    return mockListWorkflowConfigs(userId, signedInAt);
  },
  async activate(request: ActivateWorkflowRequest) {
    await delay(800);
    return mockActivateWorkflow(request);
  },
};
