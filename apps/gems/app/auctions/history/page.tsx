'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface BidRecord {
  id: string;
  auction_asset_id?: string;
  asset_reference?: string;
  title?: string;
  amount_cents?: number;
  bid_date?: string;
  result?: string;
}

export default function AuctionHistoryPage() {
  const [bids, setBids] = useState<BidRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get('/auctions/assets', { params: { limit: 200 } });
        const list = data?.assets ?? data?.data ?? [];
        // Map assets to bid-like records
        const mapped = (Array.isArray(list) ? list : []).map((a: any) => ({
          id: a.id,
          auction_asset_id: a.id,
          asset_reference: a.asset_reference,
          title: a.title,
          amount_cents: a.base_value_cents ?? a.final_value_cents,
          bid_date: a.auction_date,
          result: a.current_stage,
        }));
        setBids(mapped);
      } catch {
        setError('Nao foi possivel carregar historico de lances.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Historico de Lances</h1>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Carregando...</p>
      ) : bids.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-500">Nenhum lance registrado.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Leilao</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Valor (R$)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Resultado</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {bids.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{b.title ?? b.asset_reference ?? b.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {b.amount_cents != null ? `R$ ${(b.amount_cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{b.bid_date ? new Date(b.bid_date).toLocaleDateString('pt-BR') : '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{b.result ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
