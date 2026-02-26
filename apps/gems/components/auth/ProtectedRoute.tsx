'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/lib/types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** If set, only these roles can access. Empty array = no role check. */
  allowedRoles?: UserRole[];
  /** Where to redirect when unauthenticated (default: /login) */
  loginPath?: string;
  /** Where to redirect when authenticated but wrong role (default: /dashboard) */
  fallbackPath?: string;
}

/**
 * Wrapper that redirects unauthenticated users to login and optionally
 * enforces role-based access. Use around any route that requires auth.
 */
export function ProtectedRoute({
  children,
  allowedRoles,
  loginPath = '/login',
  fallbackPath = '/dashboard',
}: ProtectedRouteProps) {
  const { isAuthenticated, isInitialized, hasAnyRole } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isInitialized) return;
    if (!isAuthenticated) {
      const search = pathname ? `?redirect=${encodeURIComponent(pathname)}` : '';
      router.replace(`${loginPath}${search}`);
      return;
    }
    if (allowedRoles && allowedRoles.length > 0 && !hasAnyRole(allowedRoles)) {
      router.replace(fallbackPath);
    }
  }, [isInitialized, isAuthenticated, allowedRoles, hasAnyRole, router, loginPath, fallbackPath, pathname]);

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (allowedRoles && allowedRoles.length > 0 && !hasAnyRole(allowedRoles)) {
    return null;
  }

  return <>{children}</>;
}
