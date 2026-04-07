'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Work {
  id?: string;
  description: string;
  estimated_cost: number;
  start_date: string;
  end_date: string;
  status: string;
  created_at?: string;
}

export default function RealEstateWorksPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    description: '',
    estimated_cost: '',
    start_date: '',
    end_date: '',
    status: 'PLANEJADA',
  });

  useEffect(() => {
    loadWorks();
  }, [id]);

  async function loadWorks() {
    try {
      const res = await api.get(`/real-estate-assets/${id}/works`);
      const list = res.data?.data ?? res.data?.works ?? [];
      setWorks(Array.isArray(list) ? list : []);
    } catch {
      // Endpoint pode não existir ainda — mostra lista vazia
      setWorks([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError(''); setSuccess('');
    try {
      await api.post(`/real-estate-assets/${id}/works`, {
        description: form.description,
        estimated_cost: Number(form.estimated_cost),
        start_date: form.start_date,
        end_date: form.end_date,
        status: form.status,
      });
      setSuccess('Obra registrada com sucesso.');
      setForm({ description: '', estimated_cost: '', start_date: '', end_date: '', status: 'PLANEJADA' });
      loadWorks();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Falha ao registrar obra.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Obras e Reformas</h1>
        <Link href={`/real-estate/${id}`} className="text-sm text-blue-600 hover:underline">Voltar ao imóvel</Link>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>}
      {success && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded p-3">{success}</p>}

      {/* Form */}
      <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <h3 className="text-sm font-medium text-gray-500">Registrar Nova Obra</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs text-gray-600 mb-1">Descrição da Obra</label>
            <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="Ex: Reforma do telhado" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Custo Estimado (R$)</label>
            <input type="number" step="0.01" value={form.estimated_cost} onChange={e => setForm(p => ({ ...p, estimated_cost: e.target.value }))} required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Situação</label>
            <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
              <option value="PLANEJADA">Planejada</option>
              <option value="EM_ANDAMENTO">Em Andamento</option>
              <option value="CONCLUIDA">Concluída</option>
              <option value="CANCELADA">Cancelada</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Data de Início</label>
            <input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Data de Término</label>
            <input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <button type="submit" disabled={submitting} className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
          {submitting ? 'Salvando...' : 'Registrar Obra'}
        </button>
      </form>

      {/* List */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-500">Obras Registradas</h3>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-gray-500">Carregando...</p>
        ) : works.length === 0 ? (
          <p className="p-6 text-sm text-gray-400">Nenhuma obra registrada.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-6 py-3 text-left">Descrição</th>
                <th className="px-6 py-3 text-left">Custo Est.</th>
                <th className="px-6 py-3 text-left">Início</th>
                <th className="px-6 py-3 text-left">Término</th>
                <th className="px-6 py-3 text-left">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {works.map((w, i) => (
                <tr key={w.id ?? i} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-gray-800">{w.description}</td>
                  <td className="px-6 py-3 text-gray-600">R$ {Number(w.estimated_cost).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="px-6 py-3 text-gray-600">{w.start_date ? new Date(w.start_date).toLocaleDateString('pt-BR') : '-'}</td>
                  <td className="px-6 py-3 text-gray-600">{w.end_date ? new Date(w.end_date).toLocaleDateString('pt-BR') : '-'}</td>
                  <td className="px-6 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      w.status === 'CONCLUIDA' ? 'bg-green-100 text-green-700' :
                      w.status === 'EM_ANDAMENTO' ? 'bg-blue-100 text-blue-700' :
                      w.status === 'CANCELADA' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{w.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
