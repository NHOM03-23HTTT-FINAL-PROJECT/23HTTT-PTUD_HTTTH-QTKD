import { useEffect, useState } from 'react';
import { customersApi } from '../api/customersApi';
import type { Customer } from '../types/customer';

export function useCustomer(code: string) {
  const [state, setState] = useState<{ loading: boolean; customer?: Customer; failed: boolean }>({ loading: true, failed: false });
  useEffect(() => {
    let current = true;
    setState({ loading: true, failed: false });
    customersApi.getCustomer(code)
      .then((customer) => { if (current) setState({ loading: false, customer, failed: false }); })
      .catch(() => { if (current) setState({ loading: false, failed: true }); });
    return () => { current = false; };
  }, [code]);
  return state;
}
