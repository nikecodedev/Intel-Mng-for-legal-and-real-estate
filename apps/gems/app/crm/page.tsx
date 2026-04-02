'use client';

import { useQuery } from 'react-query';
import { api } from '@/lib/api';

interface Investor {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

function fetchInvestors(): Promise<{ investors: Investor[]; total: number }> {
  return api.get('/crm/investors', { params: { limit: 100, offset: 0 } }).then((r) => r.data);
}

export default function CrmPage() {
  const { data, isLoading, error } = useQuery('crm-investors', fetchInvestors, { staleTime: 60_000 });

  const investors = data?.investors ?? [];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">CRM — Investidores</h2>

      {isLoading ? <p className="text-sm text-gray-500">Carregando investidores...</p> : null}
      {error ? <p className="text-sm text-red-600">Falha ao carregar investidores.</p> : null}

      {!isLoading && !error && investors.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
          Nenhum investidor cadastrado ainda.
        </div>
      ) : null}

      {investors.length > 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Nome</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">E-mail</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Empresa</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Situação</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Cadastrado em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {investors.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {[inv.first_name, inv.last_name].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{inv.email}</td>
                  <td className="px-4 py-3 text-gray-700">{inv.company_name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${inv.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {inv.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{new Date(inv.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-500">
            {data?.total ?? investors.length} investidor(es)
          </div>
        </div>
      ) : null}
    </div>
  );
}
