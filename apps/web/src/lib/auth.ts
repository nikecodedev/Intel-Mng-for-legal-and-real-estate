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
 * Returns the new access token, or null if refresh fails.
 */
export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      clearSession();
      return null;
    }

    const data = await res.json();
    const newAccessToken: string | undefined = data?.data?.tokens?.access_token ?? data?.tokens?.access_token;
    if (!newAccessToken) {
      clearSession();
      return null;
    }

    saveTokens(newAccessToken);
    return newAccessToken;
  } catch {
    return null;
  }
}

/**
 * Authenticated fetch with automatic token refresh on 401.
 * Returns null if the session is expired and refresh failed.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<{ data: T; ok: true } | { data: null; ok: false; status: number; expired: boolean }> {
  let token = getToken();
  if (!token) return { data: null, ok: false, status: 401, expired: true };

  const doFetch = (t: string) =>
    fetch(`${API}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${t}`,
        ...(options.headers ?? {}),
      },
      cache: 'no-store',
    });

  let res = await doFetch(token);

  // On 401, try to refresh once
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (!newToken) return { data: null, ok: false, status: 401, expired: true };
    res = await doFetch(newToken);
  }

  if (!res.ok) {
    return { data: null, ok: false, status: res.status, expired: false };
  }

  const json = await res.json() as T;
  return { data: json, ok: true };
}
