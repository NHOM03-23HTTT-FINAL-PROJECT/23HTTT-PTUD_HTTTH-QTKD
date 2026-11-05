import { useEffect, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { IS_MOCK_AUTH } from '@/features/auth/api/authApi';
import { apiRequest } from '@/lib/http/client';

type Permissions = { canSuspend: boolean; canReactivate: boolean };

/** The server evaluates the current person, action, customer ownership and delegation. */
export function useCustomerStatusPermissions(code: string) {
  const { can, user } = useAuth();
  const scope = user ? [user.id, user.signedInAt, user.department, ...user.roles, ...[...user.permissions].sort()].join('|') : '';
  const key = scope + ':' + code;
  const [loadedKey, setLoadedKey] = useState('');
  const mockAllowed = IS_MOCK_AUTH && can('customers.change-status');
  const [permissions, setPermissions] = useState<Permissions>({ canSuspend: mockAllowed, canReactivate: mockAllowed });
  const [loading, setLoading] = useState(!IS_MOCK_AUTH && Boolean(code));
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (IS_MOCK_AUTH) {
      setPermissions({ canSuspend: mockAllowed, canReactivate: mockAllowed });
      setLoadedKey(key); setLoading(false);
      return;
    }
    if (!code) { setLoadedKey(key); setLoading(false); return; }
    let current = true;
    setPermissions({ canSuspend: false, canReactivate: false });
    setLoading(true); setFailed(false);
    void apiRequest<Permissions>(`/customers/${encodeURIComponent(code)}/status-permissions`)
      .then((result) => { if (current) setPermissions(result); })
      .catch(() => { if (current) setFailed(true); })
      .finally(() => { if (current) { setLoadedKey(key); setLoading(false); } });
    return () => { current = false; };
  }, [code, key, mockAllowed, attempt]);
  return { ...(loadedKey === key ? permissions : { canSuspend: false, canReactivate: false }), loading: loading || loadedKey !== key, failed, retry: () => setAttempt((value) => value + 1) };
}
