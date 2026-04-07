'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

export default function FinanceMobilePage() {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [gpsActive] = useState(true); // stub

  async function handleCapture() {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const amountCents = Math.round(parseFloat(amount || '0') * 100);
      if (amountCents <= 0) throw new Error('Informe um valor valido.');
      await api.post('/finance/transactions', {
        transaction_type: 'EXPENSE',
        amount_cents: amountCents,
        currency: 'BRL',
        transaction_date: new Date().toISOString().split('T')[0],
        description: description.trim() || 'Despesa capturada via mobile',
        notes: 'Captura mobile - Zero Footprint',
      });
      setSuccess('Despesa registrada com sucesso.');
      setDescription('');
      setAmount('');
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Falha ao registrar despesa.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Lancador Mobile</h1>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 flex items-center gap-2">
        <span className="text-lg">🛡️</span>
        <span>Zero Footprint — nenhum dado permanece no dispositivo apos o envio.</span>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descricao</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: Almoco com cliente"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            className="flex items-center gap-2 rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            onClick={() => alert('Funcionalidade de camera sera implementada em breve.')}
          >
            📷 Camera
          </button>

          <div className="flex items-center gap-1 text-sm">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${gpsActive ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-gray-600">GPS {gpsActive ? 'Ativo' : 'Inativo'}</span>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}

        <button
          onClick={handleCapture}
          disabled={loading}
          className="w-full rounded bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Enviando...' : 'Registrar Despesa'}
        </button>
      </div>
    </div>
  );
}
