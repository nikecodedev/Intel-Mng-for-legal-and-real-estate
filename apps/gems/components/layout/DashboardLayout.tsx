'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import type { UserRole } from '@/lib/types';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

interface DashboardLayoutProps {
  title: string;
  children: React.ReactNode;
  /** Optional: restrict to these roles (e.g. admin only) */
  allowedRoles?: UserRole[];
}

export function DashboardLayout({ title, children, allowedRoles }: DashboardLayoutProps) {
  return (
    <ProtectedRoute allowedRoles={allowedRoles}>
      <div className="min-h-screen flex">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header />
          <main className="flex-1 p-6 bg-gray-50">
            <h1 className="text-xl font-semibold text-gray-900 mb-4">{title}</h1>
            {children}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
