'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function WhiteLabelPage({ params }: { params: { id: string } }) {
  const tenantId = params.id;
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery(['white-label', tenantId], async () => {
    const res = await api.get(`/super-admin/tenants/${tenantId}/white-label`);
    return res.data?.config ?? res.data?.data ?? null;
  }, { staleTime: 60_000, retry: false });

  const [form, setForm] = useState({ company_name: '', primary_color: '#3B82F6', secondary_color: '#1E40AF', logo_url: '', custom_css: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (config) {
      setForm({
        company_name: config.company_name ?? '',
        primary_color: config.primary_color ?? '#3B82F6',
        secondary_color: config.secondary_color ?? '#1E40AF',
        logo_url: config.logo_url ?? '',
        custom_css: config.custom_css ?? '',
      });
    }
  }, [config]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(''); setSuccess('');
    try {
      await api.put(`/super-admin/tenants/${tenantId}/white-label`, form);
      setSuccess('White-label configuration saved.');
      queryClient.invalidateQueries(['white-label', tenantId]);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">White-Label Configuration</h1>
        <Link href={`/super-admin/tenants/${tenantId}`} className="text-sm text-blue-600 hover:underline">Back to tenant</Link>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>}
      {success && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded p-3">{success}</p>}
      {isLoading ? <p className="text-sm text-gray-500">Loading...</p> : (
        <form onSubmit={handleSave} className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs text-gray-600 mb-1">Company Name</label>
              <input value={form.company_name} onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Primary Color</label>
              <div className="flex gap-2">
                <input type="color" value={form.primary_color} onChange={e => setForm(p => ({ ...p, primary_color: e.target.value }))} className="h-9 w-12 rounded border border-gray-300" />
                <input value={form.primary_color} onChange={e => setForm(p => ({ ...p, primary_color: e.target.value }))} className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm font-mono" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Secondary Color</label>
              <div className="flex gap-2">
                <input type="color" value={form.secondary_color} onChange={e => setForm(p => ({ ...p, secondary_color: e.target.value }))} className="h-9 w-12 rounded border border-gray-300" />
                <input value={form.secondary_color} onChange={e => setForm(p => ({ ...p, secondary_color: e.target.value }))} className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm font-mono" />
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-600 mb-1">Logo URL</label>
              <input value={form.logo_url} onChange={e => setForm(p => ({ ...p, logo_url: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="https://..." />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-600 mb-1">Custom CSS</label>
              <textarea value={form.custom_css} onChange={e => setForm(p => ({ ...p, custom_css: e.target.value }))} rows={4} className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono" />
            </div>
          </div>
          <button type="submit" disabled={loading} className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">{loading ? 'Saving...' : 'Save Configuration'}</button>
        </form>
      )}
    </div>
  );
}
