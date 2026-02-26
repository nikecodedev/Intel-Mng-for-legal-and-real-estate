'use client';

import { useQuery } from 'react-query';
import Link from 'next/link';
import { DataTable } from '@/components/tables/DataTable';
import { DateDisplay, BlockLoader } from '@/components/ui';
import { fetchInvestors, type InvestorListItem } from '@/lib/crm-api';

export default function AdminInvestorsListPage() {
  const { data, isLoading, error } = useQuery('crm-investors', () => fetchInvestors({ limit: 100 }), {
    staleTime: 60 * 1000,
  });

  const investors = data?.investors ?? [];
  const columns = [
    {
      key: 'email',
      header: 'Investor',
      render: (row: InvestorListItem) => (
        <Link href={`/admin/investors/${row.id}`} className="text-blue-600 hover:underline font-medium">
          {row.email}
        </Link>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      render: (row: InvestorListItem) =>
        [row.first_name, row.last_name].filter(Boolean).join(' ') || '—',
    },
    { key: 'company_name', header: 'Company', render: (row: InvestorListItem) => row.company_name ?? '—' },
    {
      key: 'is_active',
      header: 'Active',
      render: (row: InvestorListItem) => (
        <span className={row.is_active ? 'text-green-600' : 'text-gray-500'}>
          {row.is_active ? 'Yes' : 'No'}
        </span>
      ),
    },
    { key: 'last_login_at', header: 'Last login', render: (row: InvestorListItem) => <DateDisplay value={row.last_login_at} style="short" /> },
    { key: 'created_at', header: 'Created', render: (row: InvestorListItem) => <DateDisplay value={row.created_at} style="short" /> },
  ];

  if (isLoading) return <BlockLoader message="Loading investors…" />;

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        Failed to load investors. Please try again.
      </div>
    );
  }

  return (
    <DataTable<InvestorListItem>
      columns={columns}
      data={investors}
      keyExtractor={(row) => row.id}
      emptyMessage="No investors yet."
    />
  );
}
