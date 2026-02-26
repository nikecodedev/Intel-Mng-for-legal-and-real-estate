'use client';

import { use } from 'react';
import { useQuery } from 'react-query';
import Link from 'next/link';
import {
  fetchInvestorById,
  fetchInvestorAssignedAssets,
  fetchMatchesForInvestor,
  type AssignedAssetItem,
  type MatchRecord,
} from '@/lib/crm-api';
function formatDate(iso: string | undefined | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
  } catch {
    return String(iso);
  }
}

function matchScoreColor(score: number) {
  if (score >= 80) return 'text-green-700 bg-green-100';
  if (score >= 50) return 'text-amber-700 bg-amber-100';
  return 'text-gray-700 bg-gray-100';
}

export default function AdminInvestorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data: investor, isLoading: invLoading, error: invError } = useQuery(
    ['crm-investor', id],
    () => fetchInvestorById(id),
    { staleTime: 60 * 1000 }
  );
  const { data: assignedAssets = [], isLoading: assetsLoading } = useQuery(
    ['crm-investor-assigned', id],
    () => fetchInvestorAssignedAssets(id),
    { staleTime: 60 * 1000, enabled: !!id }
  );
  const { data: matchesData, isLoading: matchesLoading } = useQuery(
    ['matching-matches', id],
    () => fetchMatchesForInvestor(id, { limit: 50 }),
    { staleTime: 60 * 1000, enabled: !!id, retry: false }
  );
  const matches = matchesData?.matches ?? [];

  if (invLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
        Loading investor…
      </div>
    );
  }

  if (invError || !investor) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        Investor not found or you don’t have access.
      </div>
    );
  }

  const name = [investor.first_name, investor.last_name].filter(Boolean).join(' ') || investor.email;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{name}</h2>
        <Link href="/admin/investors" className="text-sm text-blue-600 hover:underline">
          ← Back to list
        </Link>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Investor details</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-600">Email</dt>
          <dd className="font-medium">{investor.email}</dd>
          <dt className="text-gray-600">Company</dt>
          <dd className="font-medium">{investor.company_name ?? '—'}</dd>
          <dt className="text-gray-600">Active</dt>
          <dd className="font-medium">{investor.is_active ? 'Yes' : 'No'}</dd>
          <dt className="text-gray-600">Last login</dt>
          <dd className="font-medium">{formatDate(investor.last_login_at)}</dd>
          <dt className="text-gray-600">Created</dt>
          <dd className="font-medium">{formatDate(investor.created_at)}</dd>
        </dl>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Assigned assets</h3>
        {assetsLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : assignedAssets.length === 0 ? (
          <p className="text-sm text-gray-500">No assigned assets.</p>
        ) : (
          <ul className="space-y-2">
            {(assignedAssets as AssignedAssetItem[]).map((item) => (
              <li key={item.link_id} className="flex items-center justify-between text-sm">
                <Link
                  href={`/auctions/${item.asset.id}`}
                  className="text-blue-600 hover:underline"
                >
                  {item.asset.title || item.asset.asset_reference || item.asset.id.slice(0, 8)}
                </Link>
                <span className="text-gray-500">
                  Stage: {item.asset.current_stage} · Risk: {item.asset.risk_score}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Match scores</h3>
        {matchesLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : matches.length === 0 ? (
          <p className="text-sm text-gray-500">No match records. Run matching to see scores.</p>
        ) : (
          <ul className="space-y-2">
            {(matches as MatchRecord[]).map((m) => (
              <li key={m.id} className="flex items-center justify-between text-sm">
                <Link href={`/auctions/${m.auction_asset_id}`} className="text-blue-600 hover:underline">
                  Asset {m.auction_asset_id?.slice(0, 8) ?? m.id}
                </Link>
                <span
                  className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${matchScoreColor(Number(m.match_score))}`}
                  title="Match score (backend)"
                >
                  {m.match_score}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
