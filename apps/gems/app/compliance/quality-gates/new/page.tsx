'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

const GATE_TYPES = ['DOCUMENT', 'APPROVAL', 'RISK_SCORE', 'CUSTOM', 'DATA_COMPLETENESS', 'VALIDATION'];

export default function CreateQualityGatePage() {
  const router = useRouter();
  const [form, setForm] = useState({ gate_code: '', gate_name: '', description: '', gate_type: 'CUSTOM', is_blocking: true, is_mandatory: true, failure_action: 'BLOCK', gate_rules: '{}' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await api.post('/quality-gates', { ...form, is_blocking: form.is_blocking, is_mandatory: form.is_mandatory, gate_rules: JSON.parse(form.gate_rules) });
      router.push('/compliance/quality-gates');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Falha ao criar quality gate.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Criar Quality Gate</h1>
        <Link href="/compliance/quality-gates" className="text-sm text-blue-600 hover:underline">Cancelar</Link>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>}
      <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-xs text-gray-600 mb-1">Código do Gate (ex. QG1)</label><input value={form.gate_code} onChange={e => setForm(p => ({ ...p, gate_code: e.target.value }))} required pattern="^QG[1-9][0-9]*$" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" /></div>
          <div><label className="block text-xs text-gray-600 mb-1">Tipo do Gate</label><select value={form.gate_type} onChange={e => setForm(p => ({ ...p, gate_type: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">{GATE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
        </div>
        <div><label className="block text-xs text-gray-600 mb-1">Nome do Gate</label><input value={form.gate_name} onChange={e => setForm(p => ({ ...p, gate_name: e.target.value }))} required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" /></div>
        <div><label className="block text-xs text-gray-600 mb-1">Descrição</label><textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" /></div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="block text-xs text-gray-600 mb-1">Bloqueante</label><select value={String(form.is_blocking)} onChange={e => setForm(p => ({ ...p, is_blocking: e.target.value === 'true' }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm"><option value="true">Sim</option><option value="false">Não</option></select></div>
          <div><label className="block text-xs text-gray-600 mb-1">Obrigatório</label><select value={String(form.is_mandatory)} onChange={e => setForm(p => ({ ...p, is_mandatory: e.target.value === 'true' }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm"><option value="true">Sim</option><option value="false">Não</option></select></div>
          <div><label className="block text-xs text-gray-600 mb-1">Ação em Falha</label><select value={form.failure_action} onChange={e => setForm(p => ({ ...p, failure_action: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm"><option value="BLOCK">Bloquear</option><option value="WARN">Alertar</option><option value="REQUIRE_OVERRIDE">Exigir Aprovação</option></select></div>
        </div>
        <div><label className="block text-xs text-gray-600 mb-1">Regras do Gate (JSON)</label><textarea value={form.gate_rules} onChange={e => setForm(p => ({ ...p, gate_rules: e.target.value }))} rows={4} className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono" /></div>
        <button type="submit" disabled={loading} className="w-full rounded bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{loading ? 'Criando...' : 'Criar Gate'}</button>
      </form>
    </div>
  );
}
