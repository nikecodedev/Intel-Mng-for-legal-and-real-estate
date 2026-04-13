'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function AuctionPostPage({ params }: { params: { id: string } }) {
  const { id } = params;

  const [checklist, setChecklist] = useState({
    homologacao_ok: false,
    auto_arrematacao: false,
    itbi_pago: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function toggle(field: keyof typeof checklist) {
    setChecklist((p) => ({ ...p, [field]: !p[field] }));
  }

  async function handleSave() {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await api.post(`/auctions/assets/${id}/transition`, {
        to_stage: 'F4',
        metadata: checklist,
      });
      setSuccess('Dados de pos-arrematacao salvos com sucesso.');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Falha ao salvar dados de pos-arrematacao.');
    } finally {
      setLoading(false);
    }
  }

  const allDone = checklist.homologacao_ok && checklist.auto_arrematacao && checklist.itbi_pago;

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Pos-Arrematacao (F4)</h1>
        <Link href={`/auctions/${id}`} className="text-sm text-blue-600 hover:underline">Voltar ao Lote</Link>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>}
      {success && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded p-3">{success}</p>}

      <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <h3 className="text-sm font-medium text-gray-500">Checklist Pos-Arrematacao</h3>

        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={checklist.homologacao_ok} onChange={() => toggle('homologacao_ok')} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm text-gray-700">Homologacao concluida</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={checklist.auto_arrematacao} onChange={() => toggle('auto_arrematacao')} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm text-gray-700">Auto de arrematacao emitido</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={checklist.itbi_pago} onChange={() => toggle('itbi_pago')} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm text-gray-700">ITBI pago</span>
          </label>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <span className="text-sm text-gray-600">Status:</span>
          <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${allDone ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
            {allDone ? 'Completo' : 'Pendente'}
          </span>
        </div>

        <button
          onClick={handleSave}
          disabled={loading}
          className="rounded bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}
