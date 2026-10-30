import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { authApi } from '@/features/auth/api/authApi';
import type { AuthUser, LoginRequest, LoginSuccess } from '@/features/auth/types/auth';
import { DEPARTMENTS, mergePermissions, ROLES, type Department, type Permission, type Role } from '@/constants/roles';
import { SESSION_IDLE_MS } from '@/config/session';
import { sessionStore } from '@/lib/auth/session';
import { signOutNotice } from '@/lib/auth/signOutNotice';

export type CurrentUser = AuthUser & {
  primaryRole: Role;
  departmentInfo: Department;
  permissions: Set<Permission>;
  signedInAt: string;
};

type AuthContextValue = {
  user: CurrentUser | null;
  login: (request: LoginRequest & { remember: boolean }) => Promise<LoginSuccess>;
  logout: () => void;
  /** Nhận token mới cho phiên hiện tại sau khi đổi mật khẩu (04.5) và gỡ cờ mật khẩu tạm (04.6). */
  refreshSession: (signedInAt: string) => void;
  can: (permission: Permission) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function buildCurrentUser(user: AuthUser, signedInAt: string): CurrentUser {
  const primaryRole = ROLES[user.roles[0]];
  return {
    ...user,
    primaryRole,
    departmentInfo: DEPARTMENTS[primaryRole.department],
    permissions: mergePermissions(user.roles),
    signedInAt,
  };
}

/**
 * Khôi phục phiên khi tải trang. Phiên quá thời gian không thao tác (03.4) hoặc đã bị thu hồi (03.5) thì xóa
 * và để lại ghi chú lý do cho màn đăng nhập; guard sẽ đưa người dùng về đăng nhập kèm trang đang làm.
 */
function restoreSession(): CurrentUser | null {
  const stored = sessionStore.load();
  if (!stored) return null;
  const check = authApi.checkSession(stored.userId, stored.signedInAt);
  const expired = Date.now() - stored.lastActiveAt > SESSION_IDLE_MS;

  if (check.status !== 'active' || expired) {
    sessionStore.clear();
    if (check.status === 'active') void authApi.logout(stored.userId, 'expired').catch(() => undefined);
    signOutNotice.save({
      reason: check.status === 'active' ? 'expired' : check.status,
      identifier: check.status === 'active' ? check.user.username : '',
    });
    return null;
  }
  return buildCurrentUser(check.user, stored.signedInAt);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(restoreSession);

  const login = useCallback(async ({ remember, ...request }: LoginRequest & { remember: boolean }) => {
    const result = await authApi.login(request);
    sessionStore.save({ userId: result.user.id, signedInAt: result.signedInAt, lastActiveAt: Date.now() }, remember);
    signOutNotice.clear();
    setUser(buildCurrentUser(result.user, result.signedInAt));
    return result;
  }, []);

  const logout = useCallback(() => {
    sessionStore.clear();
    setUser(null);
  }, []);

  const refreshSession = useCallback((signedInAt: string) => {
    sessionStore.update({ signedInAt, lastActiveAt: Date.now() });
    setUser((current) => (current ? { ...current, signedInAt, mustChangePassword: false } : current));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      login,
      logout,
      refreshSession,
      can: (permission) => Boolean(user?.permissions.has(permission)),
    }),
    [user, login, logout, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth phải dùng bên trong AuthProvider');
  return context;
}
