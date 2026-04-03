'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import Link from 'next/link';
import { DateDisplay, CurrencyDisplay, BlockLoader } from '@/components/ui';
import { fetchAssetById, fetchCostBreakdown, type RealEstateAsset } from '@/lib/real-estate-api';
import { StatusProgressionTimeline } from '@/components/real-estate/StatusProgressionTimeline';
import { api } from '@/lib/api';

// Valid state transitions
const STATE_TRANSITIONS: Record<string, string[]> = {
  ACQUIRED: ['REGULARIZATION'],
  REGULARIZATION: ['RENOVATION'],
  RENOVATION: ['READY'],
  READY: ['SOLD', 'RENTED'],
};

const STATE_BADGE_COLORS: Record<string, string> = {
  ACQUIRED: 'bg-blue-100 text-blue-800',
  REGULARIZATION: 'bg-yellow-100 text-yellow-800',
  RENOVATION: 'bg-orange-100 text-orange-800',
  READY: 'bg-green-100 text-green-800',
  SOLD: 'bg-purple-100 text-purple-800',
  RENTED: 'bg-teal-100 text-teal-800',
};

export default function RealEstateAssetDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const queryClient = useQueryClient();

  // State transition form state
  const [transitionState, setTransitionState] = useState('');
  const [transitionReason, setTransitionReason] = useState('');
  const [transitionLoading, setTransitionLoading] = useState(false);
  const [transitionError, setTransitionError] = useState('');
  const [transitionSuccess, setTransitionSuccess] = useState('');

  // Cost form state
  const [costForm, setCostForm] = useState({
    regularization_cost: '',
    renovation_cost: '',
    maintenance_cost: '',
    taxes: '',
    legal_costs: '',
    other_costs: '',
  });
  const [costLoading, setCostLoading] = useState(false);
  const [costError, setCostError] = useState('');
  const [costSuccess, setCostSuccess] = useState('');

  // Individual cost form state
  const [indCostType, setIndCostType] = useState('');
  const [indCostAmount, setIndCostAmount] = useState('');
  const [indCostDesc, setIndCostDesc] = useState('');
  const [indCostLoading, setIndCostLoading] = useState(false);
  const [indCostError, setIndCostError] = useState('');
  const [indCostSuccess, setIndCostSuccess] = useState('');

  // Vacancy state
  const [vacancyLoading, setVacancyLoading] = useState(false);
  const [vacancyError, setVacancyError] = useState('');
  const [vacancySuccess, setVacancySuccess] = useState('');

  const { data: asset, isLoading: assetLoading, error: assetError } = useQuery(
    ['real-estate-asset', id],
    () => fetchAssetById(id),
    {
      staleTime: 60 * 1000,
      onSuccess: (data: any) => {
        const d = data as RealEstateAsset;
        setCostForm({
          regularization_cost: d.regularization_cost != null ? String(d.regularization_cost) : '',
          renovation_cost: d.renovation_cost != null ? String(d.renovation_cost) : '',
          maintenance_cost: d.maintenance_cost != null ? String(d.maintenance_cost) : '',
          taxes: d.taxes != null ? String(d.taxes) : '',
          legal_costs: d.legal_costs != null ? String(d.legal_costs) : '',
          other_costs: d.other_costs != null ? String(d.other_costs) : '',
        });
      },
    }
  );

  const { data: breakdown, isLoading: breakdownLoading, error: breakdownError } = useQuery(
    ['real-estate-cost-breakdown', id],
    () => fetchCostBreakdown(id),
    { staleTime: 60 * 1000, retry: false }
  );

  // Custo Total query
  const { data: costsTotal, isLoading: costsTotalLoading } = useQuery(
    ['real-estate-costs-total', id],
    async () => { const r = await api.get(`/assets/${id}/costs/total`); return r.data?.data ?? r.data; },
    { staleTime: 60 * 1000, retry: false }
  );

  // Vacancy query
  const { data: vacancyData, refetch: refetchVacancy } = useQuery(
    ['real-estate-vacancy', id],
    async () => { const r = await api.get(`/assets/${id}`); return r.data?.data ?? r.data; },
    { staleTime: 60 * 1000, retry: false, enabled: false }
  );

  // Individual cost submit
  const handleAddCost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!indCostType || !indCostAmount) {
      setIndCostError('Preencha o tipo e o valor do custo.');
      return;
    }
    setIndCostLoading(true);
    setIndCostError('');
    setIndCostSuccess('');
    try {
      await api.post(`/assets/${id}/costs`, {
        cost_type: indCostType,
        amount_cents: Math.round(parseFloat(indCostAmount) * 100),
        description: indCostDesc.trim() || undefined,
      });
      setIndCostSuccess('Custo adicionado com sucesso.');
      setIndCostType('');
      setIndCostAmount('');
      setIndCostDesc('');
      queryClient.invalidateQueries(['real-estate-costs-total', id]);
      queryClient.invalidateQueries(['real-estate-cost-breakdown', id]);
      queryClient.invalidateQueries(['real-estate-asset', id]);
    } catch (err: any) {
      setIndCostError(err?.response?.data?.message || 'Falha ao adicionar custo.');
    } finally {
      setIndCostLoading(false);
    }
  };

  // Vacancy update
  const handleVacancyUpdate = async (isVacant: boolean) => {
    setVacancyLoading(true);
    setVacancyError('');
    setVacancySuccess('');
    try {
      await api.put(`/assets/${id}/vacancy`, { is_vacant: isVacant });
      setVacancySuccess(isVacant ? 'Marcado como vago.' : 'Marcado como ocupado.');
      queryClient.invalidateQueries(['real-estate-asset', id]);
    } catch (err: any) {
      setVacancyError(err?.response?.data?.message || 'Falha ao atualizar vacancia.');
    } finally {
      setVacancyLoading(false);
    }
  };

  const handleTransition = async () => {
    if (!transitionState) {
      setTransitionError('Selecione um estado destino.');
      return;
    }
    setTransitionLoading(true);
    setTransitionError('');
    setTransitionSuccess('');
    try {
      await api.post(`/assets/${id}/transition`, {
        to_state: transitionState,
        reason: transitionReason,
      });
      setTransitionSuccess(`Transicionado para ${transitionState} com sucesso.`);
      setTransitionState('');
      setTransitionReason('');
      queryClient.invalidateQueries(['real-estate-asset', id]);
      queryClient.invalidateQueries(['real-estate-cost-breakdown', id]);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Falha na transicao.';
      setTransitionError(msg);
    } finally {
      setTransitionLoading(false);
    }
  };

  const handleSaveCosts = async () => {
    setCostLoading(true);
    setCostError('');
    setCostSuccess('');
    try {
      const payload: Record<string, number | null> = {};
      for (const [key, val] of Object.entries(costForm)) {
        payload[key] = val !== '' ? Number(val) : null;
      }
      await api.put(`/assets/${id}`, payload);
      setCostSuccess('Custos atualizados com sucesso.');
      queryClient.invalidateQueries(['real-estate-asset', id]);
      queryClient.invalidateQueries(['real-estate-cost-breakdown', id]);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Falha ao salvar custos.';
      setCostError(msg);
    } finally {
      setCostLoading(false);
    }
  };

  if (assetLoading) return <BlockLoader message="Carregando imovel..." />;

  if (assetError || !asset) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        Imovel nao encontrado ou voce nao tem acesso.
      </div>
    );
  }

  const a = asset as RealEstateAsset;
  const validNextStates = STATE_TRANSITIONS[a.current_state] ?? [];
  const badgeColor = STATE_BADGE_COLORS[a.current_state] ?? 'bg-gray-100 text-gray-800';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 font-mono">{a.asset_code}</h2>
        <Link href="/real-estate" className="text-sm text-blue-600 hover:underline">
          Voltar para lista
        </Link>
      </div>

      {/* Basic info */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Imovel</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-600">Endereco</dt>
          <dd className="font-medium">{a.property_address}</dd>
          <dt className="text-gray-600">Tipo</dt>
          <dd className="font-medium">{a.property_type ?? '—'}</dd>
          <dt className="text-gray-600">Area (m²)</dt>
          <dd className="font-medium">{a.property_size_sqm ?? '—'}</dd>
          <dt className="text-gray-600">Quartos</dt>
          <dd className="font-medium">{a.number_of_rooms ?? '—'}</dd>
          <dt className="text-gray-600">Data de aquisicao</dt>
          <dd className="font-medium"><DateDisplay value={a.acquisition_date} style="short" /></dd>
          <dt className="text-gray-600">Preco de aquisicao</dt>
          <dd className="font-medium">
            {a.acquisition_price_cents != null ? <CurrencyDisplay cents={a.acquisition_price_cents} /> : '—'}
          </dd>
        </dl>
      </section>

      {/* Status progression timeline */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-4">Progressao de Status</h3>
        <StatusProgressionTimeline
          currentState={a.current_state}
          stateChangedAt={a.state_changed_at}
          stateChangeReason={a.state_change_reason}
        />
      </section>

      {/* Cost breakdown */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Detalhamento de Custos</h3>
        {breakdownLoading && <p className="text-sm text-gray-500">Carregando...</p>}
        {breakdownError ? (
          <p className="text-sm text-gray-500">Detalhamento de custos indisponivel.</p>
        ) : null}
        {breakdown && !breakdownError && breakdown?.formatted && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-600">Aquisicao (preco)</dt>
            <dd className="font-medium">{breakdown.formatted.acquisition_price ?? '—'}</dd>
            <dt className="text-gray-600">Aquisicao (custos)</dt>
            <dd className="font-medium">{breakdown.formatted.acquisition_cost ?? '—'}</dd>
            <dt className="text-gray-600">Regularizacao</dt>
            <dd className="font-medium">{breakdown.formatted.regularization_cost ?? '—'}</dd>
            <dt className="text-gray-600">Reforma</dt>
            <dd className="font-medium">{breakdown.formatted.renovation_cost ?? '—'}</dd>
            <dt className="text-gray-600">Manutencao</dt>
            <dd className="font-medium">{breakdown.formatted.maintenance_cost ?? '—'}</dd>
            <dt className="text-gray-600">Impostos</dt>
            <dd className="font-medium">{breakdown.formatted.taxes_cost ?? '—'}</dd>
            <dt className="text-gray-600">Juridico</dt>
            <dd className="font-medium">{breakdown.formatted.legal_cost ?? '—'}</dd>
            <dt className="text-gray-600">Outros</dt>
            <dd className="font-medium">{breakdown.formatted.other_cost ?? '—'}</dd>
            <dt className="text-gray-600">Total de custos</dt>
            <dd className="font-medium">{breakdown.formatted.total_cost ?? '—'}</dd>
            <dt className="text-gray-600">Custo real total</dt>
            <dd className="font-semibold">{breakdown.formatted.total_real_cost ?? '—'}</dd>
          </dl>
        )}
      </section>

      {/* Change Status */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Alterar Status</h3>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm text-gray-600">Status atual:</span>
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${badgeColor}`}>
            {a.current_state}
          </span>
        </div>
        {validNextStates.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={transitionState}
                onChange={(e) => { setTransitionState(e.target.value); setTransitionError(''); setTransitionSuccess(''); }}
                className="rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selecione o estado destino...</option>
                {validNextStates.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <input
                type="text"
                value={transitionReason}
                onChange={(e) => setTransitionReason(e.target.value)}
                placeholder="Motivo da transicao"
                className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleTransition}
                disabled={transitionLoading || !transitionState}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {transitionLoading ? 'Transicionando...' : 'Transicionar'}
              </button>
            </div>
            {transitionError && (
              <p className="text-sm text-red-600">{transitionError}</p>
            )}
            {transitionSuccess && (
              <p className="text-sm text-green-600">{transitionSuccess}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Nenhuma transicao disponivel para este estado.</p>
        )}
      </section>

      {/* Update Costs */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Atualizar Custos</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {([
            ['regularization_cost', 'Custo de Regularizacao'],
            ['renovation_cost', 'Custo de Reforma'],
            ['maintenance_cost', 'Custo de Manutencao'],
            ['taxes', 'Impostos'],
            ['legal_costs', 'Custos Juridicos'],
            ['other_costs', 'Outros Custos'],
          ] as [keyof typeof costForm, string][]).map(([field, label]) => (
            <div key={field}>
              <label className="block text-xs text-gray-600 mb-1">{label}</label>
              <input
                type="number"
                step="0.01"
                value={costForm[field]}
                onChange={(e) => { setCostForm((prev) => ({ ...prev, [field]: e.target.value })); setCostError(''); setCostSuccess(''); }}
                placeholder="0.00"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSaveCosts}
            disabled={costLoading}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {costLoading ? 'Salvando...' : 'Salvar Custos'}
          </button>
          {costError && <p className="text-sm text-red-600">{costError}</p>}
          {costSuccess && <p className="text-sm text-green-600">{costSuccess}</p>}
        </div>
      </section>

      {/* Custo Total */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Custo Total</h3>
        {costsTotalLoading && <p className="text-sm text-gray-500">Carregando...</p>}
        {costsTotal ? (
          <div className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900">
                {costsTotal.total_cents != null
                  ? `R$ ${(costsTotal.total_cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  : costsTotal.total != null
                    ? `R$ ${Number(costsTotal.total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    : 'R$ 0,00'}
              </span>
            </div>
            {costsTotal.breakdown && typeof costsTotal.breakdown === 'object' && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {Object.entries(costsTotal.breakdown).map(([key, val]: [string, any]) => (
                  <div key={key} className="contents">
                    <dt className="text-gray-600 capitalize">{key.replace(/_/g, ' ')}</dt>
                    <dd className="font-medium">
                      {typeof val === 'number'
                        ? `R$ ${(val / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                        : String(val)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ) : !costsTotalLoading ? (
          <p className="text-sm text-gray-500">Nenhum custo registrado ainda.</p>
        ) : null}
      </section>

      {/* Adicionar Custo Individual */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Adicionar Custo</h3>
        <form onSubmit={handleAddCost} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Tipo de Custo *</label>
              <select
                value={indCostType}
                onChange={(e) => { setIndCostType(e.target.value); setIndCostError(''); setIndCostSuccess(''); }}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                required
              >
                <option value="">Selecione...</option>
                <option value="regularization">Regularizacao</option>
                <option value="renovation">Reforma</option>
                <option value="maintenance">Manutencao</option>
                <option value="taxes">Impostos</option>
                <option value="legal">Juridico</option>
                <option value="other">Outros</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Valor (R$) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={indCostAmount}
                onChange={(e) => { setIndCostAmount(e.target.value); setIndCostError(''); setIndCostSuccess(''); }}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Descricao</label>
              <input
                type="text"
                value={indCostDesc}
                onChange={(e) => setIndCostDesc(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="ex. Pintura externa"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={indCostLoading || !indCostType || !indCostAmount}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {indCostLoading ? 'Adicionando...' : 'Adicionar Custo'}
            </button>
            {indCostError && <p className="text-sm text-red-600">{indCostError}</p>}
            {indCostSuccess && <p className="text-sm text-green-600">{indCostSuccess}</p>}
          </div>
        </form>
      </section>

      {/* Gestao de Vacancia */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Gestao de Vacancia</h3>
        <div className="flex items-center gap-4 mb-3">
          <span className="text-sm text-gray-600">Status atual:</span>
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
            (a as any).is_vacant === true
              ? 'bg-red-100 text-red-800'
              : (a as any).is_vacant === false
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-800'
          }`}>
            {(a as any).is_vacant === true ? 'Vago' : (a as any).is_vacant === false ? 'Ocupado' : 'Nao informado'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleVacancyUpdate(true)}
            disabled={vacancyLoading}
            className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {vacancyLoading ? 'Atualizando...' : 'Marcar como Vago'}
          </button>
          <button
            onClick={() => handleVacancyUpdate(false)}
            disabled={vacancyLoading}
            className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {vacancyLoading ? 'Atualizando...' : 'Marcar como Ocupado'}
          </button>
        </div>
        {vacancyError && <p className="mt-2 text-sm text-red-600">{vacancyError}</p>}
        {vacancySuccess && <p className="mt-2 text-sm text-green-600">{vacancySuccess}</p>}
      </section>

      {/* Linked auction reference */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Leilao vinculado</h3>
        {a.auction_asset_id ? (
          <p className="text-sm">
            <Link
              href={`/auctions/${a.auction_asset_id}`}
              className="font-medium text-blue-600 hover:underline"
            >
              Ver leilao
            </Link>
            <span className="text-gray-500 ml-2 font-mono text-xs">{a.auction_asset_id.slice(0, 8)}…</span>
          </p>
        ) : (
          <p className="text-sm text-gray-500">Nenhum leilao vinculado.</p>
        )}
      </section>

      {/* Linked documents */}
      {(a.linked_document_ids || []).length > 0 && (
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-3">Documentos vinculados</h3>
          <ul className="space-y-1">
            {(a.linked_document_ids || []).map((docId: string) => (
              <li key={docId}>
                <Link href={`/legal/documents/${docId}`} className="text-sm text-blue-600 hover:underline">
                  Documento {docId.slice(0, 8)}...
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
