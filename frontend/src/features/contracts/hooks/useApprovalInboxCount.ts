import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { CurrentUser } from '@/app/providers/AuthProvider';
import { IS_MOCK_AUTH } from '@/features/auth/api/authApi';
import { approvalApi } from '../api/approvalApi';
import { APPROVALS_CHANGED } from '../api/approvalEvents';
import { contractsApi } from '../api/contractsApi';
import { approvalPermission, approvalStepFor } from '../utils/approvalReview';

/** Count exactly the inbox visible to this actor, including BE assignment and stage checks. */
export function useApprovalInboxCount(user: CurrentUser) {
  const { key: navigationKey } = useLocation();
  const step = approvalStepFor(user);
  const allowed = Boolean(step && user.permissions.has(approvalPermission(step)));
  const scope = `${user.id}:${user.signedInAt}:${step}:${allowed}`;
  const [result, setResult] = useState<{ scope: string; count: number } | null>(null);

  useEffect(() => {
    if (!step || !allowed) return;
    let active = true;
    let sequence = 0;
    let controller: AbortController | undefined;
    async function refresh() {
      if (document.visibilityState === 'hidden') return;
      const request = ++sequence;
      controller?.abort();
      controller = new AbortController();
      try {
        const items = IS_MOCK_AUTH
          ? await contractsApi.inbox({ userId: user.id, signedInAt: user.signedInAt, step: step!, done: false })
          : await approvalApi.inbox(step!, false, controller.signal);
        if (active && request === sequence) setResult({ scope, count: items.length });
      } catch {
        // A failed/forbidden request is not evidence of a zero count or the last known count.
        if (active && request === sequence) setResult(null);
      }
    }
    void refresh();
    const update = () => { void refresh(); };
    window.addEventListener(APPROVALS_CHANGED, update);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    const timer = window.setInterval(update, 30000);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener(APPROVALS_CHANGED, update);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [scope, navigationKey]);

  return { step, count: allowed && result?.scope === scope ? result.count : undefined };
}
