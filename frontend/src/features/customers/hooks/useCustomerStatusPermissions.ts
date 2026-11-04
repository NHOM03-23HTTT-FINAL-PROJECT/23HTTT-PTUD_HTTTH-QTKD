import { useEffect, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { IS_MOCK_AUTH } from '@/features/auth/api/authApi';
import { apiRequest } from '@/lib/http/client';

type Permissions = { canSuspend: boolean; canReactivate: boolean };

/** The server evaluates the current person, action, customer ownership and delegation. */
export function useCustomerStatusPermissions(code: string) {
  const { can } = useAuth();
  const mockAllowed = IS_MOCK_AUTH && can('customers.change-status');
  const [permissions, setPermissions] = useState<Permissions>({ canSuspend: mockAllowed, canReactivate: mockAllowed });
  const [loading, setLoading] = useState(!IS_MOCK_AUTH && Boolean(code));
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (IS_MOCK_AUTH) {
      setPermissions({ canSuspend: mockAllowed, canReactivate: mockAllowed });
      setLoading(false);
      return;
    }
    if (!code) { setLoading(false); return; }
    let current = true;
    setPermissions({ canSuspend: false, canReactivate: false });
    setLoading(true); setFailed(false);
    void apiRequest<Permissions>(`/customers/${encodeURIComponent(code)}/status-permissions`)
      .then((result) => { if (current) setPermissions(result); })
      .catch(() => { if (current) setFailed(true); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [code, mockAllowed, attempt]);
  return { ...permissions, loading, failed, retry: () => setAttempt((value) => value + 1) };
}
