'use client';

import { useQuery } from 'react-query';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';

export default function InvestorPage() {
  const profileQ = useQuery('investor-me', async () => {
    const res = await api.get('/investor/me');
    return res.data?.investor ?? res.data ?? null;
  }, { staleTime: 60_000, retry: false });

  const assetsQ = useQuery('investor-assets-home', async () => {
    const res = await api.get('/investor/assets', { params: { limit: 100 } });
    return res.data?.assets ?? res.data?.data ?? [];
  }, { staleTime: 60_000, retry: false });

  const profile: any   = profileQ.data;
  const assets: any[]  = assetsQ.data ?? [];

  const featuredAssets = assets.slice(0, 6);

  const statCards = [
    { label: 'Ativos Disponíveis',  value: assets.length,                                    color: '#3B82F6' },
    { label: 'Em Leilão',           value: assets.filter((a: any) => a.current_stage).length, color: '#F59E0B' },
    { label: 'Imóveis',             value: assets.filter((a: any) => a.property_address).length, color: '#10B981' },
    { label: 'Alto ROI (>10%)',     value: assets.filter((a: any) => (a.roi_percent ?? 0) > 10).length, color: '#8B5CF6' },
  ];

  const displayName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email
    : null;

  return (
    <DashboardLayout title="Portal do Investidor">
      <div className="space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {displayName ? `Bem-vindo, ${displayName}` : 'Portal do Investidor'}
            </h1>
            <p className="text-sm text-gray-500 mt-1">Acompanhe os seus ativos e oportunidades de investimento.</p>
          </div>
          {profile?.company_name && (
            <span className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700">
              {profile.company_name}
            </span>
          )}
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {statCards.map((card) => (
            <div key={card.label} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium text-gray-500 mb-1">{card.label}</p>
              <p className="text-3xl font-bold text-gray-900">
                {assetsQ.isLoading ? '…' : card.value}
              </p>
              <div className="mt-2 h-1 rounded-full bg-gray-100">
                <div className="h-1 rounded-full" style={{ backgroundColor: card.color, width: `${Math.min((card.value / Math.max(assets.length, 1)) * 100, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link href="/investor/assets"
            className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm hover:border-blue-300 hover:shadow-md transition-all flex items-center gap-4">
            <div className="rounded-lg bg-blue-50 p-3 text-2xl">🏠</div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">Ver Todos os Ativos</p>
              <p className="text-xs text-gray-500 mt-0.5">{assets.length} disponíveis</p>
            </div>
          </Link>
          <Link href="/profile"
            className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm hover:border-blue-300 hover:shadow-md transition-all flex items-center gap-4">
            <div className="rounded-lg bg-green-50 p-3 text-2xl">👤</div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">Meu Perfil</p>
              <p className="text-xs text-gray-500 mt-0.5">KYC e preferências</p>
            </div>
          </Link>
          <Link href="/legal/documents"
            className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm hover:border-blue-300 hover:shadow-md transition-all flex items-center gap-4">
            <div className="rounded-lg bg-purple-50 p-3 text-2xl">📄</div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">Documentos</p>
              <p className="text-xs text-gray-500 mt-0.5">Acesso aos documentos partilhados</p>
            </div>
          </Link>
        </div>

        {/* Featured Assets */}
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-800">Oportunidades de Investimento</h2>
            <Link href="/investor/assets" className="text-xs text-blue-600 hover:underline">Ver todos</Link>
          </div>
          {assetsQ.isLoading ? (
            <p className="px-6 py-6 text-sm text-gray-400">Carregando ativos...</p>
          ) : featuredAssets.length === 0 ? (
            <p className="px-6 py-6 text-sm text-gray-400">Nenhum ativo disponível de momento.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
              {featuredAssets.map((a: any) => (
                <Link key={a.id} href={`/investor/assets/${a.id}`}
                  className="rounded-lg border border-gray-100 p-4 hover:border-blue-200 hover:shadow-sm transition-all">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-medium text-gray-900 text-sm truncate max-w-[70%]">
                      {a.title || a.asset_reference || `Ativo ${a.id.slice(0, 8)}`}
                    </h3>
                    <span className="text-xs rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 font-medium shrink-0">
                      {a.current_stage ?? a.current_state ?? '—'}
                    </span>
                  </div>
                  {a.property_address && (
                    <p className="text-xs text-gray-500 mb-2 truncate">{a.property_address}</p>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    {a.roi_percent != null ? (
                      <span className={`text-xs font-semibold ${a.roi_percent >= 10 ? 'text-green-600' : 'text-gray-600'}`}>
                        ROI {Number(a.roi_percent).toFixed(1)}%
                      </span>
                    ) : <span />}
                    {a.risk_score != null && (
                      <span className={`text-xs ${a.risk_score >= 70 ? 'text-red-500' : a.risk_score >= 40 ? 'text-yellow-600' : 'text-green-600'}`}>
                        Risco {a.risk_score}%
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Info Note */}
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
          Portal em modo <strong>leitura</strong>. Para questões sobre oportunidades, contacte o seu gestor de conta.
        </div>

      </div>
    </DashboardLayout>
  );
}
