'use client';

import { useState } from 'react';
import { useQuery } from 'react-query';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function QualityGateDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [checkForm, setCheckForm] = useState({ resource_type: 'PROCESS', resource_id: '' });
  const [checkResult, setCheckResult] = useState<any>(null);
  const [checking, setChecking] = useState(false);

  const { data: gate, isLoading } = useQuery(['quality-gate', id], async () => {
    const res = await api.get(`/quality-gates/${id}`);
    return res.data?.gate ?? res.data?.data ?? res.data;
  }, { staleTime: 60_000 });

  const { data: decisions } = useQuery(['quality-gate-decisions', id], async () => {
    const res = await api.get(`/quality-gates/decisions/${checkForm.resource_type}/${checkForm.resource_id || '00000000-0000-0000-0000-000000000000'}`, { params: { limit: 20 } });
    return res.data?.decisions ?? [];
  }, { staleTime: 60_000, retry: false, enabled: false });

  async function handleCheck(e: React.FormEvent) {
    e.preventDefault();
    if (!checkForm.resource_id.trim()) return;
    setChecking(true); setCheckResult(null);
    try {
      const { data } = await api.post('/quality-gates/can-proceed', checkForm);
      setCheckResult(data);
    } catch (err: any) {
      setCheckResult({ error: err?.response?.data?.message || 'Falha' });
    } finally { setChecking(false); }
  }

  if (isLoading) return <p className="text-sm text-gray-500">Carregando...</p>;
  if (!gate) return <p className="text-sm text-red-600">Portão não encontrado.</p>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">{gate.gate_code} — {gate.gate_name}</h1>
        <Link href="/compliance/quality-gates" className="text-sm text-blue-600 hover:underline">Voltar</Link>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-600">Tipo</dt><dd className="font-medium">{gate.gate_type}</dd>
          <dt className="text-gray-600">Categoria</dt><dd className="font-medium">{gate.gate_category ?? '-'}</dd>
          <dt className="text-gray-600">Bloqueante</dt><dd className="font-medium">{gate.is_blocking ? 'Sim' : 'Não'}</dd>
          <dt className="text-gray-600">Obrigatório</dt><dd className="font-medium">{gate.is_mandatory ? 'Sim' : 'Não'}</dd>
          <dt className="text-gray-600">Ação em falha</dt><dd className="font-medium">{gate.failure_action ?? '-'}</dd>
          <dt className="text-gray-600">Ativo</dt><dd className="font-medium">{gate.is_active ? 'Sim' : 'Não'}</dd>
        </dl>
        {gate.description && <p className="text-sm text-gray-700 mt-3">{gate.description}</p>}
        {gate.gate_rules && (
          <div className="mt-3"><h3 className="text-xs font-medium text-gray-500 mb-1">Regras</h3><pre className="text-xs bg-gray-50 rounded p-2 border border-gray-100 overflow-x-auto">{JSON.stringify(gate.gate_rules, null, 2)}</pre></div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Verificar Procedibilidade</h3>
        <form onSubmit={handleCheck} className="flex items-end gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Tipo de Recurso</label>
            <select value={checkForm.resource_type} onChange={e => setCheckForm(p => ({ ...p, resource_type: e.target.value }))} className="rounded border border-gray-300 px-3 py-2 text-sm">
              <option value="PROCESS">Processo</option><option value="AUCTION_ASSET">Ativo de Leilão</option><option value="REAL_ESTATE_ASSET">Ativo Imobiliário</option><option value="DOCUMENT">Documento</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-600 mb-1">ID do Recurso</label>
            <input value={checkForm.resource_id} onChange={e => setCheckForm(p => ({ ...p, resource_id: e.target.value }))} placeholder="UUID" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <button type="submit" disabled={checking} className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">{checking ? 'Verificando...' : 'Verificar'}</button>
        </form>
        {checkResult && !checkResult.error && (
          <div className={`mt-3 rounded p-3 text-sm ${checkResult.can_proceed ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {checkResult.can_proceed ? 'Pode prosseguir.' : 'Bloqueado por portão de qualidade.'}
          </div>
        )}
        {checkResult?.error && <p className="mt-3 text-sm text-red-600">{checkResult.error}</p>}
      </section>
    </div>
  );
}
