'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { api } from '@/lib/api';

export default function ReceivablesPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ debtor_name: '', amount_cents: '', due_date: '', description: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const { data, isLoading } = useQuery('finance-receivables', async () => {
    const res = await api.get('/finance/receivables', { params: { limit: 100 } });
    return res.data?.receivables ?? res.data?.data ?? [];
  }, { staleTime: 30_000, retry: false });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(''); setSuccess('');
    try {
      await api.post('/finance/receivables', {
        debtor_name: form.debtor_name,
        amount_cents: form.amount_cents ? Math.round(parseFloat(form.amount_cents) * 100) : 0,
        due_date: form.due_date || undefined,
        description: form.description || undefined,
      });
      setSuccess('Conta a receber criada.');
      setForm({ debtor_name: '', amount_cents: '', due_date: '', description: '' });
      setShowCreate(false);
      queryClient.invalidateQueries('finance-receivables');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Falha ao criar conta a receber.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Contas a Receber</h2>
        <button onClick={() => setShowCreate(!showCreate)} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">Nova Conta a Receber</button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-gray-600 mb-1">Devedor</label><input value={form.debtor_name} onChange={e => setForm(p => ({ ...p, debtor_name: e.target.value }))} required className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm" /></div>
            <div><label className="block text-xs text-gray-600 mb-1">Valor (R$)</label><input type="number" step="0.01" value={form.amount_cents} onChange={e => setForm(p => ({ ...p, amount_cents: e.target.value }))} required className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm" /></div>
            <div><label className="block text-xs text-gray-600 mb-1">Vencimento</label><input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm" /></div>
            <div><label className="block text-xs text-gray-600 mb-1">Descrição</label><input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm" /></div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={loading} className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white disabled:opacity-50">{loading ? 'Criando...' : 'Criar'}</button>
            <button type="button" onClick={() => setShowCreate(false)} className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-700">Cancelar</button>
          </div>
        </form>
      )}

      {isLoading ? <p className="text-sm text-gray-500">Carregando...</p> : !data || data.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhuma conta a receber encontrada.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Devedor</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Valor</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Vencimento</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((r: any) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.debtor_name ?? '-'}</td>
                  <td className="px-4 py-3">R$ {((r.amount_cents ?? 0) / 100).toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-500">{r.due_date ? new Date(r.due_date).toLocaleDateString() : '-'}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.payment_status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{r.payment_status ?? 'PENDING'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
