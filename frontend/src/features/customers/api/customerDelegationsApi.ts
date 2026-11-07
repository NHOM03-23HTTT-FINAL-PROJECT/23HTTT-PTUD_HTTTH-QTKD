import { apiRequest } from '@/lib/http/client';

export type DelegationAction = 'suspend' | 'reactivate';
export type DelegationCandidate = { id: string; name: string; username: string };
export type CustomerDelegation = {
  id: string; granteeId: string; granteeName: string; granteeUsername: string; action: DelegationAction;
  reason: string | null; grantedBy: string; grantedAt: string; expiresAt: string | null;
  revokedAt: string | null; revokedBy: string | null; state: 'active' | 'expired' | 'revoked' | 'ineligible';
};
export const customerDelegationsApi = {
  candidates: () => apiRequest<DelegationCandidate[]>('/customers/delegations/candidates'),
  list: () => apiRequest<CustomerDelegation[]>('/customers/delegations'),
  grant: (body: { granteeId: string; action: DelegationAction; expiresAt: string | null; reason: string | null }) =>
    apiRequest<CustomerDelegation>('/customers/delegations', { method: 'POST', body: JSON.stringify(body) }),
  revoke: (id: string) => apiRequest<CustomerDelegation>(`/customers/delegations/${encodeURIComponent(id)}/revoke`,
    { method: 'POST', body: '{}' }),
};
