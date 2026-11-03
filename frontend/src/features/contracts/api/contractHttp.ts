import { ApiError as IdentityApiError, apiAuthState, clearApiAuth, refreshHttp } from '@/lib/http/client';
// The identity module supplies its existing access token at application startup.
type TokenProvider = () => string | null | Promise<string | null>;
let tokenProvider: TokenProvider = async () => {
  const current = apiAuthState();
  if (current && Date.parse(current.accessTokenExpiresAt) > Date.now() + 5000) return current.accessToken;
  return (await refreshHttp()).accessToken;
};
export function configureContractTokenProvider(provider: TokenProvider): void {
  tokenProvider = provider;
}
export async function getContractAccessToken(): Promise<string | null> {
  try {
    return await tokenProvider();
  } catch (error) {
    if (!(error instanceof IdentityApiError)) throw error;

    const details: Record<string, unknown> = { ...error.detail };
    if (error.status === 401) {
      const reasons = ['expired', 'password-changed', 'locked', 'disabled', 'permissions-changed'];
      details.sessionStatus = reasons.includes(error.code) ? error.code : 'expired';
      clearApiAuth();
      window.dispatchEvent(new CustomEvent('qtkd:session-ended', { detail: error.code }));
    }
    throw new ApiError(error.code, error.status, details);
  }
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = await getContractAccessToken();

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, { ...init, headers });
  } catch {
    throw new ApiError('NETWORK', 0);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    throw new ApiError(String(body.code ?? 'SYSTEM_ERROR'), response.status, body);
  }

  return body as T;
}

export const json = (value: unknown) => JSON.stringify(value);
