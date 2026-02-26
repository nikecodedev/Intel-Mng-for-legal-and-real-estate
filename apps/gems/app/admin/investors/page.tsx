'use client';

import { useQuery } from 'react-query';
import Link from 'next/link';
import { DataTable } from '@/components/tables/DataTable';
import { fetchInvestors, type InvestorListItem } from '@/lib/crm-api';

function formatDate(iso: string | undefined | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'short' });
  } catch {
    return String(iso);
  }
}

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
    { key: 'last_login_at', header: 'Last login', render: (row: InvestorListItem) => formatDate(row.last_login_at) },
    { key: 'created_at', header: 'Created', render: (row: InvestorListItem) => formatDate(row.created_at) },
  ];

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
        Loading investors…
      </div>
    );
  }

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
