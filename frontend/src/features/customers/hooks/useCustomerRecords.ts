import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { useSession } from '@/app/providers/SessionProvider';
import { customerRecordsApi } from '../api/customerRecordsApi';
import { CustomerRecordsError, type CustomerRecordGroup, type CustomerRecordsByGroup } from '../types/customerRecords';

export type GroupState<T> = { status: 'loading' } | { status: 'ok'; data: T } | { status: 'error' };

export type CustomerRecordsState = { [G in CustomerRecordGroup]: GroupState<CustomerRecordsByGroup[G]> };

const GROUPS: CustomerRecordGroup[] = ['contracts', 'priceLists', 'payments'];

/**
 * Tải ba nhóm hồ sơ liên quan song song. Một nhóm lỗi chỉ báo tại nhóm đó, không coi là danh sách rỗng và
 * được thử lại riêng (06.9 – A5.5).
 */
export function useCustomerRecords(code: string) {
  const { user } = useAuth();
  const { endSession } = useSession();
  const [state, setState] = useState<CustomerRecordsState>({
    contracts: { status: 'loading' },
    priceLists: { status: 'loading' },
    payments: { status: 'loading' },
  });

  const load = useCallback(
    (group: CustomerRecordGroup, retry: boolean) => {
      if (!user) return;
      setState((current) => ({ ...current, [group]: { status: 'loading' } }));
      customerRecordsApi
        .getGroup(user, code, group, retry)
        .then((data) => setState((current) => ({ ...current, [group]: { status: 'ok', data } })))
        .catch((error) => {
          if (error instanceof CustomerRecordsError && error.code === 'SESSION_ENDED') {
            endSession(error.sessionStatus ?? 'expired');
            return;
          }
          setState((current) => ({ ...current, [group]: { status: 'error' } }));
        });
    },
    [code, endSession, user],
  );

  useEffect(() => {
    GROUPS.forEach((group) => load(group, false));
  }, [load]);

  return { state, retry: (group: CustomerRecordGroup) => load(group, true) };
}
