import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function RealEstateLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout title="Real Estate">{children}</DashboardLayout>;
}
