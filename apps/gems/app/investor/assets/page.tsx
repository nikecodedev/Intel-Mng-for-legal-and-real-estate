'use client';

import { useQuery } from 'react-query';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function InvestorAssetsPage() {
  const { data, isLoading } = useQuery('investor-assets', async () => {
    const res = await api.get('/investor/assets', { params: { limit: 100 } });
    return res.data?.assets ?? res.data?.data ?? [];
  }, { staleTime: 60_000, retry: false });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">My Assets</h1>
      {isLoading ? <p className="text-sm text-gray-500">Loading...</p> : !data || data.length === 0 ? (
        <p className="text-sm text-gray-500">No assets available.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((a: any) => (
            <Link key={a.id} href={`/investor/assets/${a.id}`} className="rounded-lg border border-gray-200 bg-white p-5 hover:border-blue-300 hover:shadow-sm transition-all">
              <h3 className="font-medium text-gray-900">{a.title || a.asset_reference || `Asset ${a.id.slice(0, 8)}`}</h3>
              <p className="text-sm text-gray-500 mt-1">{a.property_address ?? a.auction_type ?? '-'}</p>
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700">{a.current_stage ?? a.current_state ?? '-'}</span>
                {a.risk_score != null && <span className="text-xs text-gray-500">Risk: {a.risk_score}%</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
