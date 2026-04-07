'use client';

import { useQuery, useQueryClient } from 'react-query';
import { useState } from 'react';
import { api } from '@/lib/api';

export default function FinanceApprovalsPage() {
  const queryClient = useQueryClient();
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data, isLoading } = useQuery('finance-approvals', async () => {
    const res = await api.get('/finance/transactions', { params: { payment_status: 'PENDING', limit: 100 } });
    const all = res.data?.transactions ?? [];
    return all.filter((t: any) => (t.amount_cents ?? 0) >= 500000);
  }, { staleTime: 30_000 });

  async function handleApprove(txId: string) {
    try {
      await api.post(`/finance/transactions/${txId}/mark-payment`, {
        paid_date: new Date().toISOString().split('T')[0],
        payment_method: 'APROVACAO_OWNER',
      });
      setActionMsg({ type: 'success', text: 'Transação aprovada.' });
      queryClient.invalidateQueries('finance-approvals');
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err?.response?.data?.message || 'Falha ao aprovar.' });
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Aprovações Pendentes (&gt; R$5.000)</h2>
      <p className="text-sm text-gray-500">Lançamentos acima de R$5.000 que requerem aprovação do Owner.</p>

      {actionMsg && <div className={`rounded-lg border p-3 text-sm ${actionMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{actionMsg.text}</div>}

      {isLoading ? <p className="text-sm text-gray-500">Carregando...</p> : !data || data.length === 0 ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
          <p className="text-sm text-green-700">Nenhuma aprovação pendente.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Número</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Valor</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Descrição</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Data</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((tx: any) => (
                <tr key={tx.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{tx.transaction_number}</td>
                  <td className="px-4 py-3 font-bold text-red-600">R$ {((tx.amount_cents ?? 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-gray-700">{tx.description ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{tx.transaction_date ? new Date(tx.transaction_date).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleApprove(tx.id)} className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700">Aprovar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
