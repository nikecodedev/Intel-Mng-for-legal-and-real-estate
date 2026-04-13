'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Deadline {
  id?: string;
  title: string;
  due_date: string;
  days_until_due: number;
  status: string;
}

function statusBadge(status: string) {
  switch (status?.toUpperCase()) {
    case 'OVERDUE': return 'bg-red-100 text-red-700';
    case 'URGENT': return 'bg-orange-100 text-orange-700';
    case 'UPCOMING': return 'bg-yellow-100 text-yellow-700';
    case 'OK': return 'bg-green-100 text-green-700';
    default: return 'bg-gray-100 text-gray-700';
  }
}

export default function LegalDeadlinesPage() {
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get('/dashboards/kpis');
        const kpis = data?.data ?? data;
        // Try to extract deadlines from KPIs response
        const dl = kpis?.deadlines ?? kpis?.upcoming_deadlines ?? [];
        setDeadlines(Array.isArray(dl) ? dl : []);
      } catch {
        setError('Nao foi possivel carregar prazos.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Prazos e Agenda</h1>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Carregando prazos...</p>
      ) : deadlines.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-500">Nenhum prazo encontrado.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Titulo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vencimento</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dias Restantes</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {deadlines.map((d, i) => (
                <tr key={d.id ?? i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{d.title}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{new Date(d.due_date).toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{d.days_until_due} dias</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(d.status)}`}>
                      {d.status}
                    </span>
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
