'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { getCookieAuth } from '@/lib/auth';
import {
  clearStoredAuth,
  getStoredAccessToken,
  getStoredUser,
  setStoredAuth,
} from '@/lib/auth';
import type { AuthMeResponse, LoginResponse, User, UserRole } from '@/lib/types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isInitialized: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User | null) => void;
  hasRole: (role: UserRole) => boolean;
  hasAnyRole: (roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    isInitialized: false,
    isAuthenticated: false,
  });

  const cookieAuth = getCookieAuth();

  const fetchSession = useCallback(async () => {
    if (!cookieAuth) return;
    try {
      const { data } = await api.get<AuthMeResponse>('/auth/me');
      if (data?.success && data.data?.user) {
        const user = data.data.user as User;
        if (!user.tenant_id && (user as unknown as Record<string, string>).tenant_id)
          user.tenant_id = (user as unknown as Record<string, string>).tenant_id;
        setState((prev) => ({
          ...prev,
          user,
          accessToken: 'cookie',
          isInitialized: true,
          isAuthenticated: true,
        }));
        return;
      }
    } catch {
      // not logged in or session expired
    }
    setState((prev) => ({ ...prev, isInitialized: true, isAuthenticated: false }));
  }, [cookieAuth]);

  const initialize = useCallback(() => {
    if (cookieAuth) {
      fetchSession();
      return;
    }
    const token = getStoredAccessToken();
    const user = getStoredUser();
    setState({
      user,
      accessToken: token,
      isInitialized: true,
      isAuthenticated: Boolean(token && user),
    });
  }, [cookieAuth, fetchSession]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleLogout = () => {
      clearStoredAuth();
      setState((prev) => ({
        ...prev,
        user: null,
        accessToken: null,
        isAuthenticated: false,
      }));
    };
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await api.post<LoginResponse>('/auth/login', { email, password });
      if (!data?.success || !data.data?.user) {
        throw new Error('Invalid login response');
      }
      const { user, tokens } = data.data;
      if (cookieAuth) {
        setState({
          user: user as User,
          accessToken: 'cookie',
          isInitialized: true,
          isAuthenticated: true,
        });
        return;
      }
      if (!tokens?.access_token) throw new Error('Invalid login response');
      setStoredAuth(tokens.access_token, tokens.refresh_token, JSON.stringify(user));
      setState({
        user: user as User,
        accessToken: tokens.access_token,
        isInitialized: true,
        isAuthenticated: true,
      });
    },
    [cookieAuth]
  );

  const logout = useCallback(async () => {
    if (cookieAuth) {
      try {
        await api.post('/auth/logout', { refresh_token: '' });
      } catch {
        // ignore
      }
    }
    clearStoredAuth();
    setState((prev) => ({
      ...prev,
      user: null,
      accessToken: null,
      isAuthenticated: false,
    }));
  }, [cookieAuth]);

  const setUser = useCallback((user: User | null) => {
    setState((prev) => ({
      ...prev,
      user,
      isAuthenticated: Boolean(prev.accessToken && user),
    }));
  }, []);

  const hasRole = useCallback(
    (role: UserRole): boolean => {
      return state.user?.role === role;
    },
    [state.user?.role]
  );

  const hasAnyRole = useCallback(
    (roles: UserRole[]): boolean => {
      if (!state.user?.role) return roles.length === 0;
      return roles.includes(state.user.role);
    },
    [state.user?.role]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      logout,
      setUser,
      hasRole,
      hasAnyRole,
    }),
    [state, login, logout, setUser, hasRole, hasAnyRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx == null) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
