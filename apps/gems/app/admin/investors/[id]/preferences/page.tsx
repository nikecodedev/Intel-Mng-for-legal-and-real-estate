'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function InvestorPreferencesPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery(['crm-preferences', id], async () => {
    const res = await api.get(`/crm/preference-profiles/${id}`);
    return res.data?.profile ?? res.data?.data ?? null;
  }, { staleTime: 60_000, retry: false });

  const [form, setForm] = useState({ preferred_asset_types: '', min_roi_percentage: '', max_risk_score: '', min_investment_cents: '', max_investment_cents: '', preferred_locations: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (profile) {
      setForm({
        preferred_asset_types: Array.isArray(profile.preferred_asset_types) ? profile.preferred_asset_types.join(', ') : profile.preferred_asset_types ?? '',
        min_roi_percentage: profile.min_roi_percentage ?? '',
        max_risk_score: profile.max_risk_score ?? '',
        min_investment_cents: profile.min_investment_cents ? String(profile.min_investment_cents / 100) : '',
        max_investment_cents: profile.max_investment_cents ? String(profile.max_investment_cents / 100) : '',
        preferred_locations: Array.isArray(profile.preferred_locations) ? profile.preferred_locations.join(', ') : profile.preferred_locations ?? '',
      });
    }
  }, [profile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(''); setSuccess('');
    try {
      const payload = {
        investor_id: id,
        preferred_asset_types: form.preferred_asset_types ? form.preferred_asset_types.split(',').map(s => s.trim()) : [],
        min_roi_percentage: form.min_roi_percentage ? Number(form.min_roi_percentage) : undefined,
        max_risk_score: form.max_risk_score ? Number(form.max_risk_score) : undefined,
        min_investment_cents: form.min_investment_cents ? Math.round(parseFloat(form.min_investment_cents) * 100) : undefined,
        max_investment_cents: form.max_investment_cents ? Math.round(parseFloat(form.max_investment_cents) * 100) : undefined,
        preferred_locations: form.preferred_locations ? form.preferred_locations.split(',').map(s => s.trim()) : [],
      };
      if (profile?.id) {
        await api.put(`/crm/preference-profiles/${profile.id}`, payload);
      } else {
        await api.post('/crm/preference-profiles', payload);
      }
      setSuccess('Preferências salvas.');
      queryClient.invalidateQueries(['crm-preferences', id]);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Falha ao salvar preferências.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Preferências do Investidor</h1>
        <Link href={`/admin/investors/${id}`} className="text-sm text-blue-600 hover:underline">Voltar ao investidor</Link>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>}
      {success && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded p-3">{success}</p>}
      {isLoading ? <p className="text-sm text-gray-500">Carregando...</p> : (
        <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs text-gray-600 mb-1">Tipos de Ativo Preferidos (separados por vírgula)</label>
              <input value={form.preferred_asset_types} onChange={e => setForm(p => ({ ...p, preferred_asset_types: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="APARTMENT, HOUSE, COMMERCIAL" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">ROI Mín. %</label>
              <input type="number" step="0.1" value={form.min_roi_percentage} onChange={e => setForm(p => ({ ...p, min_roi_percentage: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Pontuação Máx. de Risco</label>
              <input type="number" min="0" max="100" value={form.max_risk_score} onChange={e => setForm(p => ({ ...p, max_risk_score: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Investimento Mín. (R$)</label>
              <input type="number" step="0.01" value={form.min_investment_cents} onChange={e => setForm(p => ({ ...p, min_investment_cents: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Investimento Máx. (R$)</label>
              <input type="number" step="0.01" value={form.max_investment_cents} onChange={e => setForm(p => ({ ...p, max_investment_cents: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-600 mb-1">Localizações Preferidas (separadas por vírgula)</label>
              <input value={form.preferred_locations} onChange={e => setForm(p => ({ ...p, preferred_locations: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="São Paulo, Rio de Janeiro" />
            </div>
          </div>
          <button type="submit" disabled={loading} className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">{loading ? 'Salvando...' : profile?.id ? 'Atualizar Preferências' : 'Criar Preferências'}</button>
        </form>
      )}
    </div>
  );
}
