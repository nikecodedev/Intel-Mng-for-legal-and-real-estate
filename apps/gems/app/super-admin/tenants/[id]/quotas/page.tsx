'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface QuotaData {
  max_storage_bytes: number;
  max_users: number;
  max_documents: number;
  [key: string]: unknown;
}

interface ComplianceResult {
  compliant: boolean;
  violations: string[];
  [key: string]: unknown;
}

export default function SuperAdminTenantQuotasPage({ params }: { params: { id: string } }) {
  const { id } = params;

  const [quotas, setQuotas] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Form fields
  const [maxStorageBytes, setMaxStorageBytes] = useState('');
  const [maxUsers, setMaxUsers] = useState('');
  const [maxDocuments, setMaxDocuments] = useState('');

  // Compliance check
  const [compliance, setCompliance] = useState<ComplianceResult | null>(null);
  const [checkingCompliance, setCheckingCompliance] = useState(false);

  // Storage recalculation
  const [recalculating, setRecalculating] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchQuotas();
  }, [id]);

  async function fetchQuotas() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/super-admin/tenants/${id}/quotas`);
      const q = data?.quotas ?? data?.data ?? data;
      setQuotas(q);
      setMaxStorageBytes(String(q?.max_storage_bytes ?? 0));
      setMaxUsers(String(q?.max_users ?? 0));
      setMaxDocuments(String(q?.max_documents ?? 0));
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Falha ao carregar cotas.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      await api.put(`/super-admin/tenants/${id}/quotas`, {
        max_storage_bytes: Number(maxStorageBytes),
        max_users: Number(maxUsers),
        max_documents: Number(maxDocuments),
      });
      setSaveMsg('Cotas atualizadas com sucesso.');
      fetchQuotas();
    } catch (err: any) {
      setSaveMsg(err?.response?.data?.message ?? 'Falha ao salvar cotas.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCheckCompliance() {
    setCheckingCompliance(true);
    setCompliance(null);
    try {
      const { data } = await api.get(`/super-admin/tenants/${id}/quotas/check`);
      setCompliance(data?.compliance ?? data?.data ?? data);
    } catch (err: any) {
      setCompliance({ compliant: false, violations: [err?.response?.data?.message ?? 'Falha ao verificar conformidade.'] });
    } finally {
      setCheckingCompliance(false);
    }
  }

  async function handleRecalculateStorage() {
    setRecalculating(true);
    setRecalcMsg(null);
    try {
      const { data } = await api.post(`/super-admin/tenants/${id}/storage/calculate`, {});
      setRecalcMsg(`Armazenamento recalculado: ${formatBytes(data?.storage_bytes ?? data?.data?.storage_bytes ?? 0)}`);
    } catch (err: any) {
      setRecalcMsg(err?.response?.data?.message ?? 'Falha ao recalcular armazenamento.');
    } finally {
      setRecalculating(false);
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  if (loading) return <p className="text-sm text-gray-500">Carregando cotas...</p>;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Cotas do Tenant</h1>
        <Link href={`/super-admin/tenants/${id}`} className="text-sm text-blue-600 hover:underline">
          Voltar ao tenant
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Quotas Form */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Editar Cotas</h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Armazenamento Máximo (bytes)
            </label>
            <input
              type="number"
              value={maxStorageBytes}
              onChange={(e) => setMaxStorageBytes(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              min={0}
            />
            {maxStorageBytes && (
              <p className="text-xs text-gray-400 mt-1">{formatBytes(Number(maxStorageBytes))}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Máximo de Usuários
            </label>
            <input
              type="number"
              value={maxUsers}
              onChange={(e) => setMaxUsers(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              min={0}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Máximo de Documentos
            </label>
            <input
              type="number"
              value={maxDocuments}
              onChange={(e) => setMaxDocuments(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              min={0}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar Cotas'}
            </button>
            {saveMsg && (
              <p className={`text-sm ${saveMsg.includes('sucesso') ? 'text-green-600' : 'text-red-600'}`}>{saveMsg}</p>
            )}
          </div>
        </form>
      </section>

      {/* Actions */}
      <section className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Ações</h2>

        {/* Compliance Check */}
        <div>
          <button
            onClick={handleCheckCompliance}
            disabled={checkingCompliance}
            className="rounded-lg bg-amber-600 px-5 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {checkingCompliance ? 'Verificando...' : 'Verificar Conformidade'}
          </button>
          {compliance && (
            <div className={`mt-3 rounded-lg border p-4 ${compliance.compliant ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
              <p className={`text-sm font-medium ${compliance.compliant ? 'text-green-700' : 'text-red-700'}`}>
                {compliance.compliant ? 'Tenant em conformidade.' : 'Tenant fora de conformidade.'}
              </p>
              {compliance.violations && compliance.violations.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {compliance.violations.map((v, i) => (
                    <li key={i} className="text-sm text-red-600">- {v}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Recalculate Storage */}
        <div>
          <button
            onClick={handleRecalculateStorage}
            disabled={recalculating}
            className="rounded-lg bg-purple-600 px-5 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {recalculating ? 'Recalculando...' : 'Recalcular Armazenamento'}
          </button>
          {recalcMsg && (
            <p className={`mt-2 text-sm ${recalcMsg.includes('Falha') ? 'text-red-600' : 'text-green-600'}`}>{recalcMsg}</p>
          )}
        </div>
      </section>
    </div>
  );
}
