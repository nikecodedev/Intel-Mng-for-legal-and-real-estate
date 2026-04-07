'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface LegalInfo {
  regularization_status?: string;
  matricula?: string;
  registry_office?: string;
  notes?: string;
}

export default function RealEstateLegalPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [asset, setAsset] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get(`/real-estate-assets/${id}`);
        setAsset(res.data?.data ?? res.data?.asset ?? res.data);
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Falha ao carregar dados do imóvel.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const status = asset?.regularization_status ?? asset?.status ?? 'DESCONHECIDO';
  const isBlocked = status === 'EM_REGULARIZACAO';

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Regularização Jurídica</h1>
        <Link href={`/real-estate/${id}`} className="text-sm text-blue-600 hover:underline">Voltar ao imóvel</Link>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Carregando...</p>
      ) : (
        <>
          {isBlocked && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-800">Trava de Venda Legal</p>
              <p className="text-sm text-amber-700 mt-1">
                Este imóvel está em regularização. Operações de venda estão bloqueadas até a conclusão do processo.
              </p>
            </div>
          )}

          <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
            <h3 className="text-sm font-medium text-gray-500">Dados de Regularização</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <dt className="text-gray-600">Situação</dt>
              <dd>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  isBlocked ? 'bg-amber-100 text-amber-700' :
                  status === 'REGULARIZADO' ? 'bg-green-100 text-green-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {status}
                </span>
              </dd>
              <dt className="text-gray-600">Matrícula</dt>
              <dd className="font-medium">{asset?.matricula ?? asset?.registration_number ?? '-'}</dd>
              <dt className="text-gray-600">Cartório</dt>
              <dd className="font-medium">{asset?.registry_office ?? '-'}</dd>
              <dt className="text-gray-600">Endereço</dt>
              <dd className="font-medium">{asset?.address ?? '-'}</dd>
              <dt className="text-gray-600">Tipo</dt>
              <dd className="font-medium">{asset?.property_type ?? asset?.type ?? '-'}</dd>
              <dt className="text-gray-600">Área (m²)</dt>
              <dd className="font-medium">{asset?.area_sqm ?? '-'}</dd>
            </dl>
            {asset?.notes && (
              <div className="pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500">Observações</p>
                <p className="text-sm text-gray-700 mt-1">{asset.notes}</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
