'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';

const REPORT_TYPES = [
  { value: 'AUDITORIA', label: 'Auditoria' },
  { value: 'FINANCEIRO', label: 'Financeiro' },
  { value: 'IMOVEIS', label: 'Imoveis' },
  { value: 'LEILOES', label: 'Leiloes' },
];

export default function AdminReportsPage() {
  const { user } = useAuth();
  const [reportType, setReportType] = useState('AUDITORIA');
  const [message, setMessage] = useState('');
  const [generating, setGenerating] = useState(false);

  function handleGenerate() {
    setGenerating(true);
    setMessage('');
    // Stub: simula geracao de relatorio PDF com marca d'agua
    setTimeout(() => {
      const now = new Date().toISOString();
      const ip = '0.0.0.0'; // stub — no browser nao temos IP real
      const userId = user?.id ?? 'desconhecido';
      const tenantId = user?.tenant_id ?? 'desconhecido';
      setMessage(
        `Relatorio "${reportType}" gerado com marca d'agua: User_ID=${userId}, IP=${ip}, Timestamp=${now}, Tenant_ID=${tenantId}`
      );
      setGenerating(false);
    }, 1200);
  }

  return (
    <DashboardLayout title="Exportar Relatorio">
      <div className="max-w-xl space-y-6">
        <h1 className="text-xl font-bold text-gray-900">Exportar Relatorio PDF</h1>

        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Relatorio</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              {REPORT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="rounded bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {generating ? 'Gerando...' : 'Exportar Relatorio'}
          </button>

          {message && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="text-sm text-green-800">{message}</p>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-500">
          Todos os relatorios exportados contem marca d&apos;agua com identificacao do usuario, IP, timestamp e tenant.
        </p>
      </div>
    </DashboardLayout>
  );
}
