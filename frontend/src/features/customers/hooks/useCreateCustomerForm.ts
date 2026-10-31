import { useCallback, useRef, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import type { SignOutReason } from '@/lib/auth/signOutNotice';
import { customersApi } from '../api/customersApi';
import {
  CreateCustomerError,
  type CreateCustomerResult,
  type CustomerDraft,
  type CustomerFieldErrors,
  type DuplicateCustomer,
} from '../types/customer';
import { EMPTY_CUSTOMER_DRAFT, isDraftEmpty, isOnlyMissingContact, validateCustomerDraft } from '../utils/customerValidation';

type ServerAlert =
  | { kind: 'duplicate'; existing: DuplicateCustomer } // 01.4
  | { kind: 'save-failed' } // 01.6 – A6.3
  | { kind: 'network' } // 01.6 – A6.4
  | { kind: 'forbidden' }; // 01.6 – A5

export type CreateCustomerAlert =
  | ServerAlert
  | { kind: 'invalid'; count: number } // 01.2
  | { kind: 'no-contact' }; // 01.3

export type SubmitOutcome = 'created' | 'invalid' | 'rejected' | 'busy';

export const DUPLICATE_TAX_CODE_MESSAGE = 'Mã số thuế đã tồn tại trong danh mục khách hàng.';

function newIdempotencyKey() {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

type Options = {
  onCreated: (result: CreateCustomerResult) => void;
  onSessionEnded: (reason: SignOutReason) => void;
};

/** Trạng thái biểu mẫu UC-CUS-01 · Tạo hồ sơ khách hàng (frame 01.1 → 01.7). */
export function useCreateCustomerForm({ onCreated, onSessionEnded }: Options) {
  const { user } = useAuth();
  const [values, setValues] = useState<CustomerDraft>(EMPTY_CUSTOMER_DRAFT);
  // Báo lỗi sau lần bấm "Lưu" đầu tiên, sau đó cập nhật theo từng thay đổi.
  const [attempted, setAttempted] = useState(false);
  const [serverAlert, setServerAlert] = useState<ServerAlert | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // A6.2: chặn lần gửi thứ hai trước khi React kịp vô hiệu hóa nút.
  const inFlight = useRef(false);
  // Giữ nguyên cho mọi lần thử lại của biểu mẫu này để server nhận ra yêu cầu đã xử lý (A6.4).
  const idempotencyKey = useRef(newIdempotencyKey());

  const setField = useCallback(<K extends keyof CustomerDraft>(field: K, value: CustomerDraft[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
  }, []);

  const clientErrors: CustomerFieldErrors = attempted ? validateCustomerDraft(values) : {};
  const errors: CustomerFieldErrors = { ...clientErrors };
  // Cảnh báo trùng MST chỉ còn hiệu lực khi MST chưa bị sửa.
  const activeServerAlert =
    serverAlert?.kind === 'duplicate' && serverAlert.existing.taxCode !== values.taxCode.trim() ? null : serverAlert;
  if (activeServerAlert?.kind === 'duplicate' && !errors.taxCode) errors.taxCode = DUPLICATE_TAX_CODE_MESSAGE;

  const clientErrorCount = Object.keys(clientErrors).length;
  let alert: CreateCustomerAlert | null = activeServerAlert;
  if (clientErrorCount > 0) {
    alert = isOnlyMissingContact(clientErrors) ? { kind: 'no-contact' } : { kind: 'invalid', count: clientErrorCount };
  }

  async function submit(): Promise<SubmitOutcome> {
    if (inFlight.current || !user) return 'busy';
    setAttempted(true);
    if (Object.keys(validateCustomerDraft(values)).length > 0) return 'invalid';

    inFlight.current = true;
    setSubmitting(true);
    setServerAlert(null);
    try {
      const result = await customersApi.create({
        userId: user.id,
        signedInAt: user.signedInAt,
        idempotencyKey: idempotencyKey.current,
        draft: values,
      });
      onCreated(result);
      return 'created';
    } catch (error) {
      if (!(error instanceof CreateCustomerError)) {
        setServerAlert({ kind: 'network' });
        return 'rejected';
      }
      switch (error.code) {
        case 'SESSION_ENDED':
          onSessionEnded(error.sessionStatus ?? 'expired');
          break;
        case 'DUPLICATE_TAX_CODE':
          setServerAlert({ kind: 'duplicate', existing: error.existing! });
          break;
        case 'SAVE_FAILED':
          setServerAlert({ kind: 'save-failed' });
          break;
        case 'FORBIDDEN':
          setServerAlert({ kind: 'forbidden' });
          break;
        case 'VALIDATION':
          // Server dùng cùng quy tắc với FE; nếu vẫn lệch thì hiển thị như lỗi kiểm tra dữ liệu.
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

  return {
    values,
    errors,
    alert,
    submitting,
    dirty: !isDraftEmpty(values),
    setField,
    submit,
  };
}
