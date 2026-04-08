'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function CreateAuctionPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    asset_reference: '', title: '', auction_type: 'JUDICIAL', auction_date: '', base_value_cents: '',
    edital_number: '', auctioneer: '', property_type: '', registration_file: '',
    judicial_appraisal: '', minimum_bid: '', occupation_status: '', iptu_outstanding: '', condo_outstanding: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function set(field: string, value: string) { setForm((p) => ({ ...p, [field]: value })); setError(''); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = {
        ...form,
        base_value_cents: form.base_value_cents ? Math.round(parseFloat(form.base_value_cents) * 100) : undefined,
        judicial_appraisal: form.judicial_appraisal ? Math.round(parseFloat(form.judicial_appraisal) * 100) : undefined,
        minimum_bid: form.minimum_bid ? Math.round(parseFloat(form.minimum_bid) * 100) : undefined,
        iptu_outstanding: form.iptu_outstanding ? Math.round(parseFloat(form.iptu_outstanding) * 100) : undefined,
        condo_outstanding: form.condo_outstanding ? Math.round(parseFloat(form.condo_outstanding) * 100) : undefined,
      };
      const { data } = await api.post('/auctions/assets', payload);
      const id = data?.asset?.id ?? data?.data?.id ?? data?.id;
      router.push(id ? `/auctions/${id}` : '/auctions');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Falha ao criar ativo de leilão.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Criar Ativo de Leilão</h1>
        <Link href="/auctions" className="text-sm text-blue-600 hover:underline">Cancelar</Link>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Referência do Ativo</label>
          <input value={form.asset_reference} onChange={(e) => set('asset_reference', e.target.value)} required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="ex. AUC-2026-001" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} required className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="Título do leilão" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select value={form.auction_type} onChange={(e) => set('auction_type', e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
              <option value="JUDICIAL">Judicial</option>
              <option value="EXTRAJUDICIAL">Extrajudicial</option>
              <option value="BANK">Bancário</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data do Leilão</label>
            <input type="date" value={form.auction_date} onChange={(e) => set('auction_date', e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Valor Base (R$)</label>
          <input type="number" step="0.01" min="0" value={form.base_value_cents} onChange={(e) => set('base_value_cents', e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="0.00" />
        </div>

        <div className="border-t pt-4 mt-2">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Campos Complementares do Lote</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">N. Edital</label>
              <input value={form.edital_number} onChange={(e) => set('edital_number', e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="ex: 001/2026" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Leiloeiro</label>
              <input value={form.auctioneer} onChange={(e) => set('auctioneer', e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="Nome do leiloeiro" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo Imovel</label>
              <select value={form.property_type} onChange={(e) => set('property_type', e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
                <option value="">Selecione...</option>
                <option value="APARTAMENTO">Apartamento</option>
                <option value="CASA">Casa</option>
                <option value="TERRENO">Terreno</option>
                <option value="COMERCIAL">Comercial</option>
                <option value="RURAL">Rural</option>
                <option value="OUTRO">Outro</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Matricula (referencia)</label>
              <input value={form.registration_file} onChange={(e) => set('registration_file', e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="Numero ou referencia da matricula" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Avaliacao Judicial (R$)</label>
              <input type="number" step="0.01" min="0" value={form.judicial_appraisal} onChange={(e) => set('judicial_appraisal', e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lance Minimo (R$)</label>
              <input type="number" step="0.01" min="0" value={form.minimum_bid} onChange={(e) => set('minimum_bid', e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ocupacao</label>
              <select value={form.occupation_status} onChange={(e) => set('occupation_status', e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
                <option value="">Selecione...</option>
                <option value="DESOCUPADO">Desocupado</option>
                <option value="OCUPADO_DEVEDOR">Ocupado pelo Devedor</option>
                <option value="OCUPADO_TERCEIRO">Ocupado por Terceiro</option>
                <option value="OCUPACAO_IRREGULAR">Ocupação Irregular (Esbulho)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">IPTU em Aberto (R$)</label>
              <input type="number" step="0.01" min="0" value={form.iptu_outstanding} onChange={(e) => set('iptu_outstanding', e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="0.00" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Condominio em Aberto (R$)</label>
              <input type="number" step="0.01" min="0" value={form.condo_outstanding} onChange={(e) => set('condo_outstanding', e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="0.00" />
            </div>
          </div>
        </div>

        <button type="submit" disabled={loading} className="w-full rounded bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Criando...' : 'Criar Ativo de Leilao'}
        </button>
      </form>
    </div>
  );
}
