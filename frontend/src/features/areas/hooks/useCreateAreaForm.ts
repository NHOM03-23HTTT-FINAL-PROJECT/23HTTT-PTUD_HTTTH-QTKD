import { useCallback, useRef, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import type { SignOutReason } from '@/lib/auth/signOutNotice';
import { areasApi } from '../api/areasApi';
import {
  CreateAreaError,
  type AreaDraft,
  type AreaFieldErrors,
  type AreaRef,
  type CreateAreaResult,
  type ParentRejection,
} from '../types/area';
import { PARENT_REJECTION_TEXT } from '../utils/areaHierarchy';
import { EMPTY_AREA_DRAFT, isAreaDraftEmpty, sameAreaName, validateAreaDraft } from '../utils/areaValidation';

type ServerAlert =
  | { kind: 'duplicate-name'; name: string; parentCode: string; existing: AreaRef; parent?: AreaRef } // 01.3
  | { kind: 'duplicate-code'; code: string; existing: AreaRef } // ARE-01
  | { kind: 'invalid-parent'; parentCode: string; reason: ParentRejection } // 02.4 – BE kiểm tra lại
  | { kind: 'save-failed' } // 01.5
  | { kind: 'forbidden' };

export type CreateAreaAlert = ServerAlert | { kind: 'invalid'; count: number }; // 01.2

export type SubmitOutcome = 'created' | 'invalid' | 'rejected' | 'busy';

function newIdempotencyKey() {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

type Options = {
  onCreated: (result: CreateAreaResult) => void;
  onSessionEnded: (reason: SignOutReason) => void;
};

/** Trạng thái biểu mẫu UC-ARE-01 · Tạo mới khu vực khai thác (frame 01.1 → 01.6). */
export function useCreateAreaForm({ onCreated, onSessionEnded }: Options) {
  const { user } = useAuth();
  const [values, setValues] = useState<AreaDraft>(EMPTY_AREA_DRAFT);
  // Báo lỗi sau lần bấm "Lưu hồ sơ" đầu tiên, sau đó cập nhật theo từng thay đổi.
  const [attempted, setAttempted] = useState(false);
  const [serverAlert, setServerAlert] = useState<ServerAlert | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  // Giữ nguyên cho mọi lần thử lại của biểu mẫu này để server nhận ra hồ sơ đã ghi (01.5).
  const idempotencyKey = useRef(newIdempotencyKey());

  const setField = useCallback(<K extends keyof AreaDraft>(field: K, value: AreaDraft[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
  }, []);

  const clientErrors: AreaFieldErrors = attempted ? validateAreaDraft(values) : {};
  const errors: AreaFieldErrors = { ...clientErrors };

  // Cảnh báo từ server chỉ còn hiệu lực khi người dùng chưa sửa trường liên quan.
  let activeServerAlert = serverAlert;
  if (
    serverAlert?.kind === 'duplicate-name' &&
    (!sameAreaName(serverAlert.name, values.name) || serverAlert.parentCode !== values.parentCode)
  ) {
    activeServerAlert = null;
  }
  if (serverAlert?.kind === 'duplicate-code' && serverAlert.code !== values.code.trim().toUpperCase()) activeServerAlert = null;
  if (serverAlert?.kind === 'invalid-parent' && serverAlert.parentCode !== values.parentCode) activeServerAlert = null;

  if (activeServerAlert?.kind === 'duplicate-name' && !errors.name) {
    const where = activeServerAlert.parent ? `trong ${activeServerAlert.parent.name}` : 'ở Cấp 1';
    errors.name = `Đổi tên khác – "${activeServerAlert.existing.name}" đã có ${where}.`;
  }
  if (activeServerAlert?.kind === 'duplicate-code' && !errors.code) {
    errors.code = 'Mã khu vực đã tồn tại trên toàn hệ thống – nhập mã khác hoặc để trống.';
  }
  if (activeServerAlert?.kind === 'invalid-parent' && !errors.parentCode) {
    errors.parentCode = PARENT_REJECTION_TEXT[activeServerAlert.reason].title;
  }

  const clientErrorCount = Object.keys(clientErrors).length;
  const alert: CreateAreaAlert | null = clientErrorCount > 0 ? { kind: 'invalid', count: clientErrorCount } : activeServerAlert;

  async function submit(): Promise<SubmitOutcome> {
    if (inFlight.current || !user) return 'busy';
    setAttempted(true);
    if (Object.keys(validateAreaDraft(values)).length > 0) return 'invalid';

    inFlight.current = true;
    setSubmitting(true);
    setServerAlert(null);
    try {
      const result = await areasApi.create({
        userId: user.id,
        signedInAt: user.signedInAt,
        idempotencyKey: idempotencyKey.current,
        draft: values,
      });
      onCreated(result);
      return 'created';
    } catch (error) {
      if (!(error instanceof CreateAreaError)) {
        setServerAlert({ kind: 'save-failed' });
        return 'rejected';
      }
      switch (error.code) {
        case 'SESSION_ENDED':
          onSessionEnded(error.sessionStatus ?? 'expired');
          break;
        case 'DUPLICATE_NAME':
          setServerAlert({
            kind: 'duplicate-name',
            name: values.name,
            parentCode: values.parentCode,
            existing: error.existing!,
            parent: error.parent,
          });
          break;
        case 'DUPLICATE_CODE':
          setServerAlert({ kind: 'duplicate-code', code: values.code.trim().toUpperCase(), existing: error.existing! });
          break;
        case 'INVALID_PARENT':
          setServerAlert({ kind: 'invalid-parent', parentCode: values.parentCode, reason: error.parentRejection ?? 'NOT_FOUND' });
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
    values,
    errors,
    alert,
    submitting,
    dirty: !isAreaDraftEmpty(values),
    setField,
    submit,
  };
}
