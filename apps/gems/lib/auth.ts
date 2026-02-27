/**
 * Auth helpers: token storage and validation.
 * Auth state is held in AuthContext (contexts/AuthContext.tsx).
 * When using httpOnly cookies, tokens are not stored in frontend.
 */

import type { User, UserRole } from '@/lib/types';

export const AUTH_ACCESS_KEY = 'access_token';
export const AUTH_REFRESH_KEY = 'refresh_token';
export const AUTH_USER_KEY = 'user';

/** When true, backend must set JWT in httpOnly cookie; we use withCredentials and do not store tokens. */
export function getCookieAuth(): boolean {
  if (typeof process.env.NEXT_PUBLIC_AUTH_USE_COOKIES === 'string') {
    return process.env.NEXT_PUBLIC_AUTH_USE_COOKIES === 'true' || process.env.NEXT_PUBLIC_AUTH_USE_COOKIES === '1';
  }
  return false;
}

export function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(AUTH_ACCESS_KEY);
  } catch {
    return null;
  }
}

export function getStoredRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(AUTH_REFRESH_KEY);
  } catch {
    return null;
  }
}

export function setStoredAuth(accessToken: string, refreshToken: string | undefined, userJson: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AUTH_ACCESS_KEY, accessToken);
    if (refreshToken) localStorage.setItem(AUTH_REFRESH_KEY, refreshToken);
    localStorage.setItem(AUTH_USER_KEY, userJson);
  } catch {
    // ignore (e.g. private browsing, quota)
  }
}

export function clearStoredAuth(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(AUTH_ACCESS_KEY);
    localStorage.removeItem(AUTH_REFRESH_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
  } catch {
    // ignore
  }
}

const ROLES: UserRole[] = ['OWNER', 'REVISOR', 'OPERATIONAL', 'INVESTOR'];

export function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && 'id' in parsed && 'email' in parsed && 'tenant_id' in parsed) {
      const p = parsed as Record<string, unknown>;
      const role = typeof p.role === 'string' && ROLES.includes(p.role as UserRole) ? (p.role as UserRole) : undefined;
      return {
        id: String(p.id),
        email: String(p.email),
        first_name: p.first_name != null ? String(p.first_name) : null,
        last_name: p.last_name != null ? String(p.last_name) : null,
        tenant_id: String(p.tenant_id),
        role,
        tenant_name: p.tenant_name != null ? String(p.tenant_name) : null,
      };
    }
  } catch {
    // ignore (localStorage or JSON parse)
  }
  return null;
}
