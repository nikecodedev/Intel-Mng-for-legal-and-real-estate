'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function EscritoriosLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout title="Escritórios Parceiros">
      {children}
    </DashboardLayout>
  );
}
