'use client';

import { useQuery } from 'react-query';
import { useState } from 'react';
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

function fmt(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, error } = useQuery(
    'finance-reports',
    fetchReports,
    { staleTime: 60_000 }
  );

  // Spec 2.4: PDF export com marca d'água forense (User_ID, IP, Timestamp, Tenant_ID)
  async function handleExportPdf() {
    if (!data) return;
    setExporting(true);
    try {
      // Fetch forensic watermark from backend (includes server-side IP)
      const wmRes = await api.get('/finance/reports/pdf-watermark');
      const wm = wmRes.data?.watermark ?? {};
      const wmText = `CONFIDENCIAL — ${wm.user_email} | ${wm.user_id} | IP: ${wm.ip_address} | Tenant: ${wm.tenant_id} | ${new Date(wm.timestamp).toLocaleString('pt-BR')}`;

      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Relatório Financeiro</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, sans-serif; font-size: 12px; }
    body { padding: 32px; color: #111; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    .subtitle { color: #666; margin-bottom: 24px; font-size: 11px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
    .card { border: 1px solid #ddd; border-radius: 6px; padding: 14px; }
    .card h2 { font-size: 10px; text-transform: uppercase; color: #555; margin-bottom: 10px; letter-spacing: .5px; }
    .row { display: flex; justify-content: space-between; padding: 3px 0; }
    .row.highlight { border-top: 1px solid #ccc; margin-top: 6px; padding-top: 6px; font-weight: bold; }
    .neg { color: #dc2626; }

    /* Forensic watermark — Spec 2.4 */
    .watermark {
      position: fixed; bottom: 0; left: 0; right: 0;
      background: rgba(0,0,0,0.85); color: rgba(255,255,255,0.9);
      font-size: 9px; text-align: center; padding: 5px;
      letter-spacing: .3px;
    }
    @media print {
      .watermark { position: fixed; bottom: 0; left: 0; right: 0; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    /* Diagonal stamp watermark */
    .stamp {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      pointer-events: none; overflow: hidden; z-index: 0;
    }
    .stamp svg { width: 100%; height: 100%; opacity: 0.06; }
    .content { position: relative; z-index: 1; }
  </style>
</head>
<body>
<div class="stamp">
  <svg><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"
    font-size="42" font-family="Arial" fill="#000"
    transform="rotate(-30, 400, 300)">${wmText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text></svg>
</div>
<div class="content">
  <h1>Relatórios Financeiros</h1>
  <p class="subtitle">Gerado em ${new Date().toLocaleString('pt-BR')} — DRE, Fluxo de Caixa e CAPEX/OPEX</p>
  <div class="grid">
    <div class="card">
      <h2>DRE</h2>
      <div class="row"><span>Receita Total</span><span>${fmt(data.dre.receita_total_cents)}</span></div>
      <div class="row"><span>Despesa Total</span><span class="neg">${fmt(data.dre.despesa_total_cents)}</span></div>
      <div class="row highlight"><span>Resultado Líquido</span><span class="${data.dre.resultado_liquido_cents < 0 ? 'neg' : ''}">${fmt(data.dre.resultado_liquido_cents)}</span></div>
    </div>
    <div class="card">
      <h2>Fluxo de Caixa</h2>
      <div class="row"><span>Entradas</span><span>${fmt(data.cash_flow.entradas_cents)}</span></div>
      <div class="row"><span>Saídas</span><span class="neg">${fmt(data.cash_flow.saidas_cents)}</span></div>
      <div class="row highlight"><span>Saldo</span><span class="${data.cash_flow.saldo_cents < 0 ? 'neg' : ''}">${fmt(data.cash_flow.saldo_cents)}</span></div>
    </div>
    <div class="card">
      <h2>CAPEX / OPEX</h2>
      <div class="row"><span>CAPEX</span><span>${fmt(data.capex_opex.capex_cents)}</span></div>
      <div class="row"><span>OPEX</span><span>${fmt(data.capex_opex.opex_cents)}</span></div>
      <div class="row highlight"><span>Total</span><span>${fmt(data.capex_opex.total_cents)}</span></div>
    </div>
  </div>
</div>
<div class="watermark">${wmText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
<script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`;

      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
      }
    } catch {
      alert('Falha ao gerar PDF. Tente novamente.');
    } finally {
      setExporting(false);
    }
  }

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
          onClick={handleExportPdf}
          disabled={exporting}
          className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {exporting ? 'Gerando...' : 'Exportar PDF'}
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
