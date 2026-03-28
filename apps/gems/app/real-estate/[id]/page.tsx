'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import Link from 'next/link';
import { DateDisplay, CurrencyDisplay, BlockLoader } from '@/components/ui';
import { fetchAssetById, fetchCostBreakdown, type RealEstateAsset } from '@/lib/real-estate-api';
import { StatusProgressionTimeline } from '@/components/real-estate/StatusProgressionTimeline';
import { api } from '@/lib/api';

// Valid state transitions
const STATE_TRANSITIONS: Record<string, string[]> = {
  ACQUIRED: ['REGULARIZATION'],
  REGULARIZATION: ['RENOVATION'],
  RENOVATION: ['READY'],
  READY: ['SOLD', 'RENTED'],
};

const STATE_BADGE_COLORS: Record<string, string> = {
  ACQUIRED: 'bg-blue-100 text-blue-800',
  REGULARIZATION: 'bg-yellow-100 text-yellow-800',
  RENOVATION: 'bg-orange-100 text-orange-800',
  READY: 'bg-green-100 text-green-800',
  SOLD: 'bg-purple-100 text-purple-800',
  RENTED: 'bg-teal-100 text-teal-800',
};

export default function RealEstateAssetDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const queryClient = useQueryClient();

  // State transition form state
  const [transitionState, setTransitionState] = useState('');
  const [transitionReason, setTransitionReason] = useState('');
  const [transitionLoading, setTransitionLoading] = useState(false);
  const [transitionError, setTransitionError] = useState('');
  const [transitionSuccess, setTransitionSuccess] = useState('');

  // Cost form state
  const [costForm, setCostForm] = useState({
    regularization_cost: '',
    renovation_cost: '',
    maintenance_cost: '',
    taxes: '',
    legal_costs: '',
    other_costs: '',
  });
  const [costLoading, setCostLoading] = useState(false);
  const [costError, setCostError] = useState('');
  const [costSuccess, setCostSuccess] = useState('');

  const { data: asset, isLoading: assetLoading, error: assetError } = useQuery(
    ['real-estate-asset', id],
    () => fetchAssetById(id),
    {
      staleTime: 60 * 1000,
      onSuccess: (data: any) => {
        const d = data as RealEstateAsset;
        setCostForm({
          regularization_cost: d.regularization_cost != null ? String(d.regularization_cost) : '',
          renovation_cost: d.renovation_cost != null ? String(d.renovation_cost) : '',
          maintenance_cost: d.maintenance_cost != null ? String(d.maintenance_cost) : '',
          taxes: d.taxes != null ? String(d.taxes) : '',
          legal_costs: d.legal_costs != null ? String(d.legal_costs) : '',
          other_costs: d.other_costs != null ? String(d.other_costs) : '',
        });
      },
    }
  );

  const { data: breakdown, isLoading: breakdownLoading, error: breakdownError } = useQuery(
    ['real-estate-cost-breakdown', id],
    () => fetchCostBreakdown(id),
    { staleTime: 60 * 1000, retry: false }
  );

  const handleTransition = async () => {
    if (!transitionState) {
      setTransitionError('Please select a target state.');
      return;
    }
    setTransitionLoading(true);
    setTransitionError('');
    setTransitionSuccess('');
    try {
      await api.post(`/real-estate-assets/${id}/transition`, {
        to_state: transitionState,
        reason: transitionReason,
      });
      setTransitionSuccess(`Transitioned to ${transitionState} successfully.`);
      setTransitionState('');
      setTransitionReason('');
      queryClient.invalidateQueries(['real-estate-asset', id]);
      queryClient.invalidateQueries(['real-estate-cost-breakdown', id]);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Transition failed.';
      setTransitionError(msg);
    } finally {
      setTransitionLoading(false);
    }
  };

  const handleSaveCosts = async () => {
    setCostLoading(true);
    setCostError('');
    setCostSuccess('');
    try {
      const payload: Record<string, number | null> = {};
      for (const [key, val] of Object.entries(costForm)) {
        payload[key] = val !== '' ? Number(val) : null;
      }
      await api.put(`/real-estate-assets/${id}`, payload);
      setCostSuccess('Costs updated successfully.');
      queryClient.invalidateQueries(['real-estate-asset', id]);
      queryClient.invalidateQueries(['real-estate-cost-breakdown', id]);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to save costs.';
      setCostError(msg);
    } finally {
      setCostLoading(false);
    }
  };

  if (assetLoading) return <BlockLoader message="Loading asset…" />;

  if (assetError || !asset) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        Asset not found or you do not have access.
      </div>
    );
  }

  const a = asset as RealEstateAsset;
  const validNextStates = STATE_TRANSITIONS[a.current_state] ?? [];
  const badgeColor = STATE_BADGE_COLORS[a.current_state] ?? 'bg-gray-100 text-gray-800';

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
        {breakdown && !breakdownError && breakdown?.formatted && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-600">Acquisition (price)</dt>
            <dd className="font-medium">{breakdown.formatted.acquisition_price ?? '—'}</dd>
            <dt className="text-gray-600">Acquisition (costs)</dt>
            <dd className="font-medium">{breakdown.formatted.acquisition_cost ?? '—'}</dd>
            <dt className="text-gray-600">Regularization</dt>
            <dd className="font-medium">{breakdown.formatted.regularization_cost ?? '—'}</dd>
            <dt className="text-gray-600">Renovation</dt>
            <dd className="font-medium">{breakdown.formatted.renovation_cost ?? '—'}</dd>
            <dt className="text-gray-600">Maintenance</dt>
            <dd className="font-medium">{breakdown.formatted.maintenance_cost ?? '—'}</dd>
            <dt className="text-gray-600">Taxes</dt>
            <dd className="font-medium">{breakdown.formatted.taxes_cost ?? '—'}</dd>
            <dt className="text-gray-600">Legal</dt>
            <dd className="font-medium">{breakdown.formatted.legal_cost ?? '—'}</dd>
            <dt className="text-gray-600">Other</dt>
            <dd className="font-medium">{breakdown.formatted.other_cost ?? '—'}</dd>
            <dt className="text-gray-600">Total costs</dt>
            <dd className="font-medium">{breakdown.formatted.total_cost ?? '—'}</dd>
            <dt className="text-gray-600">Total real cost</dt>
            <dd className="font-semibold">{breakdown.formatted.total_real_cost ?? '—'}</dd>
          </dl>
        )}
      </section>

      {/* Change Status */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Change Status</h3>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm text-gray-600">Current status:</span>
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${badgeColor}`}>
            {a.current_state}
          </span>
        </div>
        {validNextStates.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={transitionState}
                onChange={(e) => { setTransitionState(e.target.value); setTransitionError(''); setTransitionSuccess(''); }}
                className="rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select target state...</option>
                {validNextStates.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <input
                type="text"
                value={transitionReason}
                onChange={(e) => setTransitionReason(e.target.value)}
                placeholder="Reason for transition"
                className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleTransition}
                disabled={transitionLoading || !transitionState}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {transitionLoading ? 'Transitioning...' : 'Transition'}
              </button>
            </div>
            {transitionError && (
              <p className="text-sm text-red-600">{transitionError}</p>
            )}
            {transitionSuccess && (
              <p className="text-sm text-green-600">{transitionSuccess}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No further transitions available for this state.</p>
        )}
      </section>

      {/* Update Costs */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Update Costs</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {([
            ['regularization_cost', 'Regularization Cost'],
            ['renovation_cost', 'Renovation Cost'],
            ['maintenance_cost', 'Maintenance Cost'],
            ['taxes', 'Taxes'],
            ['legal_costs', 'Legal Costs'],
            ['other_costs', 'Other Costs'],
          ] as [keyof typeof costForm, string][]).map(([field, label]) => (
            <div key={field}>
              <label className="block text-xs text-gray-600 mb-1">{label}</label>
              <input
                type="number"
                step="0.01"
                value={costForm[field]}
                onChange={(e) => { setCostForm((prev) => ({ ...prev, [field]: e.target.value })); setCostError(''); setCostSuccess(''); }}
                placeholder="0.00"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSaveCosts}
            disabled={costLoading}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {costLoading ? 'Saving...' : 'Save Costs'}
          </button>
          {costError && <p className="text-sm text-red-600">{costError}</p>}
          {costSuccess && <p className="text-sm text-green-600">{costSuccess}</p>}
        </div>
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
      {(a.linked_document_ids || []).length > 0 && (
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-3">Linked documents</h3>
          <ul className="space-y-1">
            {(a.linked_document_ids || []).map((docId: string) => (
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
