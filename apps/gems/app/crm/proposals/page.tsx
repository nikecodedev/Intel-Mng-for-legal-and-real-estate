'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Proposal {
  id: string;
  investor_id?: string;
  investor_name?: string;
  asset_id?: string;
  asset_reference?: string;
  amount_cents?: number;
  status?: string;
  created_at?: string;
}

export default function CrmProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get('/crm/proposals', { params: { limit: 100 } });
        const list = data?.proposals ?? data?.data ?? [];
        setProposals(Array.isArray(list) ? list : []);
      } catch {
        setError('Nao foi possivel carregar propostas.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Propostas</h1>
      <p className="text-sm text-gray-600">Lista de propostas enviadas a investidores.</p>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Carregando...</p>
      ) : proposals.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-500">Nenhuma proposta encontrada.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Investidor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ativo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Valor (R$)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {proposals.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.investor_name ?? p.investor_id?.slice(0, 8) ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{p.asset_reference ?? p.asset_id?.slice(0, 8) ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {p.amount_cents != null ? `R$ ${(p.amount_cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      p.status === 'ACCEPTED' ? 'bg-green-100 text-green-700' :
                      p.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {p.status ?? 'PENDENTE'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
