'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function IntelligenceLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout title="Inteligência">
      {children}
    </DashboardLayout>
  );
}
