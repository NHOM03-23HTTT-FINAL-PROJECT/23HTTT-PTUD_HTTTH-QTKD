import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi, IS_MOCK_AUTH } from '@/features/auth/api/authApi';
import type { AuthUser, LoginRequest, LoginSuccess } from '@/features/auth/types/auth';
import { DEPARTMENTS, mergePermissions, ROLES, type Department, type Permission, type Role } from '@/constants/roles';
import { clearApiAuth } from '@/lib/http/client';
import { sessionStore } from '@/lib/auth/session';
import { signOutNotice, type SignOutReason } from '@/lib/auth/signOutNotice';

export type CurrentUser = Omit<AuthUser, 'permissions'> & {
  primaryRole: Role;
  departmentInfo: Department;
  permissions: Set<Permission>;
  signedInAt: string;
};
type AuthContextValue = {
  user: CurrentUser | null;
  loading: boolean;
  login: (request: LoginRequest & { remember: boolean }) => Promise<LoginSuccess>;
  logout: () => void;
  refreshSession: (signedInAt: string) => void;
  syncUser: (user: AuthUser) => void;
  can: (permission: Permission) => boolean;
};
const AuthContext = createContext<AuthContextValue | null>(null);
function buildCurrentUser(user: AuthUser, signedInAt: string): CurrentUser {
  const primaryRole = ROLES[user.roles[0]];
  if (user.roles.length !== 1 || !primaryRole || !DEPARTMENTS[user.department] || primaryRole.department !== user.department
    || (!IS_MOCK_AUTH && !Array.isArray(user.permissions))) throw new Error('Invalid Identity configuration');
  return { ...user, primaryRole, departmentInfo: DEPARTMENTS[user.department],
    permissions: IS_MOCK_AUTH ? mergePermissions(user.roles) : new Set(user.permissions), signedInAt };
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setBootstrapError(false);
    void authApi.restore().then(result => {
      if (active) { setUser(result ? buildCurrentUser(result.user, result.signedInAt) : null); setLoading(false); }
    }).catch(() => { if (active) { setBootstrapError(true); setLoading(false); } });
    return () => { active = false; };
  }, [retry]);
  useEffect(() => {
    function onEnded(event: Event) {
      const code = (event as CustomEvent<string>).detail;
      const reason: SignOutReason = ['password-changed', 'locked', 'disabled', 'permissions-changed'].includes(code) ? code as SignOutReason : 'expired';
      signOutNotice.save({ reason, identifier: user?.username ?? '' });
      sessionStore.clear(); setUser(null);
    }
    window.addEventListener('qtkd:session-ended', onEnded);
    return () => window.removeEventListener('qtkd:session-ended', onEnded);
  }, [user?.username]);
  const login = useCallback(async (request: LoginRequest & { remember: boolean }) => {
    const result = await authApi.login(request);
    const resolved = buildCurrentUser(result.user, result.signedInAt);
    sessionStore.save({ userId: result.user.id, signedInAt: result.signedInAt, lastActiveAt: Date.now() }, request.remember);
    signOutNotice.clear(); setUser(resolved); return result;
  }, []);
  const logout = useCallback(() => { clearApiAuth(); sessionStore.clear(); setUser(null); }, []);
  const syncUser = useCallback((next: AuthUser) => setUser(current => {
    if (!current) return null;
    if (current.id === next.id && current.username === next.username && current.roles[0] === next.roles[0] && current.department === next.department) {
      return current;
    }
    return buildCurrentUser(next, current.signedInAt);
  }), []);
  const refreshSession = useCallback((signedInAt: string) => {
    sessionStore.update({ signedInAt, lastActiveAt: Date.now() });
    if (IS_MOCK_AUTH) { setUser(current => current ? { ...current, signedInAt, mustChangePassword: false } : null); return; }
    void authApi.checkSession('', signedInAt).then(check => { if (check.status === 'active') setUser(buildCurrentUser(check.user, signedInAt)); }).catch(() => undefined);
  }, []);
  const value = useMemo<AuthContextValue>(() => ({ user, loading, login, logout, refreshSession, syncUser, can: permission => Boolean(user?.permissions.has(permission)) }),
    [user, loading, login, logout, refreshSession, syncUser]);
  if (bootstrapError) return <main role="alert"><p>Chưa kết nối được dịch vụ xác thực. Vui lòng kiểm tra kết nối và thử lại.</p><button onClick={() => setRetry(value => value + 1)}>Thử lại</button></main>;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth phải dùng bên trong AuthProvider');
  return context;
}
