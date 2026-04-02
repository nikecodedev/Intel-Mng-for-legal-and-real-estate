'use client';

import { useQuery } from 'react-query';
import { api } from '@/lib/api';

export default function ReconciliationPage() {
  const { data, isLoading, isError } = useQuery('finance-reconciliation', async () => {
    const res = await api.get('/finance/reconciliation', { params: { limit: 100 } });
    return res.data?.movements ?? res.data?.data ?? res.data?.reconciliation ?? [];
  }, { staleTime: 30_000, retry: false });

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Bank Reconciliation</h2>

      {isLoading ? <p className="text-sm text-gray-500">Loading...</p> : isError ? (
        <p className="text-sm text-gray-500">Reconciliation data not available.</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-gray-500">No reconciliation movements found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Description</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Amount</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Match Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Matched Transaction</th>
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
                      {m.matched ? 'Matched' : 'Unmatched'}
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
