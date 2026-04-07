'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface Investor {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
}

interface MatchResult {
  id: string;
  auction_asset_id?: string;
  asset_reference?: string;
  match_score?: number;
  title?: string;
}

export default function CrmMatchingPage() {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [selectedInvestor, setSelectedInvestor] = useState('');
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingInvestors, setLoadingInvestors] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadInvestors() {
      try {
        const { data } = await api.get('/crm/investors', { params: { limit: 200 } });
        const list = data?.investors ?? data?.data ?? [];
        setInvestors(Array.isArray(list) ? list : []);
      } catch {
        setError('Nao foi possivel carregar investidores.');
      } finally {
        setLoadingInvestors(false);
      }
    }
    loadInvestors();
  }, []);

  async function handleSearch() {
    if (!selectedInvestor) return;
    setLoading(true);
    setError('');
    setMatches([]);
    try {
      const { data } = await api.post(`/matching/find-matches/${selectedInvestor}`, {});
      const list = data?.matches ?? data?.data ?? [];
      setMatches(Array.isArray(list) ? list : []);
    } catch {
      setError('Falha ao buscar compativeis.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Matching de Investidores</h1>
      <p className="text-sm text-gray-600">Selecione um investidor e busque ativos compativeis.</p>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>}

      <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Investidor</label>
          {loadingInvestors ? (
            <p className="text-sm text-gray-500">Carregando investidores...</p>
          ) : (
            <select
              value={selectedInvestor}
              onChange={(e) => setSelectedInvestor(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">-- Selecione --</option>
              {investors.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {[inv.first_name, inv.last_name].filter(Boolean).join(' ') || inv.company_name || inv.email}
                </option>
              ))}
            </select>
          )}
        </div>

        <button
          onClick={handleSearch}
          disabled={loading || !selectedInvestor}
          className="rounded bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? 'Buscando...' : 'Buscar Compativeis'}
        </button>
      </div>

      {matches.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ativo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pontuacao</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {matches.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {m.title ?? m.asset_reference ?? m.auction_asset_id?.slice(0, 8) ?? m.id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      Number(m.match_score) >= 80 ? 'bg-green-100 text-green-700' :
                      Number(m.match_score) >= 50 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {m.match_score ?? 0}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && matches.length === 0 && selectedInvestor && (
        <p className="text-sm text-gray-500">Nenhum resultado de matching. Execute a busca.</p>
      )}
    </div>
  );
}
