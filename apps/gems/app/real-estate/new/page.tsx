'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function CreateRealEstateAssetPage() {
  const router = useRouter();
  const [form, setForm] = useState({ asset_code: '', property_type: 'APARTMENT', property_address: '', property_size_sqm: '', number_of_rooms: '', acquisition_price_cents: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function set(field: string, value: string) { setForm((p) => ({ ...p, [field]: value })); setError(''); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = {
        ...form,
        property_size_sqm: form.property_size_sqm ? Number(form.property_size_sqm) : undefined,
        number_of_rooms: form.number_of_rooms ? Number(form.number_of_rooms) : undefined,
        acquisition_price_cents: form.acquisition_price_cents ? Math.round(parseFloat(form.acquisition_price_cents) * 100) : undefined,
      };
      const { data } = await api.post('/assets', payload);
      const id = data?.asset?.id ?? data?.data?.id ?? data?.id;
      router.push(id ? `/real-estate/${id}` : '/real-estate');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create asset.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Create Real Estate Asset</h1>
        <Link href="/real-estate" className="text-sm text-blue-600 hover:underline">Cancel</Link>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Asset Code</label>
            <input value={form.asset_code} onChange={(e) => set('asset_code', e.target.value)} required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. RE-2026-001" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Property Type</label>
            <select value={form.property_type} onChange={(e) => set('property_type', e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
              <option value="APARTMENT">Apartment</option>
              <option value="HOUSE">House</option>
              <option value="COMMERCIAL">Commercial</option>
              <option value="LAND">Land</option>
              <option value="FARM">Farm</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <input value={form.property_address} onChange={(e) => set('property_address', e.target.value)} required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="Full address" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Size (m2)</label>
            <input type="number" min="0" value={form.property_size_sqm} onChange={(e) => set('property_size_sqm', e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rooms</label>
            <input type="number" min="0" value={form.number_of_rooms} onChange={(e) => set('number_of_rooms', e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Acquisition Price (R$)</label>
            <input type="number" step="0.01" min="0" value={form.acquisition_price_cents} onChange={(e) => set('acquisition_price_cents', e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="0.00" />
          </div>
        </div>
        <button type="submit" disabled={loading} className="w-full rounded bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Creating...' : 'Create Asset'}
        </button>
      </form>
    </div>
  );
}
