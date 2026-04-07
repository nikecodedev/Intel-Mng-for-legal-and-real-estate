'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Proposal {
  id?: string;
  proposer_name: string;
  proposed_value: number;
  proposal_type: string;
  status: string;
  notes?: string;
  created_at?: string;
}

export default function RealEstateCommercialPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [asset, setAsset] = useState<any>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    listing_type: 'VENDA',
    asking_price: '',
    description: '',
  });
  const [proposalForm, setProposalForm] = useState({
    proposer_name: '',
    proposed_value: '',
    proposal_type: 'COMPRA',
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    try {
      const [assetRes, proposalsRes] = await Promise.allSettled([
        api.get(`/real-estate-assets/${id}`),
        api.get(`/real-estate-assets/${id}/proposals`),
      ]);
      if (assetRes.status === 'fulfilled') {
        setAsset(assetRes.value.data?.data ?? assetRes.value.data?.asset ?? assetRes.value.data);
      }
      if (proposalsRes.status === 'fulfilled') {
        const list = proposalsRes.value.data?.data ?? proposalsRes.value.data?.proposals ?? [];
        setProposals(Array.isArray(list) ? list : []);
      }
    } catch {
      // Silently handle — partial data is fine
    } finally {
      setLoading(false);
    }
  }

  async function handlePublish(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError(''); setSuccess('');
    try {
      await api.post(`/real-estate-assets/${id}/listing`, {
        listing_type: form.listing_type,
        asking_price: Number(form.asking_price),
        description: form.description,
      });
      setSuccess('Anúncio publicado com sucesso.');
      loadData();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Falha ao publicar anúncio.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddProposal(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError(''); setSuccess('');
    try {
      await api.post(`/real-estate-assets/${id}/proposals`, {
        proposer_name: proposalForm.proposer_name,
        proposed_value: Number(proposalForm.proposed_value),
        proposal_type: proposalForm.proposal_type,
        notes: proposalForm.notes,
      });
      setSuccess('Proposta registrada com sucesso.');
      setProposalForm({ proposer_name: '', proposed_value: '', proposal_type: 'COMPRA', notes: '' });
      loadData();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Falha ao registrar proposta.');
    } finally {
      setSubmitting(false);
    }
  }

  const contractStatus = asset?.contract_status ?? asset?.listing_status ?? null;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Venda / Locação</h1>
        <Link href={`/real-estate/${id}`} className="text-sm text-blue-600 hover:underline">Voltar ao imóvel</Link>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>}
      {success && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded p-3">{success}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Carregando...</p>
      ) : (
        <>
          {/* Contract status */}
          {contractStatus && (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-sm text-gray-500">Situação do Contrato</p>
              <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                contractStatus === 'ATIVO' || contractStatus === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                contractStatus === 'PENDENTE' || contractStatus === 'PENDING' ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-600'
              }`}>{contractStatus}</span>
            </div>
          )}

          {/* Publish listing */}
          <form onSubmit={handlePublish} className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
            <h3 className="text-sm font-medium text-gray-500">Publicar Anúncio</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Tipo de Anúncio</label>
                <select value={form.listing_type} onChange={e => setForm(p => ({ ...p, listing_type: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
                  <option value="VENDA">Venda</option>
                  <option value="LOCACAO">Locação</option>
                  <option value="VENDA_LOCACAO">Venda e Locação</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Valor Pedido (R$)</label>
                <input type="number" step="0.01" value={form.asking_price} onChange={e => setForm(p => ({ ...p, asking_price: e.target.value }))} required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-600 mb-1">Descrição do Anúncio</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="Detalhes do imóvel para o anúncio..." />
              </div>
            </div>
            <button type="submit" disabled={submitting} className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
              {submitting ? 'Publicando...' : 'Publicar Anúncio'}
            </button>
          </form>

          {/* Add proposal */}
          <form onSubmit={handleAddProposal} className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
            <h3 className="text-sm font-medium text-gray-500">Registrar Proposta</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Nome do Proponente</label>
                <input value={proposalForm.proposer_name} onChange={e => setProposalForm(p => ({ ...p, proposer_name: e.target.value }))} required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Valor Proposto (R$)</label>
                <input type="number" step="0.01" value={proposalForm.proposed_value} onChange={e => setProposalForm(p => ({ ...p, proposed_value: e.target.value }))} required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Tipo</label>
                <select value={proposalForm.proposal_type} onChange={e => setProposalForm(p => ({ ...p, proposal_type: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
                  <option value="COMPRA">Compra</option>
                  <option value="LOCACAO">Locação</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Observações</label>
                <input value={proposalForm.notes} onChange={e => setProposalForm(p => ({ ...p, notes: e.target.value }))} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
              </div>
            </div>
            <button type="submit" disabled={submitting} className="rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50">
              {submitting ? 'Salvando...' : 'Registrar Proposta'}
            </button>
          </form>

          {/* Proposals list */}
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-500">Propostas Recebidas</h3>
            </div>
            {proposals.length === 0 ? (
              <p className="p-6 text-sm text-gray-400">Nenhuma proposta registrada.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-6 py-3 text-left">Proponente</th>
                    <th className="px-6 py-3 text-left">Valor</th>
                    <th className="px-6 py-3 text-left">Tipo</th>
                    <th className="px-6 py-3 text-left">Situação</th>
                    <th className="px-6 py-3 text-left">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {proposals.map((p, i) => (
                    <tr key={p.id ?? i} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-800">{p.proposer_name}</td>
                      <td className="px-6 py-3 text-gray-600">R$ {Number(p.proposed_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="px-6 py-3 text-gray-600">{p.proposal_type}</td>
                      <td className="px-6 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          p.status === 'ACEITA' ? 'bg-green-100 text-green-700' :
                          p.status === 'RECUSADA' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>{p.status}</span>
                      </td>
                      <td className="px-6 py-3 text-gray-400 text-xs">{p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
