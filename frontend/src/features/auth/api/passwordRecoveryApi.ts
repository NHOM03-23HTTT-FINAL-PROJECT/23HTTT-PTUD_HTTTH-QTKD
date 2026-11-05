import { mockResetPassword, mockSendOtp, mockVerifyOtp } from '@/mocks/passwordRecoveryServer';
import { ApiError, postAnonymous } from '@/lib/http/client';
import { RecoveryError, type OtpDispatch, type ResetPasswordRequest, type ResetResult, type VerifyResult } from '../types/passwordRecovery';
import { IS_MOCK_AUTH } from './authApi';

const MOCK_LATENCY_MS = 700;

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function recoveryRequest<T>(action: 'send' | 'verify' | 'reset', body: unknown): Promise<T> {
  try {
    return await postAnonymous<T>(`/auth/password/recovery/${action}`, body);
  } catch (error) {
    if (error instanceof ApiError) {
      switch (error.code) {
        case 'EMAIL_FAILED':
        case 'INVALID_CODE':
        case 'RATE_LIMITED':
        case 'TOKEN_EXPIRED':
        case 'WEAK_PASSWORD':
        case 'SAME_AS_CURRENT':
          throw new RecoveryError(error.code);
      }
    }
    throw new RecoveryError(action === 'send' ? 'EMAIL_FAILED' : 'SAVE_FAILED');
  }
}

export const passwordRecoveryApi = {
  async sendOtp(identifier: string): Promise<OtpDispatch> {
    if (!IS_MOCK_AUTH) return recoveryRequest('send', { identifier });
    await delay(MOCK_LATENCY_MS);
    return mockSendOtp(identifier);
  },

  async verifyOtp(identifier: string, code: string): Promise<VerifyResult> {
    if (!IS_MOCK_AUTH) return recoveryRequest('verify', { identifier, code });
    await delay(MOCK_LATENCY_MS);
    return mockVerifyOtp(identifier, code);
  },

  async resetPassword(request: ResetPasswordRequest): Promise<ResetResult> {
    if (!IS_MOCK_AUTH) return recoveryRequest('reset', request);
    await delay(MOCK_LATENCY_MS);
    return mockResetPassword(request);
  },
};
