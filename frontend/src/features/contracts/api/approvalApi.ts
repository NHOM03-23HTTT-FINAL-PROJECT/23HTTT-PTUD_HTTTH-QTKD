import { apiRequest } from '@/lib/http/client';
import type { ApprovalDecision, ApprovalStepKey, ContractStatus } from '../types/contract';

export type ReviewStep = {
  id: string; key: ApprovalStepKey; order: number; assigneeId: string | null; assigneeName: string | null;
  state: string; decision: ApprovalDecision | null; reviewedVersion: number | null;
  comment: string | null; decidedAt: string | null;
  requiresHandoff: boolean;
};
export type ReviewDocument = {
  code?: string;
  id: string; title: string; customerName: string; ownerName: string; department: string; value: number;
  status: ContractStatus; version: number; roundId: string; roundNo: number; submittedVersion: number;
  roundResult: string; submittedAt: string; steps: ReviewStep[]; content: string; paymentTerm: string;
  attachments: { name: string; url: string }[]; pendingTask?: string | null;
  contractType: string; startDate: string | null; endDate: string | null;
  services: { name: string; area: string; unit: string }[] | null;
};
export type ReviewCoordination = { id: string; documentId: string; roundId: string; department: string; content: string;
  requestedBy: string; requestedAt: string; reply: string | null; repliedBy: string | null; repliedAt: string | null };
export type ReviewRequest = { roundId: string; stepId: string; viewedVersion: number; step: ApprovalStepKey };
export type ReviewOutcome = { document: ReviewDocument; pendingTask?: string | null };

/** SYS-CTR-10 · Hồ sơ trong tab phân công, kèm các bước người gọi (trưởng bộ phận) được phân công. */
export type AssignmentItem = { document: ReviewDocument; managedSteps: ApprovalStepKey[] };
export type AssignmentCandidate = { id: string; name: string; title: string; department: string };
export type AssignRequest = { roundId: string; stepId: string; viewedVersion: number; assigneeId: string };

const path = (id: string) => `/approvals/contracts/${encodeURIComponent(id)}`;
const write = <T>(url: string, body: unknown, key: string) => apiRequest<T>(url, {
  method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(body),
});
// Actor identity is always supplied by the BE JWT/session, never by request JSON.
export const approvalApi = {
  inbox: (step: ApprovalStepKey, done = false) => apiRequest<ReviewDocument[]>(`/approvals/inbox?step=${step}&done=${done}`),
  read: (id: string, step: ApprovalStepKey, signal?: AbortSignal) => apiRequest<ReviewDocument>(`${path(id)}?step=${step}`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : undefined }),
  accept: (id: string, request: ReviewRequest, key: string) => write<ReviewOutcome>(`${path(id)}/accept`, request, key),
  handoff: (id: string, request: ReviewRequest, key: string) => write<ReviewOutcome>(`${path(id)}/handoff`, request, key),
  decide: (id: string, request: ReviewRequest & { decision: ApprovalDecision; comment: string }, key: string) =>
    write<ReviewOutcome>(`${path(id)}/decisions`, request, key),
  retry: (id: string, step: ApprovalStepKey, key: string) => write<ReviewOutcome>(`${path(id)}/pending-task/retry?step=${step}`, {}, key),
  coordinations: (id: string) => apiRequest<ReviewCoordination[]>(`${path(id)}/coordination`),
  coordinationInbox: () => apiRequest<ReviewCoordination[]>('/approvals/coordination-inbox'),
  coordinate: (id: string, expected: ReviewRequest, department: string, content: string, key: string) =>
    write<ReviewCoordination>(`${path(id)}/coordination`, { expected, department, content }, key),
  reply: (id: string, coordination: string, reply: string, key: string) =>
    write<ReviewCoordination>(`${path(id)}/coordination/${encodeURIComponent(coordination)}/reply`, { reply }, key),
  // SYS-CTR-10 · Phân công người duyệt (quyền approvals.assign; BE kiểm tra trưởng bộ phận của bước).
  assignments: () => apiRequest<AssignmentItem[]>('/approvals/assignments'),
  candidates: (id: string, step: ApprovalStepKey) => apiRequest<AssignmentCandidate[]>(`${path(id)}/candidates?step=${step}`),
  assign: (id: string, request: AssignRequest) =>
    apiRequest<ReviewDocument>(`${path(id)}/assignment`, { method: 'POST', body: JSON.stringify(request) }),
};
export const approvalReviewPath = (id: string, step: ApprovalStepKey) => `/phe-duyet/ho-so/${encodeURIComponent(id)}?step=${step}`;
