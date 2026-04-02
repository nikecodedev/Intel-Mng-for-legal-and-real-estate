'use client';

import { useQuery } from 'react-query';
import { api } from '@/lib/api';

export default function PayablesPage() {
  const { data, isLoading } = useQuery('finance-payables', async () => {
    const res = await api.get('/finance/payables', { params: { limit: 100 } });
    return res.data?.payables ?? res.data?.data ?? [];
  }, { staleTime: 30_000, retry: false });

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Accounts Payable</h2>

      {isLoading ? <p className="text-sm text-gray-500">Loading...</p> : !data || data.length === 0 ? (
        <p className="text-sm text-gray-500">No payables found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Description</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Amount</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Due Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Category</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((p: any) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{p.description ?? p.transaction_number ?? '-'}</td>
                  <td className="px-4 py-3">R$ {((p.amount_cents ?? 0) / 100).toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-500">{p.due_date ? new Date(p.due_date).toLocaleDateString() : '-'}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.payment_status === 'PAID' ? 'bg-green-100 text-green-700' : p.payment_status === 'OVERDUE' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{p.payment_status ?? 'PENDING'}</span></td>
                  <td className="px-4 py-3 text-gray-500">{p.transaction_category ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
