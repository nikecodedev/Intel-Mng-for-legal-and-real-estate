import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function KnowledgeLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout title="Knowledge">{children}</DashboardLayout>;
}
