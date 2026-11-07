import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { useSession } from '@/app/providers/SessionProvider';
import { customerRecordsApi } from '../api/customerRecordsApi';
import { CustomerRecordsError, type CustomerRecordGroup, type CustomerRecordsByGroup } from '../types/customerRecords';

export type GroupErrorReason = 'unavailable' | 'forbidden' | 'failed';
export type GroupState<T> = { status: 'loading' } | { status: 'ok'; data: T } | { status: 'error'; reason: GroupErrorReason };

export type CustomerRecordsState = { [G in CustomerRecordGroup]: GroupState<CustomerRecordsByGroup[G]> };

const GROUPS: CustomerRecordGroup[] = ['contracts', 'priceLists', 'payments'];

/**
 * Tải ba nhóm hồ sơ liên quan song song. Một nhóm lỗi chỉ báo tại nhóm đó, không coi là danh sách rỗng và
 * được thử lại riêng (06.9 – A5.5).
 */
export function useCustomerRecords(code: string) {
  const { user } = useAuth();
  const { endSession } = useSession();
  const tickets = useRef({ contracts: 0, priceLists: 0, payments: 0 });
  const [state, setState] = useState<CustomerRecordsState>({
    contracts: { status: 'loading' },
    priceLists: { status: 'loading' },
    payments: { status: 'loading' },
  });

  const load = useCallback(
    (group: CustomerRecordGroup, retry: boolean) => {
      if (!user) return;
      const ticket = ++tickets.current[group];
      setState((current) => ({ ...current, [group]: { status: 'loading' } }));
      customerRecordsApi
        .getGroup(user, code, group, retry)
        .then((data) => { if (ticket === tickets.current[group]) setState((current) => ({ ...current, [group]: { status: 'ok', data } })); })
        .catch((error) => {
          if (ticket !== tickets.current[group]) return;
          if (error instanceof CustomerRecordsError && error.code === 'SESSION_ENDED') {
            endSession(error.sessionStatus ?? 'expired');
            return;
          }
          const reason: GroupErrorReason = error instanceof CustomerRecordsError && error.code === 'SOURCE_UNAVAILABLE'
            ? 'unavailable' : error instanceof CustomerRecordsError && error.code === 'FORBIDDEN' ? 'forbidden' : 'failed';
          setState((current) => ({ ...current, [group]: { status: 'error', reason } }));
        });
    },
    [code, endSession, user],
  );

  useEffect(() => {
    GROUPS.forEach((group) => load(group, false));
    return () => { GROUPS.forEach(group => { tickets.current[group]++; }); };
  }, [load]);

  return { state, retry: (group: CustomerRecordGroup) => load(group, true) };
}
