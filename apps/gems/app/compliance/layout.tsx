import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function ComplianceLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout title="Compliance">{children}</DashboardLayout>;
}
