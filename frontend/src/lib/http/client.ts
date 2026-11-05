// Access tokens exist in this module's memory only. Refresh credentials remain HttpOnly cookies.
export type ApiAuthResult = {
  accessToken: string;
  accessTokenExpiresAt: string;
  user: import('@/features/auth/types/auth').AuthUser;
  signedInAt: string;
  idleExpiresAt: string;
  expiresAt: string;
  previousLogin: import('@/features/auth/types/auth').LoginTrace | null;
  passwordChangedAt?: string;
};
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, readonly detail: { remainingAttempts?: number; lockedUntil?: string } = {}) { super(code); }
}
let token: string | null = null;
let generation = 0;
let refreshing: Promise<ApiAuthResult> | null = null;
let current: ApiAuthResult | null = null;
let signedOut = false;

async function raw<T>(path: string, init: RequestInit = {}, bearer?: string | null): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.method && init.method !== 'GET') { headers.set('Content-Type', 'application/json'); headers.set('X-QTKD-CSRF', '1'); }
  if (bearer) headers.set('Authorization', `Bearer ${bearer}`);
  const response = await fetch(`/api/v1${path}`, { ...init, headers, credentials: 'include', signal: init.signal ?? AbortSignal.timeout(30000) });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ code: 'SYSTEM_ERROR' }));
    throw new ApiError(response.status, body.code ?? 'SYSTEM_ERROR', body);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
export function acceptAuth(result: ApiAuthResult) {
  // The server contract requires exactly one recognized role; never infer permissions from an absent field.
  if (!result.user || !Array.isArray(result.user.roles) || result.user.roles.length !== 1 || !Array.isArray(result.user.permissions)
    || typeof result.accessToken !== 'string' || !result.accessToken) throw new ApiError(500, 'SYSTEM_ERROR');
  token = result.accessToken; current = result; signedOut = false;
  return result;
}
export function clearApiAuth() { generation++; token = null; current = null; refreshing = null; signedOut = true; }
export function apiAuthState() { return current; }
export function updateApiSession(view: { user: ApiAuthResult['user']; idleExpiresAt: string; expiresAt: string }) {
  if (current) current = { ...current, ...view };
}
export async function loginHttp(request: unknown) {
  clearApiAuth(); signedOut = false; const attempt = generation;
  const result = await raw<ApiAuthResult>('/auth/login', { method: 'POST', body: JSON.stringify(request) });
  if (attempt !== generation) throw new ApiError(401, 'SESSION_ENDED');
  return acceptAuth(result);
}
export function refreshHttp(): Promise<ApiAuthResult> {
  if (refreshing) return refreshing;
  const attempt = generation;
  const tokenBeforeLock = token;
  const refresh = async () => {
    // If another request or tab refreshed token while waiting for lock, reuse it safely
    if (token && token !== tokenBeforeLock && current) {
      return current;
    }
    signedOut = false;
    const result = await raw<ApiAuthResult>('/auth/refresh', { method: 'POST', body: '{}' });
    if (current && current.user.id !== result.user.id) throw new ApiError(401, 'permissions-changed');
    return acceptAuth(result);
  };
  // Cookie is shared across tabs: serialize rotations when the browser supports Web Locks.
  refreshing = ('locks' in navigator ? navigator.locks.request('qtkd-refresh', refresh) : refresh())
    .finally(() => { if (attempt === generation) refreshing = null; });
  return refreshing;
}
export async function apiRequest<T>(path: string, init: RequestInit = {}, notifyEnd = true): Promise<T> {
  if (signedOut) throw new ApiError(401, 'SESSION_ENDED');
  const attempt = generation;
  try {
    if (!token) await refreshHttp();
    try {
      return await raw<T>(path, init, token);
    }
    catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      const tokenBefore = token;
      // If token was already rotated by another in-flight call, retry directly with fresh token
      if (!token || token === tokenBefore) {
        await refreshHttp();
      }
      return await raw<T>(path, init, token);
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && attempt === generation) {
      if (notifyEnd) {
        clearApiAuth();
        window.dispatchEvent(new CustomEvent('qtkd:session-ended', { detail: error.code }));
      }
    }
    throw error; // A 403 never clears the login session.
  }
}
export async function logoutHttp() {
  clearApiAuth();
  await raw<void>('/auth/logout', { method: 'POST', body: '{}' });
}
