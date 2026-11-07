import { useEffect, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { customersApi } from '../api/customersApi';
import type { Customer } from '../types/customer';

export function useCustomer(code: string) {
  const { user } = useAuth();
  const scope = user ? [user.id, user.signedInAt, user.department, ...user.roles, ...[...user.permissions].sort()].join('|') : '';
  const key = scope + ':' + code;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; loading: boolean; customer?: Customer; failed: boolean }>({ key: '', loading: true, failed: false });
  useEffect(() => {
    let current = true;
    setState({ key, loading: true, failed: false });
    customersApi.getCustomer(code)
      .then((customer) => { if (current) setState({ key, loading: false, customer, failed: false }); })
      .catch(() => { if (current) setState({ key, loading: false, failed: true }); });
    return () => { current = false; };
  }, [code, key, attempt]);
  // A different record/session must never render the preceding record while its effect starts.
  return { ...(state.key === key ? state : { loading: true, failed: false, customer: undefined }),
    retry: () => setAttempt(value => value + 1) };
}
