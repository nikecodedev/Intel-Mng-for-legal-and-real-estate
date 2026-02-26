'use client';

import { useQuery } from 'react-query';
import Link from 'next/link';
import { DataTable } from '@/components/tables/DataTable';
import { DateDisplay, BlockLoader } from '@/components/ui';
import { RiskIndicator } from '@/components/auctions/RiskIndicator';
import { fetchAuctions, type AuctionAsset, type RiskLevel } from '@/lib/auction-api';

export default function AuctionsListPage() {
  const { data, isLoading, error } = useQuery('auctions-list', () => fetchAuctions({ limit: 100 }), {
    staleTime: 60 * 1000,
  });

  const assets = data?.data?.assets ?? [];
  const columns = [
    {
      key: 'title',
      header: 'Auction',
      render: (row: AuctionAsset) => (
        <Link href={`/auctions/${row.id}`} className="text-blue-600 hover:underline font-medium">
          {row.title || row.asset_reference || `Auction ${row.id.slice(0, 8)}`}
        </Link>
      ),
    },
    {
      key: 'current_stage',
      header: 'MPGA stage',
      render: (row: AuctionAsset) => (
        <span className="font-mono text-sm">{row.current_stage}</span>
      ),
    },
    {
      key: 'risk',
      header: 'Risk',
      render: (row: AuctionAsset) => (
        <RiskIndicator riskLevel={(row.risk_level as RiskLevel) || 'LOW'} riskScore={row.risk_score} showScore />
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (row: AuctionAsset) => <DateDisplay value={row.created_at} style="short" />,
    },
  ];

  if (isLoading) return <BlockLoader message="Loading auctions…" />;

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        Failed to load auctions. Please try again.
      </div>
    );
  }

  return (
    <DataTable<AuctionAsset>
      columns={columns}
      data={assets}
      keyExtractor={(row) => row.id}
      emptyMessage="No auctions yet."
    />
  );
}
