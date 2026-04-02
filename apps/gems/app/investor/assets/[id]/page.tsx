'use client';

import { useState } from 'react';
import { useQuery } from 'react-query';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function InvestorAssetDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [inquireLoading, setInquireLoading] = useState(false);
  const [inquireMsg, setInquireMsg] = useState('');

  const { data: asset, isLoading } = useQuery(['investor-asset', id], async () => {
    const res = await api.get(`/investor/assets/${id}`);
    return res.data?.asset ?? res.data?.data ?? res.data;
  }, { staleTime: 60_000, retry: false });

  async function handleInquire() {
    setInquireLoading(true); setInquireMsg('');
    try {
      await api.post(`/investor/assets/${id}/inquire`);
      setInquireMsg('Interest expressed successfully.');
    } catch (err: any) {
      setInquireMsg(err?.response?.data?.message || 'Failed to express interest.');
    } finally {
      setInquireLoading(false);
    }
  }

  if (isLoading) return <p className="text-sm text-gray-500">Loading...</p>;
  if (!asset) return <p className="text-sm text-red-600">Asset not found.</p>;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">{asset.title || asset.asset_reference || `Asset ${id.slice(0, 8)}`}</h1>
        <Link href="/investor/assets" className="text-sm text-blue-600 hover:underline">Back to assets</Link>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-600">Type</dt><dd className="font-medium">{asset.auction_type ?? asset.property_type ?? '-'}</dd>
          <dt className="text-gray-600">Stage</dt><dd className="font-medium">{asset.current_stage ?? asset.current_state ?? '-'}</dd>
          <dt className="text-gray-600">Address</dt><dd className="font-medium">{asset.property_address ?? '-'}</dd>
          <dt className="text-gray-600">Risk Score</dt><dd className="font-medium">{asset.risk_score ?? '-'}%</dd>
        </dl>
      </section>

      <div className="flex items-center gap-3">
        <button onClick={handleInquire} disabled={inquireLoading} className="rounded bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
          {inquireLoading ? 'Expressing Interest...' : 'Express Interest'}
        </button>
        {inquireMsg && <p className={`text-sm ${inquireMsg.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>{inquireMsg}</p>}
      </div>
    </div>
  );
}
