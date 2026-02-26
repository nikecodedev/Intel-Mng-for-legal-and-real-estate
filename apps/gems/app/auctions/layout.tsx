import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function AuctionsLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout title="Auctions">{children}</DashboardLayout>;
}
