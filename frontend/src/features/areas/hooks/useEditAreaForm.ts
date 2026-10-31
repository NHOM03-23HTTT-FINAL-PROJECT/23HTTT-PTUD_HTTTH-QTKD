import { useCallback, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import type { SignOutReason } from '@/lib/auth/signOutNotice';
import { areasApi } from '../api/areasApi';
import {
  UpdateAreaError,
  type Area,
  type AreaConflict,
  type AreaDraft,
  type AreaFieldErrors,
  type AreaRef,
  type AreaReferences,
  type ParentRejection,
  type UpdateAreaResult,
} from '../types/area';
import { diffAreaDraft, toAreaDraft } from '../utils/areaChanges';
import { describeReferences } from '../utils/areaFormat';
import { PARENT_REJECTION_TEXT } from '../utils/areaHierarchy';
import { sameAreaName, validateAreaDraft } from '../utils/areaValidation';

type ServerAlert =
  | { kind: 'duplicate-name'; name: string; parentCode: string; existing: AreaRef; parent?: AreaRef } // 04.3
  | { kind: 'code-locked'; code: string; references: AreaReferences } // 04.4
  | { kind: 'duplicate-code'; code: string; existing: AreaRef } // 04.8 – ARE-01
  | { kind: 'invalid-parent'; parentCode: string; reason: ParentRejection }
  | { kind: 'conflict'; conflict: AreaConflict } // 04.5
  | { kind: 'no-changes' }
  | { kind: 'forbidden' }
  | { kind: 'save-failed' };

export type EditAreaAlert = ServerAlert | { kind: 'invalid'; count: number; reasonMissing: boolean; numberInvalid: boolean }; // 04.2

export const REASON_REQUIRED_MESSAGE = 'Vui lòng nhập lý do cập nhật.';

function newIdempotencyKey() {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

type Options = {
  area: Area;
  onUpdated: (result: UpdateAreaResult) => void;
  onSessionEnded: (reason: SignOutReason) => void;
};

/** Trạng thái biểu mẫu UC-ARE-04 · Cập nhật thông tin và quy chuẩn kỹ thuật khu vực (04.1 → 04.8). */
export function useEditAreaForm({ area, onUpdated, onSessionEnded }: Options) {
  const { user } = useAuth();
  // Bản đang sửa; được thay bằng bản mới nhất khi người dùng "Tải lại trang" sau xung đột (04.5).
  const [original, setOriginal] = useState(area);
  const initial = useMemo(() => toAreaDraft(original), [original]);
  const [values, setValues] = useState<AreaDraft>(initial);
  const [reason, setReason] = useState('');
  // Bước 2: kiểm tra tham chiếu trong Bảng giá, Hợp đồng, Phiếu sản lượng để khóa mã (ARE-07).
  const [references, setReferences] = useState<AreaReferences>(() => areasApi.getReferences(area.id));
  const [attempted, setAttempted] = useState(false);
  const [serverAlert, setServerAlert] = useState<ServerAlert | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const idempotencyKey = useRef(newIdempotencyKey());

  const setField = useCallback(<K extends keyof AreaDraft>(field: K, value: AreaDraft[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
  }, []);

  const changes = useMemo(() => diffAreaDraft(initial, values), [initial, values]);
  const referenceText = describeReferences(references);
  const codeChanged = values.code.trim().toUpperCase() !== original.code;
  // Mã bị khóa khi đã có tham chiếu; vẫn cho sửa lại nếu giá trị đang khác để người dùng trả về mã cũ (04.4).
  const codeLocked = referenceText !== null && !codeChanged;

  const clientErrors: AreaFieldErrors = attempted ? validateAreaDraft(values) : {};
  const reasonError = attempted && !reason.trim() ? REASON_REQUIRED_MESSAGE : undefined;
  const errors: AreaFieldErrors = { ...clientErrors };

  let activeServerAlert = serverAlert;
  if (serverAlert?.kind === 'duplicate-name' && (!sameAreaName(serverAlert.name, values.name) || serverAlert.parentCode !== values.parentCode)) {
    activeServerAlert = null;
  }
  if ((serverAlert?.kind === 'code-locked' || serverAlert?.kind === 'duplicate-code') && serverAlert.code !== values.code.trim().toUpperCase()) {
    activeServerAlert = null;
  }
  if (serverAlert?.kind === 'invalid-parent' && serverAlert.parentCode !== values.parentCode) activeServerAlert = null;
  if (serverAlert?.kind === 'no-changes' && changes.length > 0) activeServerAlert = null;

  if (activeServerAlert?.kind === 'duplicate-name' && !errors.name) {
    const where = activeServerAlert.parent ? `trong ${activeServerAlert.parent.name}` : 'ở Cấp 1';
    errors.name = `Đổi tên khác – "${activeServerAlert.existing.name}" đã có ${where}.`;
  }
  if (activeServerAlert?.kind === 'code-locked') {
    errors.code = `Mã đã khóa do có ${describeReferences(activeServerAlert.references)} tham chiếu (ARE-07).`;
  }
  if (activeServerAlert?.kind === 'duplicate-code' && !errors.code) {
    errors.code = 'Mã khu vực đã tồn tại trên toàn hệ thống – nhập mã khác.';
  }
  if (activeServerAlert?.kind === 'invalid-parent') errors.parentCode = PARENT_REJECTION_TEXT[activeServerAlert.reason].title;

  const clientErrorCount = Object.keys(clientErrors).length + (reasonError ? 1 : 0);
  const alert: EditAreaAlert | null =
    clientErrorCount > 0
      ? {
          kind: 'invalid',
          count: clientErrorCount,
          reasonMissing: Boolean(reasonError),
          numberInvalid: Boolean(clientErrors.areaSize || clientErrors.capacity),
        }
      : activeServerAlert;

  /** 04.5: thay biểu mẫu bằng bản mới nhất, nhập lại các thay đổi còn cần thiết. */
  function reloadLatest(latest: Area) {
    setOriginal(latest);
    setValues(toAreaDraft(latest));
    setReferences(areasApi.getReferences(latest.id));
    setAttempted(false);
    setServerAlert(null);
    idempotencyKey.current = newIdempotencyKey();
  }

  async function submit(): Promise<'saved' | 'invalid' | 'rejected' | 'busy'> {
    if (inFlight.current || !user) return 'busy';
    setAttempted(true);
    if (Object.keys(validateAreaDraft(values)).length > 0 || !reason.trim()) return 'invalid';
    if (changes.length === 0) {
      setServerAlert({ kind: 'no-changes' });
      return 'rejected';
    }

    inFlight.current = true;
    setSubmitting(true);
    setServerAlert(null);
    try {
      const result = await areasApi.update({
        userId: user.id,
        signedInAt: user.signedInAt,
        idempotencyKey: idempotencyKey.current,
        code: original.code,
        baseVersion: original.version,
        draft: values,
        reason,
      });
      onUpdated(result);
      return 'saved';
    } catch (error) {
      if (!(error instanceof UpdateAreaError)) {
        setServerAlert({ kind: 'save-failed' });
        return 'rejected';
      }
      const code = values.code.trim().toUpperCase();
      switch (error.code) {
        case 'SESSION_ENDED':
          onSessionEnded(error.sessionStatus ?? 'expired');
          break;
        case 'DUPLICATE_NAME':
          setServerAlert({ kind: 'duplicate-name', name: values.name, parentCode: values.parentCode, existing: error.existing!, parent: error.parent });
          break;
        case 'CODE_LOCKED':
          setReferences(error.references!);
          setServerAlert({ kind: 'code-locked', code, references: error.references! });
          break;
        case 'DUPLICATE_CODE':
          setServerAlert({ kind: 'duplicate-code', code, existing: error.existing! });
          break;
        case 'INVALID_PARENT':
          setServerAlert({ kind: 'invalid-parent', parentCode: values.parentCode, reason: error.parentRejection ?? 'NOT_FOUND' });
          break;
        case 'CONFLICT':
          setServerAlert({ kind: 'conflict', conflict: error.conflict! });
          break;
        case 'NO_CHANGES':
          setServerAlert({ kind: 'no-changes' });
          break;
        case 'FORBIDDEN':
          setServerAlert({ kind: 'forbidden' });
          break;
        case 'VALIDATION':
          return 'invalid';
        default:
          setServerAlert({ kind: 'save-failed' });
      }
      return 'rejected';
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return {
    original,
    initial,
    values,
    reason,
    errors,
    reasonError,
    alert,
    changes,
    references,
    referenceText,
    codeLocked,
    submitting,
    dirty: changes.length > 0 || reason.trim() !== '',
    setField,
    setReason,
    reloadLatest,
    submit,
  };
}
