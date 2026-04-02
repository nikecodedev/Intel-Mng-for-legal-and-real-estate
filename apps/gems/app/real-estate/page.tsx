'use client';

import { useQuery } from 'react-query';
import Link from 'next/link';
import { DataTable } from '@/components/tables/DataTable';
import { DateDisplay, BlockLoader } from '@/components/ui';
import { fetchAssets, type RealEstateAsset } from '@/lib/real-estate-api';

export default function RealEstateListPage() {
  const { data, isLoading, error } = useQuery('real-estate-assets', () => fetchAssets({ limit: 100 }), {
    staleTime: 60 * 1000,
  });

  const assets = data?.assets ?? [];
  const columns = [
    {
      key: 'asset_code',
      header: 'Código',
      render: (row: RealEstateAsset) => (
        <Link href={`/real-estate/${row.id}`} className="text-blue-600 hover:underline font-medium font-mono">
          {row.asset_code}
        </Link>
      ),
    },
    { key: 'property_address', header: 'Endereço', render: (row: RealEstateAsset) => (row.property_address || '—') },
    {
      key: 'current_state',
      header: 'Situação',
      render: (row: RealEstateAsset) => (
        <span className="inline-flex rounded px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800">
          {row.current_state}
        </span>
      ),
    },
    {
      key: 'auction_asset_id',
      header: 'Leilão',
      render: (row: RealEstateAsset) =>
        row.auction_asset_id ? (
          <Link href={`/auctions/${row.auction_asset_id}`} className="text-blue-600 hover:underline text-sm">
            Ver leilão
          </Link>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    { key: 'created_at', header: 'Criado em', render: (row: RealEstateAsset) => <DateDisplay value={row.created_at} style="short" /> },
  ];

  if (isLoading) return <BlockLoader message="Carregando ativos…" />;

  if (error) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
        Nenhum ativo imobiliário ainda.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href="/real-estate/new" className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Novo Ativo</Link>
      </div>
      <DataTable<RealEstateAsset>
        columns={columns}
        data={assets}
        keyExtractor={(row) => row.id}
        emptyMessage="Nenhum ativo imobiliário ainda."
      />
    </div>
  );
}
