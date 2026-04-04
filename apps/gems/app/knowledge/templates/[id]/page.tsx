'use client';

import { useState } from 'react';
import { useQuery } from 'react-query';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function TemplateDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [useMsg, setUseMsg] = useState('');
  const [outcomeForm, setOutcomeForm] = useState({ outcome_type: 'SUCCESS', outcome_notes: '' });
  const [outcomeMsg, setOutcomeMsg] = useState('');

  const { data: template, isLoading } = useQuery(['knowledge-template', id], async () => {
    const res = await api.get(`/knowledge/templates/${id}`);
    return res.data?.template ?? res.data?.data ?? res.data;
  }, { staleTime: 60_000 });

  const { data: metrics } = useQuery(['knowledge-template-metrics', id], async () => {
    const res = await api.get(`/knowledge/templates/${id}/metrics`);
    return res.data?.metrics ?? res.data?.data ?? null;
  }, { staleTime: 60_000, retry: false });

  async function recordUse() {
    try {
      await api.post(`/knowledge/templates/${id}/use`, {});
      setUseMsg('Uso registrado.');
    } catch { setUseMsg('Falha.'); }
  }

  async function recordOutcome(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post(`/knowledge/templates/${id}/outcome`, outcomeForm);
      setOutcomeMsg('Resultado registrado.');
    } catch { setOutcomeMsg('Falha.'); }
  }

  if (isLoading) return <p className="text-sm text-gray-500">Carregando...</p>;
  if (!template) return <p className="text-sm text-red-600">Modelo não encontrado.</p>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">{template.template_name}</h1>
        <Link href="/knowledge/templates" className="text-sm text-blue-600 hover:underline">Voltar</Link>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4">
          <dt className="text-gray-600">Tipo</dt><dd className="font-medium">{template.template_type}</dd>
          <dt className="text-gray-600">Categoria</dt><dd className="font-medium">{template.category ?? '-'}</dd>
          <dt className="text-gray-600">Usos</dt><dd className="font-medium">{template.usage_count ?? 0}</dd>
          <dt className="text-gray-600">Criado em</dt><dd className="font-medium">{template.created_at ? new Date(template.created_at).toLocaleDateString() : '-'}</dd>
        </dl>
        {template.description && <p className="text-sm text-gray-700 mb-4">{template.description}</p>}
        <div><h3 className="text-xs font-medium text-gray-500 mb-1">Conteúdo</h3><pre className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 rounded p-3 border border-gray-100">{template.template_content}</pre></div>
      </section>

      {/* Metrics */}
      {metrics && (
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-3">Métricas</h3>
          <dl className="grid grid-cols-3 gap-4 text-sm">
            <div><dt className="text-gray-600">Total de usos</dt><dd className="text-2xl font-bold">{metrics.total_uses ?? 0}</dd></div>
            <div><dt className="text-gray-600">Taxa de sucesso</dt><dd className="text-2xl font-bold">{metrics.success_rate != null ? `${Math.round(metrics.success_rate * 100)}%` : '-'}</dd></div>
            <div><dt className="text-gray-600">Resultados</dt><dd className="text-2xl font-bold">{metrics.total_outcomes ?? 0}</dd></div>
          </dl>
        </section>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={recordUse} className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">Registrar Uso</button>
        {useMsg && <span className="text-sm text-green-600 self-center">{useMsg}</span>}
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Registrar Resultado</h3>
        <form onSubmit={recordOutcome} className="flex items-end gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Resultado</label>
            <select value={outcomeForm.outcome_type} onChange={e => setOutcomeForm(p => ({ ...p, outcome_type: e.target.value }))} className="rounded border border-gray-300 px-3 py-2 text-sm">
              <option value="SUCCESS">Sucesso</option>
              <option value="FAILURE">Falha</option>
              <option value="PARTIAL">Parcial</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-600 mb-1">Observações</label>
            <input value={outcomeForm.outcome_notes} onChange={e => setOutcomeForm(p => ({ ...p, outcome_notes: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="rounded bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-800">Registrar</button>
        </form>
        {outcomeMsg && <p className="mt-2 text-sm text-green-600">{outcomeMsg}</p>}
      </section>
    </div>
  );
}
