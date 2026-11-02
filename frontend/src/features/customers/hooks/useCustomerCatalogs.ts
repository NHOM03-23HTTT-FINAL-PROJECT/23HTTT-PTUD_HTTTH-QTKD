import { useEffect, useState } from 'react';
import { customersApi } from '../api/customersApi';
import type { CustomerCatalogs } from '../components/customerFormat';

export function useCustomerCatalogs() {
  const [state, setState] = useState<{ catalogs: CustomerCatalogs; loading: boolean; failed: boolean }>({
    catalogs: { customerGroups: [], serviceGroups: [] }, loading: true, failed: false,
  });
  useEffect(() => {
    let current = true;
    customersApi.getFormOptions()
      .then((catalogs) => { if (current) setState({ catalogs, loading: false, failed: false }); })
      .catch(() => { if (current) setState((s) => ({ ...s, loading: false, failed: true })); });
    return () => { current = false; };
  }, []);
  return state;
}
