'use client';

import { useState } from 'react';
import { useQuery } from 'react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';

export default function AdminAuditPage() {
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);

  const { data: status } = useQuery('audit-status', async () => {
    const res = await api.get('/audit-integrity/status');
    return res.data?.data ?? res.data;
  }, { staleTime: 30_000, retry: false });

  const { data: violations } = useQuery('audit-violations', async () => {
    const res = await api.get('/audit-integrity/violations');
    return res.data?.data ?? res.data?.violations ?? [];
  }, { staleTime: 60_000, retry: false });

  async function handleVerify() {
    setVerifying(true); setVerifyResult(null);
    try {
      const res = await api.get('/audit-integrity/verify-chain');
      setVerifyResult(res.data?.data ?? res.data);
    } catch (err: any) {
      if (err?.response?.status === 422) setVerifyResult(err.response.data?.data ?? { chain_integrity: 'invalid' });
      else setVerifyResult({ error: err?.response?.data?.message || 'Falha' });
    } finally { setVerifying(false); }
  }

  return (
    <DashboardLayout title="Trilha de Auditoria">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Trilha de Auditoria</h1>

        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-medium text-gray-500 mb-3">Estado da Cadeia de Integridade</h2>
          {status && (
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div><dt className="text-gray-600">Status</dt><dd className={`font-bold ${status.status === 'valid' ? 'text-green-600' : 'text-red-600'}`}>{status.status === 'valid' ? 'Válida' : 'Inválida'}</dd></div>
              <div><dt className="text-gray-600">Total de registros</dt><dd className="font-bold">{status.total_entries ?? 0}</dd></div>
              <div><dt className="text-gray-600">Último hash válido</dt><dd className="font-medium">{status.latest_hash_valid ? 'Sim' : 'Não'}</dd></div>
              <div><dt className="text-gray-600">Última verificação</dt><dd className="font-medium">{status.checked_at ? new Date(status.checked_at).toLocaleString() : '—'}</dd></div>
            </dl>
          )}
          <div className="mt-4">
            <button onClick={handleVerify} disabled={verifying} className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">{verifying ? 'Verificando...' : 'Verificar Cadeia SHA-256'}</button>
          </div>
          {verifyResult && !verifyResult.error && (
            <div className={`mt-3 rounded p-3 text-sm ${verifyResult.chain_integrity === 'valid' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {verifyResult.chain_integrity === 'valid' ? 'Cadeia válida' : 'Cadeia inválida'} — {verifyResult.total_entries ?? 0} registros, {verifyResult.valid_entries ?? 0} válidos, {verifyResult.invalid_entries ?? 0} inválidos
            </div>
          )}
          {verifyResult?.error && <p className="mt-3 text-sm text-red-600">{verifyResult.error}</p>}
        </section>

        {Array.isArray(violations) && violations.length > 0 && (
          <section className="rounded-lg border border-red-200 bg-red-50 p-6">
            <h2 className="text-sm font-medium text-red-800 mb-3">Violações Detectadas ({violations.length})</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-red-200 text-sm">
                <thead><tr>
                  <th className="px-3 py-2 text-left font-medium text-red-700">ID</th>
                  <th className="px-3 py-2 text-left font-medium text-red-700">Tipo</th>
                  <th className="px-3 py-2 text-left font-medium text-red-700">Detectado em</th>
                </tr></thead>
                <tbody className="divide-y divide-red-100">
                  {violations.map((v: any) => (
                    <tr key={v.id}>
                      <td className="px-3 py-2 font-mono text-xs">{v.id?.slice(0, 12)}</td>
                      <td className="px-3 py-2">{v.violation_type ?? '—'}</td>
                      <td className="px-3 py-2">{v.detected_at ? new Date(v.detected_at).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
