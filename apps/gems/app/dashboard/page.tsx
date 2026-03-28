'use client';

import { useQuery } from 'react-query';
import { useAuth } from '@/contexts/AuthContext';
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
  const { user } = useAuth();

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

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  const displayName = (() => {
    const first = user?.first_name?.trim();
    if (first) return first;
    return null;
  })();

  return (
    <DashboardLayout title="Dashboard">
      {/* Welcome section */}
      <div className="mb-8">
        <p className="text-lg text-gray-600">
          {greeting}{displayName ? `, ${displayName}` : ''}. Here is your overview.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
            label="Pending sanitation"
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
            label="In renovation"
            value={renovationQuery.data ?? 0}
            error={renovationQuery.isError}
          />
        )}
        {payablesQuery.isLoading ? (
          <StatCardSkeleton />
        ) : (
          <StatCard
            label="Financial approvals"
            value={payablesQuery.data ?? 0}
            error={payablesQuery.isError}
          />
        )}
      </div>

      {/* Deadlines section */}
      <div className="mt-8">
        {deadlinesQuery.isLoading ? (
          <div className="card p-6">
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
            total={deadlinesQuery.data.total_deadlines ?? 0}
            overdueCount={deadlinesQuery.data.overdue_count ?? 0}
            dueTodayCount={deadlinesQuery.data.due_today_count ?? 0}
            dueThisWeekCount={deadlinesQuery.data.due_this_week_count ?? 0}
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
