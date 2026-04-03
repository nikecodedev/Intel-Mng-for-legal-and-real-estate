'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function BankImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Selecione um arquivo OFX ou CSV para importar.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post('/finance/bank-reconciliation/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      setSuccess('Arquivo importado com sucesso! As transacoes serao processadas em breve.');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Falha ao importar arquivo. Verifique o formato e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Importar Extrato Bancario</h2>
        <Link href="/finance/reconciliation" className="text-sm text-blue-600 hover:underline">
          Voltar para conciliacao
        </Link>
      </div>
      <p className="text-sm text-gray-500">
        Importe um arquivo OFX ou CSV do seu banco para conciliar transacoes automaticamente.
      </p>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Arquivo do extrato (OFX ou CSV) *
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".ofx,.csv,.OFX,.CSV"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setError('');
                setSuccess('');
              }}
              className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
            />
            <p className="mt-1 text-xs text-gray-400">
              Formatos aceitos: OFX (Open Financial Exchange) e CSV. Tamanho maximo: 10MB.
            </p>
          </div>

          {file && (
            <div className="rounded-md bg-gray-50 border border-gray-200 p-3">
              <p className="text-sm text-gray-700">
                <span className="font-medium">Arquivo selecionado:</span> {file.name}
              </p>
              <p className="text-xs text-gray-500">
                Tamanho: {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {success && (
            <div className="rounded-md bg-green-50 border border-green-200 p-3">
              <p className="text-sm text-green-700 font-medium">{success}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !file}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 w-full"
          >
            {loading ? 'Importando...' : 'Importar Extrato'}
          </button>
        </form>
      </div>

      <div className="rounded-md bg-gray-50 border border-gray-200 p-3">
        <p className="text-xs text-gray-500">
          <strong>Dica:</strong> Apos a importacao, as transacoes do extrato serao comparadas com as transacoes ja registradas no sistema para conciliacao automatica.
        </p>
      </div>
    </div>
  );
}
