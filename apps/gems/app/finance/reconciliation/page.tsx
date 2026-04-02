'use client';

import { useQuery } from 'react-query';
import { api } from '@/lib/api';

export default function ReconciliationPage() {
  const { data, isLoading, isError } = useQuery('finance-reconciliation', async () => {
    const res = await api.get('/finance/bank-reconciliation/unreconciled', { params: { limit: 100 } });
    return res.data?.transactions ?? res.data?.data ?? res.data?.movements ?? [];
  }, { staleTime: 30_000, retry: false });

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Conciliação Bancária</h2>

      {isLoading ? <p className="text-sm text-gray-500">Carregando...</p> : isError ? (
        <p className="text-sm text-gray-500">Dados de conciliação indisponíveis.</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhum movimento de conciliação encontrado.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Data</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Descrição</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Valor</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status da Conciliação</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Transação Conciliada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((m: any, i: number) => (
                <tr key={m.id ?? i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500">{m.date ? new Date(m.date).toLocaleDateString() : m.transaction_date ? new Date(m.transaction_date).toLocaleDateString() : '-'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{m.description ?? '-'}</td>
                  <td className="px-4 py-3">R$ {((m.amount_cents ?? m.amount ?? 0) / 100).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${m.matched ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {m.matched ? 'Conciliado' : 'Não Conciliado'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-500">{m.matched_transaction_id ? m.matched_transaction_id.slice(0, 8) + '...' : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
