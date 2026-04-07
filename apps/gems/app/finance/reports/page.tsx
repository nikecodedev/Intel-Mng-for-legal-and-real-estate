'use client';

import { useQuery } from 'react-query';
import { api } from '@/lib/api';
import { BlockLoader, CurrencyDisplay } from '@/components/ui';

interface ReportSummary {
  dre: {
    receita_total_cents: number;
    despesa_total_cents: number;
    resultado_liquido_cents: number;
  };
  cash_flow: {
    entradas_cents: number;
    saidas_cents: number;
    saldo_cents: number;
  };
  capex_opex: {
    capex_cents: number;
    opex_cents: number;
    total_cents: number;
  };
}

async function fetchReports() {
  const { data } = await api.get<{ success: boolean; data: ReportSummary }>('/finance/reports/summary');
  return data?.data;
}

function SummaryCard({ title, items }: { title: string; items: { label: string; value: number; highlight?: boolean }[] }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 uppercase">{title}</h3>
      <dl className="space-y-2">
        {items.map(({ label, value, highlight }) => (
          <div key={label} className={`flex justify-between text-sm ${highlight ? 'border-t pt-2 font-semibold' : ''}`}>
            <dt className="text-gray-500">{label}</dt>
            <dd className={value >= 0 ? 'text-gray-900' : 'text-red-600'}>
              <CurrencyDisplay cents={value} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function ReportsPage() {
  const { data, isLoading, error } = useQuery(
    'finance-reports',
    fetchReports,
    { staleTime: 60_000 }
  );

  if (isLoading) return <BlockLoader message="Carregando relatorios..." />;

  if (error || !data) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Relatorios Financeiros</h2>
          <p className="text-sm text-gray-500">DRE, Fluxo de Caixa e CAPEX/OPEX</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
          Nenhum dado de relatorio disponivel.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Relatorios Financeiros</h2>
          <p className="text-sm text-gray-500">DRE, Fluxo de Caixa e CAPEX/OPEX</p>
        </div>
        <button
          onClick={() => alert('Exportacao PDF sera implementada em breve.')}
          className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Exportar PDF
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryCard
          title="DRE"
          items={[
            { label: 'Receita Total', value: data.dre.receita_total_cents },
            { label: 'Despesa Total', value: data.dre.despesa_total_cents },
            { label: 'Resultado Liquido', value: data.dre.resultado_liquido_cents, highlight: true },
          ]}
        />
        <SummaryCard
          title="Fluxo de Caixa"
          items={[
            { label: 'Entradas', value: data.cash_flow.entradas_cents },
            { label: 'Saidas', value: data.cash_flow.saidas_cents },
            { label: 'Saldo', value: data.cash_flow.saldo_cents, highlight: true },
          ]}
        />
        <SummaryCard
          title="CAPEX / OPEX"
          items={[
            { label: 'CAPEX', value: data.capex_opex.capex_cents },
            { label: 'OPEX', value: data.capex_opex.opex_cents },
            { label: 'Total', value: data.capex_opex.total_cents, highlight: true },
          ]}
        />
      </div>
    </div>
  );
}
