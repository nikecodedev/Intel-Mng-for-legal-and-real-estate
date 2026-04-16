'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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

type Tab = 'entries' | 'templates' | 'search' | 'import';

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
  const [recommended, setRecommended] = useState<DocumentTemplate[]>([]);
  const [recommendedLoading, setRecommendedLoading] = useState(false);

  useEffect(() => {
    if (tab === 'entries') fetchEntries();
    else if (tab === 'templates') {
      fetchTemplates();
      fetchRecommended();
    }
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

  async function fetchRecommended() {
    setRecommendedLoading(true);
    try {
      const { data } = await api.get('/knowledge/templates/recommended');
      setRecommended(data?.templates ?? data?.data ?? []);
    } catch {
      // silently ignore — recommended is optional
      setRecommended([]);
    } finally {
      setRecommendedLoading(false);
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

  // Import state
  const [importJson, setImportJson] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ imported?: number; errors?: any[] } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setImportLoading(true);
    setImportResult(null);
    setImportError(null);
    try {
      let parsed: unknown;
      try { parsed = JSON.parse(importJson); } catch { throw new Error('JSON inválido. Verifique o formato.'); }
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      const { data } = await api.post('/knowledge/import', { entries });
      setImportResult(data?.result ?? data ?? { imported: entries.length });
      setImportJson('');
    } catch (err: any) {
      setImportError(err?.response?.data?.message || err?.message || 'Falha ao importar.');
    } finally {
      setImportLoading(false);
    }
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImportJson(String(ev.target?.result ?? ''));
    reader.readAsText(file);
    e.target.value = '';
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'entries', label: 'Biblioteca' },
    { key: 'templates', label: 'Modelos' },
    { key: 'search', label: 'Pesquisar' },
    { key: 'import', label: 'Importar' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Base de Conhecimento</h1>
        <div className="flex gap-3">
          <Link href="/knowledge/new" className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Nova Entrada
          </Link>
          <Link href="/knowledge/templates/new" className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
            Novo Template
          </Link>
          <Link href="/knowledge/theses" className="rounded bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700">
            Teses
          </Link>
        </div>
      </div>

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
                      <td className="px-4 py-3 text-sm font-medium">
                        <Link href={`/knowledge/${entry.id}`} className="text-blue-600 hover:underline">
                          {entry.title}
                        </Link>
                      </td>
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
          {/* Recommended Templates */}
          <div className="mb-6">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Recomendados</h2>
            {recommendedLoading ? (
              <p className="text-sm text-gray-500">Carregando recomendados...</p>
            ) : recommended.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum modelo recomendado no momento.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {recommended.map((tpl) => (
                  <Link key={tpl.id} href={`/knowledge/templates/${tpl.id}`} className="block rounded-lg border border-blue-200 bg-blue-50 p-4 hover:border-blue-400 transition-colors">
                    <h3 className="text-sm font-medium text-gray-900">{tpl.template_name}</h3>
                    <p className="text-xs text-gray-600 mt-1">{tpl.description ?? tpl.template_type}</p>
                    <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                      <span>{tpl.usage_count ?? 0} usos</span>
                      {tpl.success_rate != null && (
                        <span>Taxa de sucesso: {Math.round(tpl.success_rate * 100)}%</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

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
                      <td className="px-4 py-3 text-sm font-medium">
                        <Link href={`/knowledge/templates/${tpl.id}`} className="text-blue-600 hover:underline">
                          {tpl.template_name}
                        </Link>
                      </td>
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
                      <td className="px-4 py-3 text-sm font-medium">
                        <Link href={`/knowledge/${r.id}`} className="text-blue-600 hover:underline">
                          {r.title}
                        </Link>
                      </td>
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

      {/* Import Tab */}
      {tab === 'import' && (
        <div className="space-y-6 max-w-2xl">
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">Importar em Massa</h2>
            <p className="text-sm text-gray-500">Cole JSON ou carregue um ficheiro. Cada entrada deve ter: <code className="text-xs bg-gray-100 px-1 rounded">entry_type</code>, <code className="text-xs bg-gray-100 px-1 rounded">title</code>, <code className="text-xs bg-gray-100 px-1 rounded">content</code>.</p>
          </div>

          {importResult && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="text-sm font-medium text-green-800">
                ✓ {importResult.imported ?? '?'} entrada(s) importada(s) com sucesso.
              </p>
              {importResult.errors && importResult.errors.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {importResult.errors.map((e: any, i: number) => (
                    <li key={i} className="text-xs text-red-700">{JSON.stringify(e)}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {importError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{importError}</div>
          )}

          <form onSubmit={handleImport} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-700">JSON (array ou objeto único)</label>
                <label className="cursor-pointer rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50">
                  Carregar ficheiro .json
                  <input type="file" accept=".json,application/json" className="hidden" onChange={handleImportFile} />
                </label>
              </div>
              <textarea
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                rows={12}
                placeholder={`[\n  {\n    "entry_type": "LEGAL_THESIS",\n    "title": "Título da entrada",\n    "content": "Conteúdo jurídico...",\n    "category": "Direito Civil",\n    "tags": ["contrato", "responsabilidade"]\n  }\n]`}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={importLoading || !importJson.trim()}
              className="rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {importLoading ? 'Importando...' : 'Importar'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
