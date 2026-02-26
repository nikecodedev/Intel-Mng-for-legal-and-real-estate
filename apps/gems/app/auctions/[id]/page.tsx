'use client';

import { use } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import Link from 'next/link';
import { DateDisplay, CurrencyDisplay, BlockLoader } from '@/components/ui';
import {
  fetchAuctionById,
  advanceAuctionStage,
  fetchAuctionROI,
  getNextStage,
  getApiErrorMessage,
  type AuctionAsset,
  type RiskLevel,
} from '@/lib/auction-api';
import { RiskIndicator } from '@/components/auctions/RiskIndicator';

export default function AuctionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();

  const { data: asset, isLoading: assetLoading, error: assetError } = useQuery(
    ['auction', id],
    () => fetchAuctionById(id),
    { staleTime: 30 * 1000 }
  );

  const { data: roi, isLoading: roiLoading, error: roiError } = useQuery(
    ['auction-roi', id],
    () => fetchAuctionROI(id),
    { staleTime: 60 * 1000, retry: false }
  );

  const advanceMutation = useMutation({
    mutationFn: (toStage: string) => advanceAuctionStage(id, toStage),
    onSuccess: () => {
      queryClient.invalidateQueries(['auction', id]);
    },
  });

  const nextStage = asset ? getNextStage(asset.current_stage) : null;
  const canAdvance = nextStage != null && !advanceMutation.isLoading;

  if (assetLoading) return <BlockLoader message="Loading auction…" />;

  if (assetError || !asset) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        Auction not found or you don’t have access.
      </div>
    );
  }

  const a = asset as AuctionAsset;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          {a.title || a.asset_reference || `Auction ${a.id.slice(0, 8)}`}
        </h2>
        <Link href="/auctions" className="text-sm text-blue-600 hover:underline">
          ← Back to list
        </Link>
      </div>

      {/* Current MPGA stage */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-2">Current MPGA stage</h3>
        <p className="text-2xl font-mono font-semibold text-gray-900">{a.current_stage}</p>
        {nextStage != null && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => advanceMutation.mutate(nextStage)}
              disabled={!canAdvance}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {advanceMutation.isLoading ? 'Advancing…' : `Advance to ${nextStage}`}
            </button>
            {advanceMutation.isError && (
              <p className="mt-2 text-sm text-red-600" role="alert">
                {getApiErrorMessage(advanceMutation.error)}
              </p>
            )}
          </div>
        )}
        {nextStage == null && (
          <p className="mt-2 text-sm text-gray-500">Final stage (F9). No further advance.</p>
        )}
      </section>

      {/* Risk score (backend values only) */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-2">Risk</h3>
        <RiskIndicator
          riskLevel={(a.risk_level as RiskLevel) || 'LOW'}
          riskScore={a.risk_score}
          showScore
        />
        <p className="mt-1 text-xs text-gray-500">From backend. Score 0–100.</p>
      </section>

      {/* ROI summary */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">ROI summary</h3>
        {roiLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {roiError ? <p className="text-sm text-gray-500">ROI not calculated for this asset yet.</p> : null}
        {roi && !roiError && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-600">Total cost</dt>
            <dd className="font-medium"><CurrencyDisplay cents={roi.outputs.total_cost_cents} /></dd>
            <dt className="text-gray-600">Net profit</dt>
            <dd className="font-medium"><CurrencyDisplay cents={roi.outputs.net_profit_cents} /></dd>
            <dt className="text-gray-600">ROI %</dt>
            <dd className="font-medium">{roi.outputs.roi_percentage.toFixed(2)}%</dd>
            <dt className="text-gray-600">Break-even date</dt>
            <dd className="font-medium"><DateDisplay value={roi.outputs.break_even_date} style="short" /></dd>
            <dt className="text-gray-600">Version</dt>
            <dd className="font-medium">{roi.version_number}</dd>
          </dl>
        )}
      </section>

      {/* Linked documents */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Linked documents</h3>
        {!a.linked_document_ids?.length ? (
          <p className="text-sm text-gray-500">No linked documents.</p>
        ) : (
          <ul className="space-y-1">
            {a.linked_document_ids.map((docId: string) => (
              <li key={docId}>
                <Link
                  href={`/legal/documents/${docId}`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Document {docId.slice(0, 8)}…
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
