import {
  mockChangePassword,
  mockCheckSession,
  mockGetPasswordChangedAt,
  mockLogin,
  mockLogout,
} from '@/mocks/authServer';
import type {
  ChangePasswordRequest,
  ChangePasswordResult,
  LoginRequest,
  LoginSuccess,
  SessionCheck,
} from '../types/auth';

/** Độ trễ giả lập để thấy trạng thái "Đang đăng nhập…" (NFR-01: ≤ 2 giây). */
const MOCK_LATENCY_MS = 900;

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/*
 * Lớp API của feature auth. Prototype gọi server giả lập trong `src/mocks`;
 * khi có BE chỉ cần thay phần thân hàm bằng lời gọi HTTP, giữ nguyên chữ ký.
 */
export const authApi = {
  async login(request: LoginRequest): Promise<LoginSuccess> {
    await delay(MOCK_LATENCY_MS);
    return mockLogin(request);
  },

  /** Kiểm tra phiên còn hiệu lực; gọi đồng bộ để khôi phục phiên ngay khi tải trang. */
  checkSession(userId: string, signedInAt: string): SessionCheck {
    return mockCheckSession(userId, signedInAt);
  },

  /** UC-CHUNG-04: đổi mật khẩu, trả về mốc phiên mới cho phiên hiện tại. */
  async changePassword(request: ChangePasswordRequest): Promise<ChangePasswordResult> {
    await delay(MOCK_LATENCY_MS);
    return mockChangePassword(request);
  },

  getPasswordChangedAt(userId: string): string | null {
    return mockGetPasswordChangedAt(userId);
  },

  /** Thu hồi phiên phía server. Lỗi mạng/server (E1/E2) do nơi gọi bỏ qua: trình duyệt vẫn xóa phiên. */
  async logout(userId: string, reason: 'logout' | 'expired'): Promise<void> {
    mockLogout(userId, reason);
  },
};
