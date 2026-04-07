'use client';

import { useQuery } from 'react-query';
import { api } from '@/lib/api';
import { BlockLoader, CurrencyDisplay } from '@/components/ui';

interface RoiEntry {
  id: string;
  project_name: string;
  asset_code: string | null;
  total_invested_cents: number;
  current_value_cents: number;
  roi_percentage: number;
}

async function fetchRoi() {
  const { data } = await api.get<{ success: boolean; data: { entries: RoiEntry[] } }>('/finance/roi');
  return data?.data?.entries ?? [];
}

export default function RoiPage() {
  const { data: entries, isLoading, error } = useQuery(
    'finance-roi',
    fetchRoi,
    { staleTime: 60_000 }
  );

  if (isLoading) return <BlockLoader message="Carregando ROI..." />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">ROI por Projeto</h2>
        <p className="text-sm text-gray-500">Retorno sobre investimento por projeto ou ativo</p>
        <p className="text-xs text-amber-600 mt-1">Nota: O recalculo automatico de ROI e acionado a cada nova transacao financeira vinculada ao ativo.</p>
      </div>

      {error || !entries?.length ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
          Nenhum dado de ROI disponivel.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Projeto</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ativo</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Investido</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Valor Atual</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">ROI %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {entries.map((entry) => {
                const roiColor = entry.roi_percentage >= 0 ? 'text-green-700' : 'text-red-700';
                return (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{entry.project_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{entry.asset_code || '—'}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">
                      <CurrencyDisplay cents={entry.total_invested_cents} />
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">
                      <CurrencyDisplay cents={entry.current_value_cents} />
                    </td>
                    <td className={`px-4 py-3 text-sm text-right font-semibold ${roiColor}`}>
                      {entry.roi_percentage >= 0 ? '+' : ''}{entry.roi_percentage.toFixed(2)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
