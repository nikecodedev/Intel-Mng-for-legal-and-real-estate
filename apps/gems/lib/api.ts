/**
 * Axios instance and API helpers.
 * Base URL from NEXT_PUBLIC_API_URL.
 * Supports httpOnly cookie auth (NEXT_PUBLIC_AUTH_USE_COOKIES=true) or Bearer token.
 * Response interceptor: 401 → refresh or clear auth + redirect; 403 → toast + reject.
 */

import axios, { AxiosError, AxiosInstance } from 'axios';
import { getCookieAuth } from '@/lib/auth';
import { toast } from '@/contexts/ToastContext';

const baseURL =
  typeof process.env.NEXT_PUBLIC_API_URL === 'string' &&
  process.env.NEXT_PUBLIC_API_URL.trim() !== ''
    ? process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')
    : '';

/** API base URL: from env or at runtime (browser) fallback to origin + /api/v1 so register/login work without env. */
function getBaseURL(): string {
  if (baseURL) return baseURL;
  if (typeof window !== 'undefined') return `${window.location.origin}/api/v1`;
  return '';
}

export function getApiBaseUrl(): string {
  return getBaseURL();
}

export const api: AxiosInstance = axios.create({
  baseURL: '',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const base = getBaseURL();
  if (base) config.baseURL = base;
  if (typeof window === 'undefined') return config;
  if (getCookieAuth()) {
    config.withCredentials = true;
    return config;
  }
  try {
    const token = localStorage.getItem('access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {
    // ignore (e.g. private browsing)
  }
  return config;
});

// Refresh lock: prevent multiple 401s from triggering parallel refresh calls
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

function clearAuthAndRedirect(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event('auth:logout'));
  window.location.href = '/login';
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const requestUrl = error.config?.url || '';

    // === 401: Attempt silent token refresh, only logout if refresh fails ===
    if (status === 401 && typeof window !== 'undefined') {
      // Never logout on auth endpoints (login/register/refresh themselves)
      if (requestUrl.includes('/auth/')) {
        return Promise.reject(error);
      }

      const useCookies = getCookieAuth();
      if (useCookies) {
        // Cookie auth: can't refresh client-side, just reject (let the page handle it)
        return Promise.reject(error);
      }

      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        // No refresh token — user was never logged in or it was cleared
        return Promise.reject(error);
      }

      try {
        // Deduplicate concurrent refresh calls
        if (!isRefreshing) {
          isRefreshing = true;
          refreshPromise = axios
            .post<{ success: boolean; data?: { access_token: string } }>(
              `${getBaseURL()}/auth/refresh`,
              { refresh_token: refreshToken },
              { headers: { 'Content-Type': 'application/json' } }
            )
            .then(({ data }) => {
              if (data?.success && data.data?.access_token) {
                localStorage.setItem('access_token', data.data.access_token);
                return data.data.access_token;
              }
              return null;
            })
            .catch(() => null)
            .finally(() => {
              isRefreshing = false;
              refreshPromise = null;
            });
        }

        const newToken = await refreshPromise;
        if (newToken) {
          const original = error.config;
          if (original) {
            original.headers.Authorization = `Bearer ${newToken}`;
            return api(original);
          }
        }
      } catch {
        // Refresh failed — clear auth and redirect
        try {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('user');
        } catch {}
        if (typeof window !== 'undefined') window.location.href = '/login';
      }
    }

    // === 403: NEVER logout. Just reject the error — let the page show "access denied" ===
    // 403 means "you're authenticated but not authorized" — NOT "session expired"

    return Promise.reject(error);
  }
);

export function isApiError(error: unknown): error is AxiosError<{ error?: { message?: string }; message?: string }> {
  return axios.isAxiosError(error);
}

export function getApiErrorMessage(error: unknown): string {
  if (!isApiError(error)) return 'An error occurred';
  const data = error.response?.data;
  if (data && typeof data === 'object') {
    const errObj = (data as { error?: { message?: string; details?: { errors?: Array<{ path: string; message: string }> } }; message?: string }).error;
    if (errObj?.details?.errors?.length) {
      return errObj.details.errors.map((e) => e.message).join('. ');
    }
    const msg = errObj?.message ?? (data as { message?: string }).message;
    if (typeof msg === 'string') return msg;
  }
  return error.message || 'Request failed';
}

