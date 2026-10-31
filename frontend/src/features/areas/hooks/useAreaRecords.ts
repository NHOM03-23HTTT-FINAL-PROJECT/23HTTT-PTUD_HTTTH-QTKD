import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { areasApi } from '../api/areasApi';
import type { AreaRecordData, AreaRecordGroup } from '../types/area';

export type RecordState<T> = { status: 'loading' } | { status: 'ok'; data: T } | { status: 'error' };

export type AreaRecordsState = { [G in AreaRecordGroup]: RecordState<AreaRecordData[G]> };

const GROUPS: AreaRecordGroup[] = ['services', 'staff', 'priceLists', 'contracts'];

const LOADING: AreaRecordsState = {
  services: { status: 'loading' },
  staff: { status: 'loading' },
  priceLists: { status: 'loading' },
  contracts: { status: 'loading' },
};

/**
 * Tải thông tin liên kết của khu vực (UC-ARE-13 tab 2–5). Mỗi nhóm tải và báo lỗi độc lập: module Bảng giá lỗi chỉ làm
 * tab Bảng giá báo lỗi, header và các tab khác vẫn hiển thị (13.8).
 */
export function useAreaRecords(areaId: string) {
  const { user } = useAuth();
  const [state, setState] = useState<AreaRecordsState>(LOADING);
  const generation = useRef(0);

  const load = useCallback(
    (group: AreaRecordGroup, retry = false) => {
      if (!user) return;
      const current = generation.current;
      setState((s) => ({ ...s, [group]: { status: 'loading' } }));
      areasApi
        .getRecords(user.id, user.signedInAt, areaId, group, retry)
        .then((data) => {
          if (current === generation.current) setState((s) => ({ ...s, [group]: { status: 'ok', data } }));
        })
        .catch(() => {
          if (current === generation.current) setState((s) => ({ ...s, [group]: { status: 'error' } }));
        });
    },
    [areaId, user],
  );

  useEffect(() => {
    generation.current += 1;
    setState(LOADING);
    GROUPS.forEach((group) => load(group));
  }, [load]);

  return { state, retry: (group: AreaRecordGroup) => load(group, true) };
}
