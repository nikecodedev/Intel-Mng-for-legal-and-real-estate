/**
 * Investor portal authentication utilities.
 *
 * Token lifecycle:
 *  - access_token (15min) stored in sessionStorage as 'investor_token'
 *  - refresh_token (7d)  stored in sessionStorage as 'investor_refresh_token'
 *
 * On 401: automatically attempts one refresh cycle then retries the original request.
 * If refresh fails (token expired/revoked), clears session and returns null.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

if (
  typeof window !== 'undefined' &&
  process.env.NODE_ENV === 'production' &&
  !process.env.NEXT_PUBLIC_API_URL
) {
  console.error('[Config] NEXT_PUBLIC_API_URL is not set. API calls will target localhost:3000 — this will fail in production. Set NEXT_PUBLIC_API_URL at build time.');
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('investor_token');
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('investor_refresh_token');
}

export function clearSession(): void {
  sessionStorage.removeItem('investor_token');
  sessionStorage.removeItem('investor_refresh_token');
}

export function saveTokens(accessToken: string, refreshToken?: string): void {
  sessionStorage.setItem('investor_token', accessToken);
  if (refreshToken) sessionStorage.setItem('investor_refresh_token', refreshToken);
}

/**
 * Attempt to refresh the access token using the stored refresh token.
 * Handles refresh token rotation — the server may return a new refresh token.
 * Returns the new access token, or null if refresh fails.
 */
export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      clearSession();
      return null;
    }

    const data = await res.json();
    const newAccessToken: string | undefined = data?.data?.access_token ?? data?.data?.tokens?.access_token;
    // Store rotated refresh token if server returned one
    const newRefreshToken: string | undefined = data?.data?.refresh_token;

    if (!newAccessToken) {
      clearSession();
      return null;
    }

    saveTokens(newAccessToken, newRefreshToken);
    return newAccessToken;
  } catch {
    return null;
  }
}

/** Default request timeout in milliseconds. */
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Authenticated fetch with automatic token refresh on 401 and a 15s timeout.
 * Returns null if the session is expired and refresh failed.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<{ data: T; ok: true } | { data: null; ok: false; status: number; expired: boolean }> {
  let token = getToken();
  if (!token) return { data: null, ok: false, status: 401, expired: true };

  const doFetch = (t: string) => {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(`${API}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${t}`,
        ...(options.headers ?? {}),
      },
      cache: 'no-store',
      signal: controller.signal,
    }).finally(() => clearTimeout(tid));
  };

  let res: Response;
  try {
    res = await doFetch(token);
  } catch {
    // Timeout or network error
    return { data: null, ok: false, status: 0, expired: false };
  }

  // On 401, try to refresh once then retry
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (!newToken) return { data: null, ok: false, status: 401, expired: true };
    try {
      res = await doFetch(newToken);
    } catch {
      return { data: null, ok: false, status: 0, expired: false };
    }
  }

  if (!res.ok) {
    return { data: null, ok: false, status: res.status, expired: false };
  }

  const json = await res.json() as T;
  return { data: json, ok: true };
}
