'use client';

import { useState } from 'react';
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <ProtectedRoute allowedRoles={allowedRoles}>
      <div className="min-h-screen flex bg-slate-50">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex-1 flex flex-col min-w-0">
          <Header onMenuToggle={() => setSidebarOpen((prev) => !prev)} />
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl">
              <h1 className="page-title mb-6">{title}</h1>
              {children}
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
