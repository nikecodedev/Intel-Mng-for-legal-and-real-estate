'use client';

import { useQuery } from 'react-query';
import Link from 'next/link';
import { DataTable } from '@/components/tables/DataTable';
import { fetchAssets, type RealEstateAsset } from '@/lib/real-estate-api';

function formatDate(iso: string | undefined | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'short' });
  } catch {
    return String(iso);
  }
}

export default function RealEstateListPage() {
  const { data, isLoading, error } = useQuery('real-estate-assets', () => fetchAssets({ limit: 100 }), {
    staleTime: 60 * 1000,
  });

  const assets = data?.assets ?? [];
  const columns = [
    {
      key: 'asset_code',
      header: 'Code',
      render: (row: RealEstateAsset) => (
        <Link href={`/real-estate/${row.id}`} className="text-blue-600 hover:underline font-medium font-mono">
          {row.asset_code}
        </Link>
      ),
    },
    { key: 'property_address', header: 'Address', render: (row: RealEstateAsset) => (row.property_address || '—') },
    {
      key: 'current_state',
      header: 'Status',
      render: (row: RealEstateAsset) => (
        <span className="inline-flex rounded px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800">
          {row.current_state}
        </span>
      ),
    },
    {
      key: 'auction_asset_id',
      header: 'Auction',
      render: (row: RealEstateAsset) =>
        row.auction_asset_id ? (
          <Link href={`/auctions/${row.auction_asset_id}`} className="text-blue-600 hover:underline text-sm">
            View auction
          </Link>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    { key: 'created_at', header: 'Created', render: (row: RealEstateAsset) => formatDate(row.created_at) },
  ];

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
        Loading assets…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        Failed to load assets. Please try again.
      </div>
    );
  }

  return (
    <DataTable<RealEstateAsset>
      columns={columns}
      data={assets}
      keyExtractor={(row) => row.id}
      emptyMessage="No real estate assets yet."
    />
  );
}
