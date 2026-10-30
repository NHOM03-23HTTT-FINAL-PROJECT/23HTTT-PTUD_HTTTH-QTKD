/** Chính sách mật khẩu hiển thị ngay tại biểu mẫu (02.8 / 04.x). */
export type PolicyRuleId = 'length' | 'case' | 'digit' | 'special' | 'notCurrent';

export const POLICY_RULES: { id: Exclude<PolicyRuleId, 'notCurrent'>; label: string }[] = [
  { id: 'length', label: 'Tối thiểu 8 ký tự' },
  { id: 'case', label: 'Có chữ hoa và chữ thường' },
  { id: 'digit', label: 'Có chữ số' },
  { id: 'special', label: 'Có ký tự đặc biệt (!@#$…)' },
];

/** Các tiêu chí kiểm tra được ngay ở trình duyệt; "không trùng mật khẩu hiện tại" chỉ server biết. */
export function checkPolicy(password: string): Record<Exclude<PolicyRuleId, 'notCurrent'>, boolean> {
  return {
    length: password.length >= 8,
    case: /[a-z]/.test(password) && /[A-Z]/.test(password),
    digit: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
}

export function meetsPolicy(password: string): boolean {
  return Object.values(checkPolicy(password)).every(Boolean);
}

export type Strength = { level: 0 | 1 | 2 | 3 | 4; label: string; tone: 'danger' | 'warning' | 'success' };

/** Từ độ dài này, mật khẩu đạt đủ tiêu chí được xếp "Mạnh" thay vì "Khá". */
const STRONG_LENGTH = 12;

/**
 * Độ mạnh theo số tiêu chí đạt và độ dài: đủ 4 tiêu chí và ≥ 12 ký tự → Mạnh; đủ 4 tiêu chí → Khá;
 * 2–3 tiêu chí → Trung bình; ít hơn → Yếu (frame 02.8, 02.9, 04.1, 04.6).
 */
export function passwordStrength(password: string): Strength {
  if (!password) return { level: 0, label: '', tone: 'danger' };
  const passed = Object.values(checkPolicy(password)).filter(Boolean).length;
  if (passed === 4) {
    return password.length >= STRONG_LENGTH
      ? { level: 4, label: 'Mạnh', tone: 'success' }
      : { level: 3, label: 'Khá', tone: 'success' };
  }
  if (passed >= 2) return { level: 2, label: 'Trung bình', tone: 'warning' };
  return { level: 1, label: 'Yếu', tone: 'danger' };
}
