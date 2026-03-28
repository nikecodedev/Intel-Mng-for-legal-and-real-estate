import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout title="CRM">{children}</DashboardLayout>;
}
