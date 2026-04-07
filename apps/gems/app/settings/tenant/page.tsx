'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';

export default function TenantSettingsPage() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    logo_url: '',
    cnpj: '',
    retention_days: '365',
    mpga_param_a: '',
    mpga_param_b: '',
    mpga_param_c: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function set(field: string, value: string) {
    setForm((p) => ({ ...p, [field]: value }));
    setError('');
    setSuccess('');
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const tenantId = user?.tenant_id;
      if (!tenantId) throw new Error('Tenant nao identificado.');
      await api.put(`/super-admin/tenants/${tenantId}`, {
        logo_url: form.logo_url || undefined,
        cnpj: form.cnpj || undefined,
        retention_days: form.retention_days ? Number(form.retention_days) : undefined,
        mpga_params: {
          param_a: form.mpga_param_a || undefined,
          param_b: form.mpga_param_b || undefined,
          param_c: form.mpga_param_c || undefined,
        },
      });
      setSuccess('Configuracoes salvas com sucesso.');
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Falha ao salvar configuracoes.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardLayout title="Configuracoes do Tenant">
      <div className="max-w-xl space-y-6">
        <h1 className="text-xl font-bold text-gray-900">Configuracoes do Tenant</h1>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>}
        {success && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded p-3">{success}</p>}

        <form onSubmit={handleSave} className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL do Logotipo</label>
            <input value={form.logo_url} onChange={(e) => set('logo_url', e.target.value)} placeholder="https://..." className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
            <input value={form.cnpj} onChange={(e) => set('cnpj', e.target.value)} placeholder="00.000.000/0000-00" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Politica de Retencao (dias)</label>
            <input type="number" min="1" value={form.retention_days} onChange={(e) => set('retention_days', e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>

          <fieldset className="border border-gray-200 rounded p-4 space-y-3">
            <legend className="text-sm font-medium text-gray-700 px-2">Parametros MPGA</legend>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Parametro A</label>
              <input value={form.mpga_param_a} onChange={(e) => set('mpga_param_a', e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Parametro B</label>
              <input value={form.mpga_param_b} onChange={(e) => set('mpga_param_b', e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Parametro C</label>
              <input value={form.mpga_param_c} onChange={(e) => set('mpga_param_c', e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </fieldset>

          <button type="submit" disabled={loading} className="rounded bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Salvando...' : 'Salvar Configuracoes'}
          </button>
        </form>
      </div>
    </DashboardLayout>
  );
}
