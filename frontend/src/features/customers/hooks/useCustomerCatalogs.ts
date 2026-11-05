import { useEffect, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { customersApi } from '../api/customersApi';
import type { CustomerCatalogs } from '../components/customerFormat';

export function useCustomerCatalogs() {
  const { user } = useAuth();
  const scope = user ? [user.id, user.signedInAt, ...[...user.permissions].sort()].join('|') : '';
  const [state, setState] = useState<{ catalogs: CustomerCatalogs; loading: boolean; failed: boolean }>({
    catalogs: { customerGroups: [], serviceGroups: [] }, loading: true, failed: false,
  });
  useEffect(() => {
    let current = true;
    customersApi.getFormOptions()
      .then((catalogs) => { if (current) setState({ catalogs, loading: false, failed: false }); })
      .catch(() => { if (current) setState((s) => ({ ...s, loading: false, failed: true })); });
    return () => { current = false; };
  }, [scope]);
  return state;
}
