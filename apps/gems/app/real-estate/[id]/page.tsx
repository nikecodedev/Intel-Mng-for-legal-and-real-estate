'use client';

import { use } from 'react';
import { useQuery } from 'react-query';
import Link from 'next/link';
import { DateDisplay, CurrencyDisplay, BlockLoader } from '@/components/ui';
import { fetchAssetById, fetchCostBreakdown, type RealEstateAsset } from '@/lib/real-estate-api';
import { StatusProgressionTimeline } from '@/components/real-estate/StatusProgressionTimeline';

export default function RealEstateAssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data: asset, isLoading: assetLoading, error: assetError } = useQuery(
    ['real-estate-asset', id],
    () => fetchAssetById(id),
    { staleTime: 60 * 1000 }
  );

  const { data: breakdown, isLoading: breakdownLoading, error: breakdownError } = useQuery(
    ['real-estate-cost-breakdown', id],
    () => fetchCostBreakdown(id),
    { staleTime: 60 * 1000, retry: false }
  );

  if (assetLoading) return <BlockLoader message="Loading asset…" />;

  if (assetError || !asset) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        Asset not found or you don’t have access.
      </div>
    );
  }

  const a = asset as RealEstateAsset;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 font-mono">{a.asset_code}</h2>
        <Link href="/real-estate" className="text-sm text-blue-600 hover:underline">
          ← Back to list
        </Link>
      </div>

      {/* Basic info */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Property</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-600">Address</dt>
          <dd className="font-medium">{a.property_address}</dd>
          <dt className="text-gray-600">Type</dt>
          <dd className="font-medium">{a.property_type ?? '—'}</dd>
          <dt className="text-gray-600">Size (m²)</dt>
          <dd className="font-medium">{a.property_size_sqm ?? '—'}</dd>
          <dt className="text-gray-600">Rooms</dt>
          <dd className="font-medium">{a.number_of_rooms ?? '—'}</dd>
          <dt className="text-gray-600">Acquisition date</dt>
          <dd className="font-medium"><DateDisplay value={a.acquisition_date} style="short" /></dd>
          <dt className="text-gray-600">Acquisition price</dt>
          <dd className="font-medium">
            {a.acquisition_price_cents != null ? <CurrencyDisplay cents={a.acquisition_price_cents} /> : '—'}
          </dd>
        </dl>
      </section>

      {/* Status progression timeline */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-4">Status progression</h3>
        <StatusProgressionTimeline
          currentState={a.current_state}
          stateChangedAt={a.state_changed_at}
          stateChangeReason={a.state_change_reason}
        />
      </section>

      {/* Cost breakdown */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Cost breakdown</h3>
        {breakdownLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {breakdownError ? (
          <p className="text-sm text-gray-500">Cost breakdown not available.</p>
        ) : null}
        {breakdown && !breakdownError && breakdown.formatted && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-600">Acquisition (price)</dt>
            <dd className="font-medium">{breakdown.formatted.acquisition_price}</dd>
            <dt className="text-gray-600">Acquisition (costs)</dt>
            <dd className="font-medium">{breakdown.formatted.acquisition_cost}</dd>
            <dt className="text-gray-600">Regularization</dt>
            <dd className="font-medium">{breakdown.formatted.regularization_cost}</dd>
            <dt className="text-gray-600">Renovation</dt>
            <dd className="font-medium">{breakdown.formatted.renovation_cost}</dd>
            <dt className="text-gray-600">Maintenance</dt>
            <dd className="font-medium">{breakdown.formatted.maintenance_cost}</dd>
            <dt className="text-gray-600">Taxes</dt>
            <dd className="font-medium">{breakdown.formatted.taxes_cost}</dd>
            <dt className="text-gray-600">Legal</dt>
            <dd className="font-medium">{breakdown.formatted.legal_cost}</dd>
            <dt className="text-gray-600">Other</dt>
            <dd className="font-medium">{breakdown.formatted.other_cost}</dd>
            <dt className="text-gray-600">Total costs</dt>
            <dd className="font-medium">{breakdown.formatted.total_cost}</dd>
            <dt className="text-gray-600">Total real cost</dt>
            <dd className="font-semibold">{breakdown.formatted.total_real_cost}</dd>
          </dl>
        )}
      </section>

      {/* Linked auction reference */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Linked auction</h3>
        {a.auction_asset_id ? (
          <p className="text-sm">
            <Link
              href={`/auctions/${a.auction_asset_id}`}
              className="font-medium text-blue-600 hover:underline"
            >
              View auction →
            </Link>
            <span className="text-gray-500 ml-2 font-mono text-xs">{a.auction_asset_id.slice(0, 8)}…</span>
          </p>
        ) : (
          <p className="text-sm text-gray-500">No linked auction.</p>
        )}
      </section>

      {/* Linked documents */}
      {a.linked_document_ids?.length > 0 && (
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-3">Linked documents</h3>
          <ul className="space-y-1">
            {a.linked_document_ids.map((docId: string) => (
              <li key={docId}>
                <Link href={`/legal/documents/${docId}`} className="text-sm text-blue-600 hover:underline">
                  Document {docId.slice(0, 8)}…
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
