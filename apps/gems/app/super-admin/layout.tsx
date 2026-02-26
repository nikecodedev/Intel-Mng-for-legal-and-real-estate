'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';

/**
 * Super Admin: platform-level tenant management. OWNER only.
 */
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout title="Super Admin" allowedRoles={['OWNER']}>{children}</DashboardLayout>;
}
