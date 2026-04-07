'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Liability {
  id?: string;
  type: string;
  amount: number;
  due_date: string;
  creditor: string;
  status?: string;
  created_at?: string;
}

const LIABILITY_TYPES = [
  { value: 'IPTU', label: 'IPTU' },
  { value: 'CONDOMINIO', label: 'Condomínio' },
  { value: 'AGUA', label: 'Água' },
  { value: 'LUZ', label: 'Luz' },
  { value: 'OUTROS', label: 'Outros' },
];

export default function RealEstateLiabilitiesPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    type: 'IPTU',
    amount: '',
    due_date: '',
    creditor: '',
  });

  useEffect(() => {
    loadLiabilities();
  }, [id]);

  async function loadLiabilities() {
    try {
      const res = await api.get(`/real-estate-assets/${id}/liabilities`);
      const list = res.data?.data ?? res.data?.liabilities ?? [];
      setLiabilities(Array.isArray(list) ? list : []);
    } catch {
      setLiabilities([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError(''); setSuccess('');
    try {
      await api.post(`/real-estate-assets/${id}/liabilities`, {
        type: form.type,
        amount: Number(form.amount),
        due_date: form.due_date,
        creditor: form.creditor,
      });
      setSuccess('Passivo registrado com sucesso.');
      setForm({ type: 'IPTU', amount: '', due_date: '', creditor: '' });
      loadLiabilities();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Falha ao registrar passivo.');
    } finally {
      setSubmitting(false);
    }
  }

  const totalAmount = liabilities.reduce((sum, l) => sum + Number(l.amount || 0), 0);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Passivos do Imóvel</h1>
        <Link href={`/real-estate/${id}`} className="text-sm text-blue-600 hover:underline">Voltar ao imóvel</Link>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>}
      {success && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded p-3">{success}</p>}

      {/* Total */}
      {totalAmount > 0 && (
        <div className={`rounded-lg border p-4 ${totalAmount > 10000 ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
          <p className="text-sm font-medium text-gray-700">Total de Passivos</p>
          <p className={`text-2xl font-bold ${totalAmount > 10000 ? 'text-red-700' : 'text-gray-900'}`}>
            R$ {totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          {totalAmount > 10000 && (
            <p className="text-xs text-red-600 mt-1">Passivo acima de R$ 10.000 — notificação automática enviada ao Owner.</p>
          )}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <h3 className="text-sm font-medium text-gray-500">Adicionar Passivo</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Tipo</label>
            <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
              {LIABILITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Valor (R$)</label>
            <input type="number" step="0.01" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Data de Vencimento</label>
            <input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Credor</label>
            <input value={form.creditor} onChange={e => setForm(p => ({ ...p, creditor: e.target.value }))} required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="Ex: Prefeitura Municipal" />
          </div>
        </div>
        <button type="submit" disabled={submitting} className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
          {submitting ? 'Salvando...' : 'Adicionar Passivo'}
        </button>
      </form>

      {/* List */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-500">Passivos Registrados</h3>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-gray-500">Carregando...</p>
        ) : liabilities.length === 0 ? (
          <p className="p-6 text-sm text-gray-400">Nenhum passivo registrado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-6 py-3 text-left">Tipo</th>
                <th className="px-6 py-3 text-left">Valor</th>
                <th className="px-6 py-3 text-left">Vencimento</th>
                <th className="px-6 py-3 text-left">Credor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {liabilities.map((l, i) => (
                <tr key={l.id ?? i} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-gray-800">{LIABILITY_TYPES.find(t => t.value === l.type)?.label ?? l.type}</td>
                  <td className="px-6 py-3 text-gray-600">R$ {Number(l.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="px-6 py-3 text-gray-600">{l.due_date ? new Date(l.due_date).toLocaleDateString('pt-BR') : '-'}</td>
                  <td className="px-6 py-3 text-gray-600">{l.creditor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
