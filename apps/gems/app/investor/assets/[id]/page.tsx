'use client';

import { useState } from 'react';
import { useQuery } from 'react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function InvestorAssetDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [inquireLoading, setInquireLoading] = useState(false);
  const [inquireMsg, setInquireMsg] = useState('');
  const [logoutLoading, setLogoutLoading] = useState(false);

  const { data: asset, isLoading } = useQuery(['investor-asset', id], async () => {
    const res = await api.get(`/investor/assets/${id}`);
    return res.data?.asset ?? res.data?.data ?? res.data;
  }, { staleTime: 60_000, retry: false });

  const { data: roiData, isLoading: roiLoading } = useQuery(['investor-asset-roi', id], async () => {
    const res = await api.get(`/investor/assets/${id}/roi`);
    return res.data?.roi ?? res.data?.data ?? res.data;
  }, { staleTime: 60_000, retry: false });

  const { data: legalStatus, isLoading: legalLoading } = useQuery(['investor-asset-legal', id], async () => {
    const res = await api.get(`/investor/assets/${id}/legal-status`);
    return res.data?.legal_status ?? res.data?.data ?? res.data;
  }, { staleTime: 60_000, retry: false });

  async function handleInquire() {
    setInquireLoading(true); setInquireMsg('');
    try {
      await api.post(`/investor/assets/${id}/inquire`, {});
      setInquireMsg('Interesse manifestado com sucesso.');
    } catch (err: any) {
      setInquireMsg(err?.response?.data?.message || 'Falha ao manifestar interesse.');
    } finally {
      setInquireLoading(false);
    }
  }

  async function handleLogout() {
    setLogoutLoading(true);
    try {
      await api.post('/investor/auth/logout', {});
      router.push('/investor/login');
    } catch {
      router.push('/investor/login');
    } finally {
      setLogoutLoading(false);
    }
  }

  if (isLoading) return <p className="text-sm text-gray-500">Carregando...</p>;
  if (!asset) return <p className="text-sm text-red-600">Ativo não encontrado.</p>;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">{asset.title || asset.asset_reference || `Ativo ${id.slice(0, 8)}`}</h1>
        <div className="flex items-center gap-3">
          <Link href="/investor/assets" className="text-sm text-blue-600 hover:underline">Voltar aos ativos</Link>
          <button
            onClick={handleLogout}
            disabled={logoutLoading}
            className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {logoutLoading ? 'Saindo...' : 'Sair'}
          </button>
        </div>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-600">Tipo</dt><dd className="font-medium">{asset.auction_type ?? asset.property_type ?? '-'}</dd>
          <dt className="text-gray-600">Etapa</dt><dd className="font-medium">{asset.current_stage ?? asset.current_state ?? '-'}</dd>
          <dt className="text-gray-600">Endereço</dt><dd className="font-medium">{asset.property_address ?? '-'}</dd>
          <dt className="text-gray-600">Pontuação de Risco</dt><dd className="font-medium">{asset.risk_score ?? '-'}%</dd>
        </dl>
      </section>

      {/* ROI */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Retorno sobre Investimento (ROI)</h2>
        {roiLoading ? (
          <p className="text-sm text-gray-500">Carregando ROI...</p>
        ) : roiData ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-600">ROI Estimado</dt>
            <dd className="font-medium">{roiData.estimated_roi != null ? `${Number(roiData.estimated_roi).toFixed(2)}%` : '-'}</dd>
            <dt className="text-gray-600">ROI Realizado</dt>
            <dd className="font-medium">{roiData.actual_roi != null ? `${Number(roiData.actual_roi).toFixed(2)}%` : '-'}</dd>
            <dt className="text-gray-600">Valor Investido</dt>
            <dd className="font-medium">{roiData.total_investment != null ? `R$ ${Number(roiData.total_investment / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}</dd>
            <dt className="text-gray-600">Valor Atual</dt>
            <dd className="font-medium">{roiData.current_value != null ? `R$ ${Number(roiData.current_value / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}</dd>
            <dt className="text-gray-600">Lucro/Prejuízo</dt>
            <dd className="font-medium">{roiData.profit_loss != null ? `R$ ${Number(roiData.profit_loss / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}</dd>
          </dl>
        ) : (
          <p className="text-sm text-gray-500">Dados de ROI indisponíveis.</p>
        )}
      </section>

      {/* Situação Jurídica */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Situação Jurídica</h2>
        {legalLoading ? (
          <p className="text-sm text-gray-500">Carregando situação jurídica...</p>
        ) : legalStatus ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-600">Status</dt>
            <dd className="font-medium">
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                legalStatus.status === 'CLEAR' ? 'bg-green-100 text-green-800' :
                legalStatus.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                {legalStatus.status === 'CLEAR' ? 'Regular' :
                 legalStatus.status === 'PENDING' ? 'Pendente' :
                 legalStatus.status ?? '-'}
              </span>
            </dd>
            <dt className="text-gray-600">Pendências</dt>
            <dd className="font-medium">{legalStatus.pending_issues ?? legalStatus.pending_count ?? 0}</dd>
            <dt className="text-gray-600">Última Verificação</dt>
            <dd className="font-medium">{legalStatus.last_checked ? new Date(legalStatus.last_checked).toLocaleDateString('pt-BR') : '-'}</dd>
            {legalStatus.notes && (
              <>
                <dt className="text-gray-600">Observações</dt>
                <dd className="font-medium">{legalStatus.notes}</dd>
              </>
            )}
          </dl>
        ) : (
          <p className="text-sm text-gray-500">Dados jurídicos indisponíveis.</p>
        )}
      </section>

      <div className="flex items-center gap-3">
        <button onClick={handleInquire} disabled={inquireLoading} className="rounded bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
          {inquireLoading ? 'Manifestando Interesse...' : 'Manifestar Interesse'}
        </button>
        {inquireMsg && <p className={`text-sm ${inquireMsg.includes('Falha') ? 'text-red-600' : 'text-green-600'}`}>{inquireMsg}</p>}
      </div>
    </div>
  );
}
