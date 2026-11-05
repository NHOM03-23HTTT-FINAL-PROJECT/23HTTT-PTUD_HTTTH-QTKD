import { useCallback, useRef, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import type { SignOutReason } from '@/lib/auth/signOutNotice';
import { customersApi } from '../api/customersApi';
import {
  UpdateCustomerError,
  type Customer,
  type CustomerConflict,
  type CustomerFieldErrors,
  type EditableCustomerDraft,
  type EditableCustomerField,
  type UpdateCustomerResult,
} from '../types/customer';
import { diffCustomer, EDITABLE_FIELDS, REASON_REQUIRED_MESSAGE, sameValue, toEditableDraft } from '../utils/customerChanges';
import { isOnlyMissingContact, normalizeCustomerDraft, validateCustomerDraft } from '../utils/customerValidation';

type ServerAlert =
  | { kind: 'no-changes' } // 02.6 – A6.1
  | { kind: 'save-failed' } // 02.8 – A6.2
  | { kind: 'network' } // 02.8 – A6.3
  | { kind: 'forbidden' } // 02.8 – A5.5
  | { kind: 'not-found' } // 02.8 – A5.5
  | { kind: 'immutable' } // 02.8 – A5.4
  | { kind: 'reloaded'; version: number; overlapped: EditableCustomerField[] }; // sau 02.4

export type EditCustomerAlert =
  | ServerAlert
  | { kind: 'invalid'; count: number } // 02.2
  | { kind: 'no-contact' }; // 02.3

export type EditFieldErrors = CustomerFieldErrors & { reason?: string };

type Options = {
  onUpdated: (result: UpdateCustomerResult) => void;
  onSessionEnded: (reason: SignOutReason) => void;
};

function newIdempotencyKey() {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function normalizeEditable(values: EditableCustomerDraft): EditableCustomerDraft {
  return toEditableDraft(normalizeCustomerDraft({ ...values, taxCode: '' }));
}

/** Trạng thái biểu mẫu UC-CUS-02 · Cập nhật thông tin khách hàng (frame 02.1 → 02.9). */
export function useEditCustomerForm(initial: Customer, { onUpdated, onSessionEnded }: Options) {
  const { user } = useAuth();
  // Phiên bản đang sửa; đổi sang bản mới nhất khi người dùng chọn tải lại sau xung đột.
  const [baseline, setBaseline] = useState<Customer>(initial);
  const [values, setValues] = useState<EditableCustomerDraft>(() => toEditableDraft(initial));
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [serverAlert, setServerAlert] = useState<ServerAlert | null>(null);
  const [conflict, setConflict] = useState<CustomerConflict | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const idempotencyKey = useRef(newIdempotencyKey());

  const setField = useCallback(<K extends EditableCustomerField>(field: K, value: EditableCustomerDraft[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
  }, []);

  const saved = toEditableDraft(baseline);
  const changes = diffCustomer(saved, values);
  const changedFields = new Set(changes.map((c) => c.field));

  const fieldErrors: CustomerFieldErrors = attempted ? validateCustomerDraft({ ...values, taxCode: baseline.taxCode }) : {};
  const reasonError = attempted && !reason.trim() ? REASON_REQUIRED_MESSAGE : undefined;
  const errors: EditFieldErrors = { ...fieldErrors, reason: reasonError };
  const errorCount = Object.keys(fieldErrors).length + (reasonError ? 1 : 0);

  let alert: EditCustomerAlert | null = serverAlert;
  if (serverAlert?.kind === 'no-changes' && changes.length > 0) alert = null;
  if (errorCount > 0) {
    alert = isOnlyMissingContact(fieldErrors) && !reasonError ? { kind: 'no-contact' } : { kind: 'invalid', count: errorCount };
  }

  async function submit(): Promise<'updated' | 'invalid' | 'rejected' | 'busy'> {
    if (inFlight.current || !user) return 'busy';
    // A6.1: không có thay đổi thì không gửi, không tạo lịch sử giả.
    if (changes.length === 0) {
      setServerAlert({ kind: 'no-changes' });
      return 'rejected';
    }
    setAttempted(true);
    const invalid =
      Object.keys(validateCustomerDraft({ ...values, taxCode: baseline.taxCode })).length > 0 || !reason.trim();
    if (invalid) return 'invalid';

    inFlight.current = true;
    setSubmitting(true);
    setServerAlert(null);
    try {
      const result = await customersApi.update({
        userId: user.id,
        signedInAt: user.signedInAt,
        idempotencyKey: idempotencyKey.current,
        code: baseline.code,
        baseVersion: baseline.version,
        draft: values,
        reason,
      });
      onUpdated(result);
      return 'updated';
    } catch (error) {
      if (!(error instanceof UpdateCustomerError)) {
        setServerAlert({ kind: 'network' });
        return 'rejected';
      }
      switch (error.code) {
        case 'SESSION_ENDED':
          onSessionEnded(error.sessionStatus ?? 'expired');
          break;
        case 'CONFLICT':
          setConflict(error.conflict!);
          break;
        case 'NO_CHANGES':
          setServerAlert({ kind: 'no-changes' });
          break;
        case 'SAVE_FAILED':
          setServerAlert({ kind: 'save-failed' });
          break;
        case 'FORBIDDEN':
          setServerAlert({ kind: 'forbidden' });
          break;
        case 'NOT_FOUND':
          setServerAlert({ kind: 'not-found' });
          break;
        case 'IMMUTABLE_FIELD':
          setServerAlert({ kind: 'immutable' });
          break;
        case 'VALIDATION':
          return 'invalid';
        default:
          setServerAlert({ kind: 'network' });
      }
      return 'rejected';
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  /**
   * 02.4 → tải lại: lấy bản mới nhất làm phiên bản đang sửa. Thay đổi của mình ở trường người khác không sửa được
   * giữ lại để đối chiếu; trường cả hai cùng sửa lấy theo bản mới nhất. Người dùng vẫn phải bấm lưu lại.
   */
  function reloadLatest() {
    if (!conflict) return;
    const { latest } = conflict;
    const latestDraft = toEditableDraft(latest);
    const mine = normalizeEditable(values);
    const next = { ...latestDraft } as Record<EditableCustomerField, unknown>;
    const overlapped: EditableCustomerField[] = [];
    for (const field of EDITABLE_FIELDS) {
      const mineChanged = !sameValue(saved[field], mine[field]);
      const otherChanged = !sameValue(saved[field], latestDraft[field]);
      if (mineChanged && !otherChanged) next[field] = values[field];
      else if (mineChanged && otherChanged && !sameValue(mine[field], latestDraft[field])) overlapped.push(field);
    }
    setBaseline(latest);
    setValues(next as EditableCustomerDraft);
    setConflict(null);
    setServerAlert({ kind: 'reloaded', version: latest.version, overlapped });
    // Lần lưu sau là thao tác mới trên phiên bản mới.
    idempotencyKey.current = newIdempotencyKey();
  }

  return {
    baseline,
    values,
    reason,
    errors,
    alert,
    changes,
    changedFields,
    conflict,
    submitting,
    dirty: changes.length > 0 || reason.trim() !== '',
    setField,
    setReason,
    submit,
    reloadLatest,
    closeConflict: () => setConflict(null),
  };
}
