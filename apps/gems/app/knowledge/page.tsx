'use client';

import { useEffect, useState } from 'react';
import { api, getApiErrorMessage, isApiError } from '@/lib/api';

interface KnowledgeEntry {
  id: string;
  entry_type: string;
  title: string;
  summary: string | null;
  category: string | null;
  tags: string[] | null;
  is_verified: boolean;
  created_at: string;
}

interface DocumentTemplate {
  id: string;
  template_name: string;
  template_type: string;
  description: string | null;
  category: string | null;
  usage_count: number;
  success_rate: number | null;
  created_at: string;
}

type Tab = 'entries' | 'templates' | 'search';

const ENTRY_TYPES = ['LEGAL_THESIS', 'CASE_OUTCOME', 'LEGAL_PRECEDENT', 'LEGAL_OPINION'];

const TYPE_COLORS: Record<string, string> = {
  LEGAL_THESIS: 'bg-purple-100 text-purple-800',
  CASE_OUTCOME: 'bg-blue-100 text-blue-800',
  LEGAL_PRECEDENT: 'bg-amber-100 text-amber-800',
  LEGAL_OPINION: 'bg-green-100 text-green-800',
};

export default function KnowledgePage() {
  const [tab, setTab] = useState<Tab>('entries');
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [entriesTotal, setEntriesTotal] = useState(0);
  const [templatesTotal, setTemplatesTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<KnowledgeEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [filterType, setFilterType] = useState('');

  useEffect(() => {
    if (tab === 'entries') fetchEntries();
    else if (tab === 'templates') fetchTemplates();
  }, [tab, filterType]);

  async function fetchEntries() {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { limit: 50, offset: 0 };
      if (filterType) params.entry_type = filterType;
      const { data } = await api.get('/knowledge/entries', { params });
      setEntries(data?.entries ?? []);
      setEntriesTotal(data?.total ?? 0);
    } catch (err) {
      setError(isApiError(err) ? getApiErrorMessage(err) : 'Falha ao carregar registros');
    } finally {
      setLoading(false);
    }
  }

  async function fetchTemplates() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/knowledge/templates', { params: { limit: 50, offset: 0 } });
      setTemplates(data?.templates ?? []);
      setTemplatesTotal(data?.total ?? 0);
    } catch (err) {
      setError(isApiError(err) ? getApiErrorMessage(err) : 'Falha ao carregar modelos');
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    await performSearch('/knowledge/search');
  }

  async function handleSearchPastCases() {
    if (!searchQuery.trim()) return;
    await performSearch('/knowledge/search/past-cases');
  }

  async function handleSearchOutcomes() {
    if (!searchQuery.trim()) return;
    await performSearch('/knowledge/search/outcomes');
  }

  async function performSearch(endpoint: string) {
    setSearching(true);
    setError(null);
    try {
      const { data } = await api.post(endpoint, { query: searchQuery, limit: 50 });
      setSearchResults(data?.results ?? []);
    } catch (err) {
      setError(isApiError(err) ? getApiErrorMessage(err) : 'Falha na pesquisa');
    } finally {
      setSearching(false);
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'entries', label: 'Registros' },
    { key: 'templates', label: 'Modelos' },
    { key: 'search', label: 'Pesquisar' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Base de Conhecimento</h1>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Entries Tab */}
      {tab === 'entries' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600">{entriesTotal} registros</p>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="">Todos os tipos</option>
              {ENTRY_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <p className="text-sm text-gray-500">Carregando...</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum registro encontrado.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Titulo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Verificado</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Criado em</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{entry.title}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_COLORS[entry.entry_type] ?? 'bg-gray-100 text-gray-700'}`}>
                          {entry.entry_type.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{entry.category ?? '-'}</td>
                      <td className="px-4 py-3 text-sm">{entry.is_verified ? 'Sim' : 'Nao'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{new Date(entry.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Templates Tab */}
      {tab === 'templates' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600">{templatesTotal} modelos</p>
          </div>

          {loading ? (
            <p className="text-sm text-gray-500">Carregando...</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum modelo encontrado.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usos</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Taxa de Sucesso</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Criado em</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {templates.map((tpl) => (
                    <tr key={tpl.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{tpl.template_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{tpl.template_type}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{tpl.category ?? '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{tpl.usage_count ?? 0}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {tpl.success_rate != null ? `${Math.round(tpl.success_rate * 100)}%` : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{new Date(tpl.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Search Tab */}
      {tab === 'search' && (
        <div>
          <form onSubmit={handleSearch} className="mb-6 space-y-3">
            <div className="flex gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar base de conhecimento..."
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
              <button
                type="submit"
                disabled={searching || !searchQuery.trim()}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {searching ? 'Pesquisando...' : 'Pesquisar'}
              </button>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSearchPastCases}
                disabled={searching || !searchQuery.trim()}
                className="rounded-lg bg-purple-600 px-5 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {searching ? 'Pesquisando...' : 'Pesquisar Casos Passados'}
              </button>
              <button
                type="button"
                onClick={handleSearchOutcomes}
                disabled={searching || !searchQuery.trim()}
                className="rounded-lg bg-amber-600 px-5 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {searching ? 'Pesquisando...' : 'Pesquisar Resultados'}
              </button>
            </div>
          </form>

          {searchResults.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Titulo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {searchResults.map((r: any) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.title}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_COLORS[r.entry_type] ?? 'bg-gray-100 text-gray-700'}`}>
                          {r.entry_type?.replace(/_/g, ' ') ?? '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{r.category ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!searching && searchResults.length === 0 && searchQuery && (
            <p className="text-sm text-gray-500">Nenhum resultado encontrado.</p>
          )}
        </div>
      )}
    </div>
  );
}
