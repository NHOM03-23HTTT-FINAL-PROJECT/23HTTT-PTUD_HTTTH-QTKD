import { useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { authApi } from '../api/authApi';
import { ChangePasswordError, type ChangePasswordResult } from '../types/auth';
import { meetsPolicy } from '../utils/passwordPolicy';

export type PasswordField = 'current' | 'next' | 'confirm';

export type ChangePasswordAlert =
  | { kind: 'invalid'; count: number } // E1 / E3
  | { kind: 'wrong-current'; remainingAttempts: number } // E2
  | { kind: 'save-failed' } // E4
  | { kind: 'success' }; // 04.5

type Options = {
  onSuccess: (result: ChangePasswordResult) => void;
  /** Lần sai thứ 5: tài khoản bị tạm khóa, phiên bị thu hồi (04.7). */
  onLocked: () => void;
  /** Phiên đã bị thu hồi ở nơi khác trước khi lưu (03.5). */
  onSessionEnded: () => void;
};

const EMPTY = { current: '', next: '', confirm: '' };

/** Trạng thái và luồng xử lý của biểu mẫu đổi mật khẩu (UC-CHUNG-04 bước 1–8). */
export function useChangePasswordForm({ onSuccess, onLocked, onSessionEnded }: Options) {
  const { user, refreshSession } = useAuth();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<PasswordField, string>>>({});
  const [alert, setAlert] = useState<ChangePasswordAlert | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function setField(field: PasswordField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setAlert((current) => (current?.kind === 'success' ? null : current));
  }

  /** E1 (thiếu trường) và E3 (không đạt chính sách, trùng mật khẩu hiện tại, không khớp xác nhận). */
  function validate() {
    const { current, next, confirm } = values;
    const found: Partial<Record<PasswordField, string>> = {
      current: current ? undefined : 'Vui lòng nhập mật khẩu hiện tại.',
      next: !next
        ? 'Vui lòng nhập mật khẩu mới.'
        : !meetsPolicy(next)
          ? 'Mật khẩu mới chưa đạt chính sách.'
          : next === current
            ? 'Mật khẩu mới phải khác mật khẩu hiện tại.'
            : undefined,
      confirm: !confirm
        ? 'Vui lòng nhập lại mật khẩu mới.'
        : confirm !== next
          ? 'Mật khẩu xác nhận không khớp.'
          : undefined,
    };
    return found;
  }

  async function submit() {
    if (!user || submitting) return;
    const found = validate();
    const count = Object.values(found).filter(Boolean).length;
    setErrors(found);
    if (count > 0) {
      setAlert({ kind: 'invalid', count });
      return;
    }

    setSubmitting(true);
    setAlert(null);
    try {
      const result = await authApi.changePassword({
        userId: user.id,
        signedInAt: user.signedInAt,
        currentPassword: values.current,
        newPassword: values.next,
      });
      refreshSession(result.signedInAt);
      setValues(EMPTY);
      setErrors({});
      setAlert({ kind: 'success' });
      onSuccess(result);
    } catch (error) {
      const code = error instanceof ChangePasswordError ? error.code : 'SAVE_FAILED';
      if (code === 'LOCKED') return onLocked();
      if (code === 'SESSION_ENDED') return onSessionEnded();
      if (code === 'WRONG_CURRENT') {
        // E2: giữ mật khẩu mới đã nhập, xóa ô mật khẩu hiện tại để nhập lại.
        setValues((current) => ({ ...current, current: '' }));
        setErrors({ current: 'Mật khẩu hiện tại không chính xác.' });
        setAlert({ kind: 'wrong-current', remainingAttempts: (error as ChangePasswordError).remainingAttempts ?? 0 });
      } else if (code === 'WEAK_PASSWORD' || code === 'SAME_AS_CURRENT') {
        setErrors({ next: code === 'WEAK_PASSWORD' ? 'Mật khẩu mới chưa đạt chính sách.' : 'Mật khẩu mới phải khác mật khẩu hiện tại.' });
        setAlert({ kind: 'invalid', count: 1 });
      } else {
        setAlert({ kind: 'save-failed' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return { values, errors, alert, submitting, setField, submit };
}
