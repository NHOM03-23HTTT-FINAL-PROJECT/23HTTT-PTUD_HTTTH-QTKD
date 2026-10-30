import { mockResetPassword, mockSendOtp, mockVerifyOtp } from '@/mocks/passwordRecoveryServer';
import type { OtpDispatch, ResetPasswordRequest, ResetResult, VerifyResult } from '../types/passwordRecovery';

const MOCK_LATENCY_MS = 700;

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/*
 * API UC-CHUNG-02 · Quên mật khẩu. Prototype gọi server giả lập trong `src/mocks`;
 * khi có BE chỉ cần thay phần thân hàm bằng lời gọi HTTP, giữ nguyên chữ ký.
 */
export const passwordRecoveryApi = {
  async sendOtp(identifier: string): Promise<OtpDispatch> {
    await delay(MOCK_LATENCY_MS);
    return mockSendOtp(identifier);
  },

  async verifyOtp(identifier: string, code: string): Promise<VerifyResult> {
    await delay(MOCK_LATENCY_MS);
    return mockVerifyOtp(identifier, code);
  },

  async resetPassword(request: ResetPasswordRequest): Promise<ResetResult> {
    await delay(MOCK_LATENCY_MS);
    return mockResetPassword(request);
  },
};
