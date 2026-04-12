'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';

const REPORT_TYPES = [
  { value: 'AUDITORIA', label: 'Auditoria' },
  { value: 'FINANCEIRO', label: 'Financeiro' },
  { value: 'IMOVEIS', label: 'Imóveis' },
  { value: 'LEILOES', label: 'Leilões' },
];

export default function AdminReportsPage() {
  const { user } = useAuth();
  const [reportType, setReportType] = useState('AUDITORIA');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  // Spec 2.4: Export PDF com marca d'água forense (User_ID, IP, Timestamp, Tenant_ID)
  async function handleGenerate() {
    setGenerating(true);
    setError('');
    try {
      // Fetch forensic watermark from backend (includes server-side IP)
      const wmRes = await api.get('/finance/reports/pdf-watermark');
      const wm = wmRes.data?.watermark ?? {};
      const now = new Date();
      const wmText = `CONFIDENCIAL — ${wm.user_email ?? user?.email ?? '—'} | User_ID: ${wm.user_id ?? user?.id ?? '—'} | IP: ${wm.ip_address ?? '—'} | Tenant_ID: ${wm.tenant_id ?? user?.tenant_id ?? '—'} | ${now.toLocaleString('pt-BR')}`;
      const reportLabel = REPORT_TYPES.find((t) => t.value === reportType)?.label ?? reportType;

      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Relatório ${reportLabel} — GEMS</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, sans-serif; font-size: 12px; }
    body { padding: 32px; color: #111; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    .subtitle { color: #666; margin-bottom: 24px; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { background: #f3f4f6; text-align: left; padding: 8px 10px; font-size: 10px; text-transform: uppercase; color: #555; letter-spacing: .4px; border-bottom: 1px solid #ddd; }
    td { padding: 7px 10px; border-bottom: 1px solid #eee; }
    /* Spec 2.5: Diagonal repeating watermark 30deg, opacity 0.15, 200px repeat */
    .wm-layer {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      pointer-events: none; overflow: hidden; z-index: 0;
    }
    .wm-layer canvas { display: block; width: 100%; height: 100%; }
    /* Footer watermark bar */
    .watermark-bar {
      position: fixed; bottom: 0; left: 0; right: 0;
      background: rgba(0,0,0,0.88); color: rgba(255,255,255,0.9);
      font-size: 8.5px; text-align: center; padding: 5px 8px;
      letter-spacing: .25px;
    }
    .content { position: relative; z-index: 1; }
    @media print {
      .watermark-bar { position: fixed; bottom: 0; left: 0; right: 0; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 600; }
    .badge-blue { background: #dbeafe; color: #1d4ed8; }
  </style>
</head>
<body>
<div class="wm-layer">
  <canvas id="wm"></canvas>
</div>
<div class="content">
  <h1>Relatório de ${reportLabel}</h1>
  <p class="subtitle">Gerado em ${now.toLocaleString('pt-BR')} &nbsp;·&nbsp; Exportado por: ${wm.user_email ?? user?.email ?? '—'} &nbsp;·&nbsp; Tipo: <span class="badge badge-blue">${reportType}</span></p>

  <table>
    <thead>
      <tr><th>Campo</th><th>Valor</th></tr>
    </thead>
    <tbody>
      <tr><td>Tipo de Relatório</td><td>${reportLabel}</td></tr>
      <tr><td>Exportado por</td><td>${wm.user_email ?? user?.email ?? '—'}</td></tr>
      <tr><td>User ID</td><td>${wm.user_id ?? user?.id ?? '—'}</td></tr>
      <tr><td>Tenant ID</td><td>${wm.tenant_id ?? user?.tenant_id ?? '—'}</td></tr>
      <tr><td>IP de Origem</td><td>${wm.ip_address ?? '—'}</td></tr>
      <tr><td>Data/Hora</td><td>${now.toLocaleString('pt-BR')}</td></tr>
    </tbody>
  </table>

  <p style="font-size:10px;color:#999;margin-top:40px;">
    Este documento foi gerado automaticamente pela plataforma GEMS e contém marca d&apos;água forense para fins de rastreabilidade e conformidade.
  </p>
</div>

<div class="watermark-bar">${wmText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>

<script>
// Spec 2.5: canvas watermark 30deg, opacity 0.15, repeating every 200px
(function() {
  var canvas = document.getElementById('wm');
  var ctx = canvas.getContext('2d');
  function draw() {
    canvas.width = window.innerWidth || 794;
    canvas.height = window.innerHeight || 1123;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.font = '11px Arial';
    ctx.fillStyle = '#000';
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-30 * Math.PI / 180);
    var w = canvas.width * 2, h = canvas.height * 2;
    for (var y = -h; y < 2 * h; y += 200) {
      for (var x = -w; x < 2 * w; x += 400) {
        ctx.fillText('${wmText.replace(/'/g, "\\'").replace(/</g, '').replace(/>/g, '')}', x, y);
      }
    }
    ctx.restore();
  }
  draw();
  window.addEventListener('resize', draw);
  window.onload = function() { window.print(); };
})();
<\/script>
</body>
</html>`;

      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
      } else {
        setError('Popup bloqueado. Permita pop-ups para este site e tente novamente.');
      }
    } catch {
      setError('Falha ao obter marca d\u2019água. Verifique sua conexão e tente novamente.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <DashboardLayout title="Exportar Relatório">
      <div className="max-w-xl space-y-6">
        <h1 className="text-xl font-bold text-gray-900">Exportar Relatório PDF</h1>

        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Relatório</label>
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

          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="rounded bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {generating ? 'Gerando...' : 'Exportar Relatório PDF'}
          </button>
        </div>

        <p className="text-xs text-gray-500">
          Todos os relatórios exportados contêm marca d&apos;água forense com User_ID, IP, Timestamp e Tenant_ID
          conforme Spec §2.4. O documento abre em nova aba para impressão/download.
        </p>
      </div>
    </DashboardLayout>
  );
}
