'use client';

import { useQuery } from 'react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { StatCardSkeleton } from '@/components/ui/Skeleton';
import { UpcomingDeadlines } from '@/components/dashboard/UpcomingDeadlines';
import {
  fetchDocumentsTotal,
  fetchSanitationPending,
  fetchActiveAuctionsCount,
  fetchAssetsInRenovation,
  fetchPendingFinancialApprovals,
  fetchUpcomingDeadlines,
} from '@/lib/dashboard-api';

export default function DashboardPage() {
  const documentsQuery = useQuery('dashboard-documents', fetchDocumentsTotal, {
    staleTime: 60 * 1000,
    retry: 1,
  });
  const sanitationQuery = useQuery('dashboard-sanitation', fetchSanitationPending, {
    staleTime: 60 * 1000,
    retry: 1,
  });
  const auctionsQuery = useQuery('dashboard-auctions', fetchActiveAuctionsCount, {
    staleTime: 60 * 1000,
    retry: 1,
  });
  const renovationQuery = useQuery('dashboard-renovation', fetchAssetsInRenovation, {
    staleTime: 60 * 1000,
    retry: 1,
  });
  const payablesQuery = useQuery('dashboard-payables', fetchPendingFinancialApprovals, {
    staleTime: 60 * 1000,
    retry: 1,
  });
  const deadlinesQuery = useQuery('dashboard-deadlines', fetchUpcomingDeadlines, {
    staleTime: 60 * 1000,
    retry: 1,
  });

  return (
    <DashboardLayout title="Dashboard">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {documentsQuery.isLoading ? (
          <StatCardSkeleton />
        ) : (
          <StatCard
            label="Total documents"
            value={documentsQuery.data ?? 0}
            error={documentsQuery.isError}
          />
        )}
        {sanitationQuery.isLoading ? (
          <StatCardSkeleton />
        ) : (
          <StatCard
            label="Documents pending sanitation"
            value={sanitationQuery.data ?? 0}
            error={sanitationQuery.isError}
          />
        )}
        {auctionsQuery.isLoading ? (
          <StatCardSkeleton />
        ) : (
          <StatCard
            label="Active auctions"
            value={auctionsQuery.data ?? 0}
            error={auctionsQuery.isError}
          />
        )}
        {renovationQuery.isLoading ? (
          <StatCardSkeleton />
        ) : (
          <StatCard
            label="Assets in renovation"
            value={renovationQuery.data ?? 0}
            error={renovationQuery.isError}
          />
        )}
        {payablesQuery.isLoading ? (
          <StatCardSkeleton />
        ) : (
          <StatCard
            label="Pending financial approvals"
            value={payablesQuery.data ?? 0}
            error={payablesQuery.isError}
          />
        )}
      </div>

      <div className="mt-6">
        {deadlinesQuery.isLoading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <StatCardSkeleton />
          </div>
        ) : deadlinesQuery.isError ? (
          <UpcomingDeadlines
            total={0}
            overdueCount={0}
            dueTodayCount={0}
            dueThisWeekCount={0}
            critical={[]}
            error
          />
        ) : deadlinesQuery.data ? (
          <UpcomingDeadlines
            total={deadlinesQuery.data.total_deadlines}
            overdueCount={deadlinesQuery.data.overdue_count}
            dueTodayCount={deadlinesQuery.data.due_today_count}
            dueThisWeekCount={deadlinesQuery.data.due_this_week_count}
            critical={deadlinesQuery.data.critical_deadlines ?? []}
          />
        ) : (
          <UpcomingDeadlines
            total={0}
            overdueCount={0}
            dueTodayCount={0}
            dueThisWeekCount={0}
            critical={[]}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
