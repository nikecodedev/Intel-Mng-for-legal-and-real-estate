'use client';

import { useState } from 'react';
import { useQuery } from 'react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function CloseAssetPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch asset to check liabilities
  const { data: asset, isLoading: assetLoading } = useQuery(
    ['real-estate-asset-close', id],
    async () => {
      const { data } = await api.get(`/assets/${id}`);
      return data?.data ?? data;
    },
    { staleTime: 30_000 }
  );

  const liabilities = Number(asset?.total_liabilities ?? asset?.liabilities ?? 0);
  const hasLiabilities = liabilities > 0;

  async function handleClose() {
    if (hasLiabilities) return;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await api.post(`/assets/${id}/transition`, {
        to_state: 'SOLD',
        reason: 'Encerramento do ativo',
      });
      setSuccess('Ativo encerrado com sucesso.');
      setTimeout(() => router.push('/real-estate'), 1500);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Falha ao encerrar o ativo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Encerramento do Ativo</h1>
        <Link href={`/real-estate/${id}`} className="text-sm text-blue-600 hover:underline">Voltar</Link>
      </div>

      {assetLoading ? (
        <p className="text-sm text-gray-500">Carregando dados do ativo...</p>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-600">Codigo</dt>
            <dd className="font-medium">{asset?.asset_code ?? id.slice(0, 8)}</dd>
            <dt className="text-gray-600">Status Atual</dt>
            <dd className="font-medium">{asset?.current_state ?? '-'}</dd>
            <dt className="text-gray-600">Passivos Pendentes</dt>
            <dd className="font-medium">
              R$ {(liabilities / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </dd>
          </dl>

          {hasLiabilities && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-4">
              <p className="text-sm text-red-700 font-medium">
                Bloqueio: Este ativo possui passivos pendentes no valor de R$ {(liabilities / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.
                O encerramento so e permitido quando todos os passivos forem quitados (R$ 0,00).
              </p>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}

          <button
            onClick={handleClose}
            disabled={loading || hasLiabilities}
            className="rounded bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title={hasLiabilities ? 'Passivos pendentes impedem o encerramento' : ''}
          >
            {loading ? 'Encerrando...' : 'Confirmar Encerramento'}
          </button>
        </div>
      )}
    </div>
  );
}
