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

export function getApiBaseUrl(): string {
  return baseURL;
}

export const api: AxiosInstance = axios.create({
  baseURL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
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

    if (status === 401 && typeof window !== 'undefined') {
      const useCookies = getCookieAuth();
      if (useCookies) {
        toast('error', 'Session expired. Please sign in again.');
        clearAuthAndRedirect();
        return Promise.reject(error);
      }
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        try {
          const { data } = await axios.post<{ success: boolean; data?: { access_token: string } }>(
            `${baseURL}/auth/refresh`,
            { refresh_token: refreshToken },
            { headers: { 'Content-Type': 'application/json' } }
          );
          if (data?.success && data.data?.access_token) {
            localStorage.setItem('access_token', data.data.access_token);
            const original = error.config;
            if (original) {
              original.headers.Authorization = `Bearer ${data.data.access_token}`;
              return api(original);
            }
          }
        } catch {
          toast('error', 'Session expired. Please sign in again.');
          clearAuthAndRedirect();
          return Promise.reject(error);
        }
      } else {
        toast('error', 'Please sign in to continue.');
        clearAuthAndRedirect();
      }
    }

    if (status === 403 && typeof window !== 'undefined') {
      toast('error', getApiErrorMessage(error) || 'Access denied.');
    }

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
    const msg = (data as { error?: { message?: string }; message?: string }).error?.message
      ?? (data as { message?: string }).message;
    if (typeof msg === 'string') return msg;
  }
  return error.message || 'Request failed';
}

