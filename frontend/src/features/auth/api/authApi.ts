import { mockChangePassword, mockCheckSession, mockGetPasswordChangedAt, mockLogin, mockLogout } from '@/mocks/authServer';
import { ApiError, acceptAuth, apiAuthState, apiRequest, loginHttp, logoutHttp, updateApiSession, type ApiAuthResult } from '@/lib/http/client';
import { sessionStore } from '@/lib/auth/session';
import { SESSION_IDLE_MS } from '@/config/session';
import { signOutNotice } from '@/lib/auth/signOutNotice';
import { ChangePasswordError, LoginError, type ChangePasswordRequest, type ChangePasswordResult, type LoginRequest, type LoginSuccess, type SessionCheck } from '../types/auth';

export const IS_MOCK_AUTH = import.meta.env.VITE_AUTH_MODE === 'mock';
type RemoteSession = { status: 'active'; user: ApiAuthResult['user']; signedInAt: string; idleExpiresAt: string; expiresAt: string };
const reasons = ['expired', 'password-changed', 'locked', 'disabled', 'permissions-changed'] as const;
const mockDelay = () => new Promise<void>(resolve => window.setTimeout(resolve, 900));
function ended(code: string): Exclude<SessionCheck, { status: 'active' }> {
  return { status: reasons.find(reason => reason === code) ?? 'expired' };
}
export const authApi = {
  async login(request: LoginRequest & { remember?: boolean }): Promise<LoginSuccess> {
    if (IS_MOCK_AUTH) { await mockDelay(); return mockLogin(request); }
    try { return await loginHttp(request); }
    catch (error) {
      if (error instanceof ApiError) {
        const code = ['INVALID_CREDENTIALS', 'LOCKED', 'DISABLED'].includes(error.code) ? error.code as 'INVALID_CREDENTIALS' | 'LOCKED' | 'DISABLED' : 'SYSTEM_ERROR';
        throw new LoginError(code, { remainingAttempts: error.detail.remainingAttempts, lockedUntil: error.detail.lockedUntil ? Date.parse(error.detail.lockedUntil) : undefined });
      }
      throw error;
    }
  },
  async restore(): Promise<LoginSuccess | null> {
    if (!IS_MOCK_AUTH && sessionStore.isSignedOut()) return null;
    if (IS_MOCK_AUTH) {
      const stored = sessionStore.load();
      if (!stored) return null;
      if (Date.now() - stored.lastActiveAt >= SESSION_IDLE_MS) {
        sessionStore.clear(); signOutNotice.save({ reason: 'expired', identifier: '' }); return null;
      }
      const check = mockCheckSession(stored.userId, stored.signedInAt);
      if (check.status !== 'active') { sessionStore.clear(); signOutNotice.save({ reason: check.status, identifier: '' }); return null; }
      return { user: check.user, signedInAt: stored.signedInAt, previousLogin: null };
    }
    try {
      const view = await apiRequest<RemoteSession>('/auth/session', {}, false); updateApiSession(view);
      return { user: view.user, signedInAt: view.signedInAt, previousLogin: null };
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        if (sessionStore.load()) signOutNotice.save({ reason: ended(error.code).status, identifier: '' });
        sessionStore.clear(); return null;
      }
      throw error;
    }
  },
  async checkSession(userId: string, signedInAt: string): Promise<SessionCheck> {
    if (IS_MOCK_AUTH) return mockCheckSession(userId, signedInAt);
    try { const view = await apiRequest<RemoteSession>('/auth/session'); updateApiSession(view); return { status: 'active', user: view.user }; }
    catch (error) { if (error instanceof ApiError && error.status === 401) return ended(error.code); throw error; }
  },
  async activity(): Promise<void> {
    if (IS_MOCK_AUTH) return;
    const view = await apiRequest<RemoteSession>('/auth/activity', { method: 'POST', body: '{}' }); updateApiSession(view);
  },
  getDeadlines() {
    const state = apiAuthState();
    return state ? { idle: Date.parse(state.idleExpiresAt), absolute: Date.parse(state.expiresAt) } : null;
  },
  async changePassword(request: ChangePasswordRequest): Promise<ChangePasswordResult> {
    if (IS_MOCK_AUTH) { await mockDelay(); return mockChangePassword(request); }
    try {
      const result = acceptAuth(await apiRequest<ApiAuthResult>('/auth/password/change', { method: 'POST', body: JSON.stringify({ currentPassword: request.currentPassword, newPassword: request.newPassword }) }));
      return { signedInAt: result.signedInAt, passwordChangedAt: result.user.passwordChangedAt! };
    } catch (error) {
      if (error instanceof ApiError) {
        const code = error.status === 401 ? 'SESSION_ENDED' : ['WRONG_CURRENT', 'LOCKED', 'WEAK_PASSWORD', 'SAME_AS_CURRENT'].includes(error.code) ? error.code as 'WRONG_CURRENT' | 'LOCKED' | 'WEAK_PASSWORD' | 'SAME_AS_CURRENT' : 'SAVE_FAILED';
        throw new ChangePasswordError(code, error.detail.remainingAttempts);
      }
      throw error;
    }
  },
  getPasswordChangedAt(userId: string): string | null {
    return IS_MOCK_AUTH ? mockGetPasswordChangedAt(userId) : apiAuthState()?.user.passwordChangedAt ?? null;
  },
  async logout(userId: string, reason: 'logout' | 'expired'): Promise<void> {
    sessionStore.markSignedOut();
    if (IS_MOCK_AUTH) { mockLogout(userId, reason); return; }
    await logoutHttp();
  },
};
