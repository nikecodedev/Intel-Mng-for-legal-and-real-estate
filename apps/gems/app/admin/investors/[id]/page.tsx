'use client';

import { useState } from 'react';
import { useQuery } from 'react-query';
import Link from 'next/link';
import { DateDisplay, BlockLoader } from '@/components/ui';
import { api } from '@/lib/api';
import {
  fetchInvestorById,
  fetchInvestorAssignedAssets,
  type AssignedAssetItem,
} from '@/lib/crm-api';
import { fetchMatchesForInvestor, type MatchRecord } from '@/lib/matching-api';

function matchScoreColor(score: number) {
  if (score >= 80) return 'text-green-700 bg-green-100';
  if (score >= 50) return 'text-amber-700 bg-amber-100';
  return 'text-gray-700 bg-gray-100';
}

function FindMatchesButton({ investorId }: { investorId: string }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  async function run() {
    setLoading(true); setMsg('');
    try {
      const { data } = await api.post(`/matching/find-matches/${investorId}`);
      setMsg(`Encontrado(s) ${data?.matches?.length ?? data?.count ?? 0} resultado(s).`);
    } catch { setMsg('Falhou.'); }
    finally { setLoading(false); }
  }
  return (
    <span className="inline-flex items-center gap-1">
      <button onClick={run} disabled={loading} className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50">{loading ? 'Buscando...' : 'Buscar Compatíveis'}</button>
      {msg && <span className="text-xs text-gray-600">{msg}</span>}
    </span>
  );
}

function AutoNotifyButton({ investorId }: { investorId: string }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  async function run() {
    setLoading(true); setMsg('');
    try {
      await api.post(`/matching/auto-notify/${investorId}`);
      setMsg('Notificado.');
    } catch { setMsg('Falhou.'); }
    finally { setLoading(false); }
  }
  return (
    <span className="inline-flex items-center gap-1">
      <button onClick={run} disabled={loading} className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50">{loading ? 'Notificando...' : 'Auto-Notificar'}</button>
      {msg && <span className="text-xs text-gray-600">{msg}</span>}
    </span>
  );
}

export default function AdminInvestorDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;

  const { data: investor, isLoading: invLoading, error: invError } = useQuery(
    ['crm-investor', id],
    () => fetchInvestorById(id),
    { staleTime: 60 * 1000 }
  );
  const { data: assignedAssets = [], isLoading: assetsLoading } = useQuery(
    ['crm-investor-assigned', id],
    () => fetchInvestorAssignedAssets(id),
    { staleTime: 60 * 1000, enabled: !!id }
  );
  const { data: matchesData, isLoading: matchesLoading } = useQuery(
    ['matching-matches', id],
    () => fetchMatchesForInvestor(id, { limit: 50 }),
    { staleTime: 60 * 1000, enabled: !!id, retry: false }
  );
  const matches = matchesData?.matches ?? [];

  if (invLoading) return <BlockLoader message="Carregando investidor…" />;

  if (invError || !investor) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        Investidor não encontrado ou sem permissão de acesso.
      </div>
    );
  }

  const name = [investor.first_name, investor.last_name].filter(Boolean).join(' ') || investor.email;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{name}</h2>
        <div className="flex items-center gap-2">
          <Link href={`/admin/investors/${id}/kyc`} className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">KYC</Link>
          <Link href={`/admin/investors/${id}/preferences`} className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Preferências</Link>
          <FindMatchesButton investorId={id} />
          <AutoNotifyButton investorId={id} />
          <Link href="/admin/investors" className="text-sm text-blue-600 hover:underline">← Voltar</Link>
        </div>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Detalhes do investidor</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-600">E-mail</dt>
          <dd className="font-medium">{investor.email}</dd>
          <dt className="text-gray-600">Empresa</dt>
          <dd className="font-medium">{investor.company_name ?? '—'}</dd>
          <dt className="text-gray-600">Ativo</dt>
          <dd className="font-medium">{investor.is_active ? 'Sim' : 'Não'}</dd>
          <dt className="text-gray-600">Último login</dt>
          <dd className="font-medium"><DateDisplay value={investor.last_login_at} style="medium" /></dd>
          <dt className="text-gray-600">Criado em</dt>
          <dd className="font-medium"><DateDisplay value={investor.created_at} style="medium" /></dd>
        </dl>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Ativos atribuídos</h3>
        {assetsLoading ? (
          <p className="text-sm text-gray-500">Carregando…</p>
        ) : assignedAssets.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum ativo atribuído.</p>
        ) : (
          <ul className="space-y-2">
            {(assignedAssets as AssignedAssetItem[]).map((item) => (
              <li key={item.link_id} className="flex items-center justify-between text-sm">
                <Link
                  href={`/auctions/${item.asset.id}`}
                  className="text-blue-600 hover:underline"
                >
                  {item.asset.title || item.asset.asset_reference || item.asset.id.slice(0, 8)}
                </Link>
                <span className="text-gray-500">
                  Etapa: {item.asset.current_stage} · Risco: {item.asset.risk_score}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Pontuações de compatibilidade</h3>
        {matchesLoading ? (
          <p className="text-sm text-gray-500">Carregando…</p>
        ) : matches.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum registro de compatibilidade. Execute a busca para ver as pontuações.</p>
        ) : (
          <ul className="space-y-2">
            {(matches as MatchRecord[]).map((m) => (
              <li key={m.id} className="flex items-center justify-between text-sm">
                <Link href={`/auctions/${m.auction_asset_id}`} className="text-blue-600 hover:underline">
                  Ativo {m.auction_asset_id?.slice(0, 8) ?? m.id}
                </Link>
                <span
                  className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${matchScoreColor(Number(m.match_score))}`}
                  title="Match score (backend)"
                >
                  {m.match_score}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
