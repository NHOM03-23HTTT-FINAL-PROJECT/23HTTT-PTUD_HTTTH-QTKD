/*
 * Lý do phiên kết thúc, chuyển sang màn đăng nhập để hiển thị thông báo tương ứng (frame 03.3 → 03.5).
 * Lưu ở sessionStorage để vẫn còn sau khi tải lại trang hoặc khi bị chuyển hướng bởi guard.
 */
const NOTICE_KEY = 'qtkd.signOutNotice';

export type SignOutReason =
  | 'logout' // 03.3 – người dùng chủ động đăng xuất
  | 'expired' // 03.4 – quá thời gian không thao tác
  | 'password-changed' // 03.5 – phiên bị thu hồi do đổi/đặt lại mật khẩu
  | 'locked' // 04.7 – sai mật khẩu hiện tại 5 lần khi đổi mật khẩu
  | 'disabled' // 03.5 – tài khoản bị vô hiệu hóa (thông báo như 01.5)
  | 'no-role'; // tài khoản bị gỡ hết vai trò (thông báo như 01.6)

export type SignOutNotice = {
  reason: SignOutReason;
  /** Tên đăng nhập để điền sẵn vào biểu mẫu. */
  identifier: string;
};

export const signOutNotice = {
  save(notice: SignOutNotice) {
    try {
      window.sessionStorage.setItem(NOTICE_KEY, JSON.stringify(notice));
    } catch {
      // Không lưu được thì màn đăng nhập hiển thị như bình thường.
    }
  },
  peek(): SignOutNotice | null {
    try {
      const raw = window.sessionStorage.getItem(NOTICE_KEY);
      return raw ? (JSON.parse(raw) as SignOutNotice) : null;
    } catch {
      return null;
    }
  },
  clear() {
    try {
      window.sessionStorage.removeItem(NOTICE_KEY);
    } catch {
      // Không có gì để xóa.
    }
  },
};
