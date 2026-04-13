'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface RadarItem {
  id: string;
  asset_reference: string;
  title: string;
  source?: string;
  auction_date?: string;
  current_stage?: string;
}

export default function AuctionRadarPage() {
  const [items, setItems] = useState<RadarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    async function load() {
      try {
        // Fetch assets in F0 (intake) stage
        const { data } = await api.get('/auctions/assets', { params: { stage: 'F0', limit: 100 } });
        const list = data?.assets ?? data?.data ?? [];
        setItems(Array.isArray(list) ? list : []);
      } catch {
        // Fallback: fetch all and filter
        try {
          const { data } = await api.get('/auctions/assets', { params: { limit: 100 } });
          const list = data?.assets ?? data?.data ?? [];
          setItems(Array.isArray(list) ? list : []);
        } catch {
          setError('Nao foi possivel carregar oportunidades.');
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleAddToPipeline(itemId: string) {
    setAddingId(itemId);
    setMsg('');
    try {
      await api.post(`/auctions/assets/${itemId}/transition`, { to_stage: 'F1' });
      setMsg(`Ativo ${itemId.slice(0, 8)} adicionado ao pipeline.`);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch {
      setMsg('Falha ao adicionar ao pipeline.');
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Radar de Oportunidades</h1>
      <p className="text-sm text-gray-600">Oportunidades em fase de intake (F0) para analise e inclusao no pipeline.</p>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>}
      {msg && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded p-3">{msg}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Carregando...</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-500">Nenhuma oportunidade no radar.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Referencia</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Titulo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fonte</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Etapa</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acao</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.asset_reference}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{item.title}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{item.source ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{item.auction_date ? new Date(item.auction_date).toLocaleDateString('pt-BR') : '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{item.current_stage ?? 'F0'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleAddToPipeline(item.id)}
                      disabled={addingId === item.id}
                      className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {addingId === item.id ? 'Adicionando...' : 'Adicionar ao Pipeline'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
