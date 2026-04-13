'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface AuctionAsset {
  id: string;
  title?: string;
  description?: string;
  current_stage?: string;
  risk_score?: number;
  created_at?: string;
  // Debt ratio fields for MPGA 30% rule
  debt_amount_cents?: number;
  appraised_value_cents?: number;
}

const STAGES = [
  { key: 'F0', label: 'F0 - Intake' },
  { key: 'F1', label: 'F1 - Triagem' },
  { key: 'F2', label: 'F2 - Due Diligence' },
  { key: 'F3', label: 'F3 - Lance' },
  { key: 'F4', label: 'F4 - Pós-Arrematação' },
];

/** Normaliza o stage do backend para F0-F4 */
function normalizeStage(stage?: string): string {
  if (!stage) return 'F0';
  const upper = stage.toUpperCase().trim();
  if (upper.startsWith('F0') || upper === 'INTAKE') return 'F0';
  if (upper.startsWith('F1') || upper === 'TRIAGEM') return 'F1';
  if (upper.startsWith('F2') || upper === 'DUE_DILIGENCE' || upper === 'DUE DILIGENCE') return 'F2';
  if (upper.startsWith('F3') || upper === 'LANCE' || upper === 'BID') return 'F3';
  if (upper.startsWith('F4') || upper === 'POS_ARREMATACAO' || upper === 'POST_AUCTION') return 'F4';
  return 'F0';
}

function riskColor(score?: number): string {
  if (score == null) return 'bg-gray-100 text-gray-600';
  if (score >= 0.8) return 'bg-green-100 text-green-700';
  if (score >= 0.5) return 'bg-yellow-100 text-yellow-700';
  return 'bg-red-100 text-red-700';
}

export default function AuctionsPipelinePage() {
  const [assets, setAssets] = useState<AuctionAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get('/auctions/assets', { params: { limit: 500 } });
        const list = res.data?.data?.assets ?? res.data?.assets ?? res.data?.data ?? [];
        setAssets(Array.isArray(list) ? list : []);
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Falha ao carregar ativos de leilão.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const grouped: Record<string, AuctionAsset[]> = {};
  for (const s of STAGES) grouped[s.key] = [];
  for (const a of assets) {
    const stage = normalizeStage(a.current_stage);
    if (!grouped[stage]) grouped[stage] = [];
    grouped[stage].push(a);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Funil MPGA - Pipeline de Leilões</h1>
        <Link href="/auctions" className="text-sm text-blue-600 hover:underline">Voltar para Leilões</Link>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Carregando pipeline...</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map((stage) => (
            <div key={stage.key} className="flex-shrink-0 w-72">
              <div className="rounded-lg border border-gray-200 bg-gray-50">
                <div className="px-4 py-3 border-b border-gray-200 bg-white rounded-t-lg">
                  <h2 className="text-sm font-semibold text-gray-700">{stage.label}</h2>
                  <span className="text-xs text-gray-400">{grouped[stage.key].length} ativo(s)</span>
                </div>
                <div className="p-2 space-y-2 min-h-[200px] max-h-[600px] overflow-y-auto">
                  {grouped[stage.key].length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-8">Nenhum ativo nesta fase</p>
                  ) : (
                    grouped[stage.key].map((asset) => (
                      <Link
                        key={asset.id}
                        href={`/auctions/${asset.id}`}
                        className="block rounded-lg border border-gray-200 bg-white p-3 hover:shadow-md transition-shadow"
                      >
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {asset.title || asset.description?.slice(0, 40) || 'Ativo sem título'}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${riskColor(asset.risk_score)}`}>
                            {asset.risk_score != null ? `Risco: ${(asset.risk_score * 100).toFixed(0)}%` : 'Sem score'}
                          </span>
                          {asset.created_at && (
                            <span className="text-[10px] text-gray-400">
                              {new Date(asset.created_at).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                        {/* Spec 12: MPGA — dívida acima de 30% da avaliação */}
                        {asset.debt_amount_cents != null && asset.appraised_value_cents != null && asset.appraised_value_cents > 0 &&
                          asset.debt_amount_cents > 0.30 * asset.appraised_value_cents && (
                          <div className="mt-1">
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-red-100 text-red-700 border border-red-300">
                              DÍVIDA ACIMA DE 30%
                            </span>
                          </div>
                        )}
                      </Link>
                    ))
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
