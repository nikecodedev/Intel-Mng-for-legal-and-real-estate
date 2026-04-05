'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

const RESOURCE_TYPES = ['PROCESS', 'AUCTION_ASSET', 'REAL_ESTATE_ASSET', 'DOCUMENT'] as const;

export default function IntelligencePage() {
  // Validação state
  const [valResourceType, setValResourceType] = useState<string>('PROCESS');
  const [valResourceId, setValResourceId] = useState('');
  const [valLoading, setValLoading] = useState(false);
  const [valResult, setValResult] = useState<any>(null);
  const [valError, setValError] = useState('');

  // Enforce state
  const [enforceLoading, setEnforceLoading] = useState(false);
  const [enforceResult, setEnforceResult] = useState<any>(null);
  const [enforceError, setEnforceError] = useState('');

  // Sugestões state
  const [sugResourceType, setSugResourceType] = useState('');
  const [sugResourceId, setSugResourceId] = useState('');
  const [sugLoading, setSugLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [sugError, setSugError] = useState('');

  const handleValidate = async () => {
    if (!valResourceId.trim()) {
      setValError('Informe o ID do recurso.');
      return;
    }
    setValLoading(true);
    setValError('');
    setValResult(null);
    try {
      const res = await api.post('/intelligence/validate', {
        resource_type: valResourceType,
        resource_id: valResourceId.trim(),
      });
      setValResult(res.data?.data ?? res.data);
    } catch (err: any) {
      setValError(err?.response?.data?.message || 'Falha ao validar recurso.');
    } finally {
      setValLoading(false);
    }
  };

  const handleEnforce = async () => {
    if (!valResourceId.trim()) {
      setEnforceError('Informe o ID do recurso.');
      return;
    }
    setEnforceLoading(true);
    setEnforceError('');
    setEnforceResult(null);
    try {
      const res = await api.post('/intelligence/validate-and-enforce', {
        resource_type: valResourceType,
        resource_id: valResourceId.trim(),
      });
      setEnforceResult(res.data?.data ?? res.data);
    } catch (err: any) {
      setEnforceError(err?.response?.data?.message || 'Falha ao aplicar regras.');
    } finally {
      setEnforceLoading(false);
    }
  };

  const handleFetchSuggestions = async () => {
    if (!sugResourceType.trim() || !sugResourceId.trim()) {
      setSugError('Informe o tipo e o ID do recurso.');
      return;
    }
    setSugLoading(true);
    setSugError('');
    setSuggestions([]);
    try {
      const res = await api.get(`/intelligence/suggestions/${encodeURIComponent(sugResourceType.trim())}/${encodeURIComponent(sugResourceId.trim())}`);
      const data = res.data?.data ?? res.data;
      setSuggestions(Array.isArray(data) ? data : data?.suggestions ? data.suggestions : [data]);
    } catch (err: any) {
      setSugError(err?.response?.data?.message || 'Falha ao buscar sugestoes.');
    } finally {
      setSugLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Validação Inteligente */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Validação Inteligente</h2>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Tipo de Recurso</label>
            <select
              value={valResourceType}
              onChange={(e) => { setValResourceType(e.target.value); setValError(''); setValResult(null); setEnforceResult(null); setEnforceError(''); }}
              className="rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {RESOURCE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-600 mb-1">ID do Recurso</label>
            <input
              type="text"
              value={valResourceId}
              onChange={(e) => { setValResourceId(e.target.value); setValError(''); }}
              placeholder="UUID do recurso"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleValidate}
            disabled={valLoading || !valResourceId.trim()}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {valLoading ? 'Validando...' : 'Validar com IA'}
          </button>
          <button
            onClick={handleEnforce}
            disabled={enforceLoading || !valResourceId.trim()}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {enforceLoading ? 'Aplicando...' : 'Aplicar Regras'}
          </button>
        </div>
        {valError && <p className="mt-3 text-sm text-red-600">{valError}</p>}
        {enforceError && <p className="mt-3 text-sm text-red-600">{enforceError}</p>}

        {/* Validation results */}
        {valResult && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <h3 className="text-sm font-medium text-green-800 mb-2">Resultado da Validação</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-gray-600">Permitido</dt>
              <dd className="font-medium">{valResult.allowed === true ? 'Sim' : valResult.allowed === false ? 'Não' : '—'}</dd>
            </dl>
            {Array.isArray(valResult.violations) && valResult.violations.length > 0 && (
              <div className="mt-3">
                <h4 className="text-xs font-bold text-red-700 uppercase tracking-wide mb-1">Violações</h4>
                <ul className="space-y-1">
                  {valResult.violations.map((v: any, i: number) => (
                    <li key={i} className="text-sm text-red-800 pl-3 border-l-2 border-red-300">
                      {typeof v === 'string' ? v : v.message ?? JSON.stringify(v)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {Array.isArray(valResult.suggestions) && valResult.suggestions.length > 0 && (
              <div className="mt-3">
                <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-1">Sugestões</h4>
                <ul className="space-y-1">
                  {valResult.suggestions.map((s: any, i: number) => (
                    <li key={i} className="text-sm text-blue-800 pl-3 border-l-2 border-blue-300">
                      {typeof s === 'string' ? s : s.message ?? JSON.stringify(s)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Enforce results */}
        {enforceResult && (
          <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
            <h3 className="text-sm font-medium text-indigo-800 mb-2">Resultado da Aplicação de Regras</h3>
            <pre className="text-xs bg-white rounded p-3 overflow-x-auto border border-indigo-100">
              {JSON.stringify(enforceResult, null, 2)}
            </pre>
          </div>
        )}
      </section>

      {/* Sugestões */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Sugestões</h2>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Tipo de Recurso</label>
            <input
              type="text"
              value={sugResourceType}
              onChange={(e) => { setSugResourceType(e.target.value); setSugError(''); }}
              placeholder="ex. REAL_ESTATE_ASSET"
              className="rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-600 mb-1">ID do Recurso</label>
            <input
              type="text"
              value={sugResourceId}
              onChange={(e) => { setSugResourceId(e.target.value); setSugError(''); }}
              placeholder="UUID do recurso"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <button
          onClick={handleFetchSuggestions}
          disabled={sugLoading || !sugResourceType.trim() || !sugResourceId.trim()}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sugLoading ? 'Buscando...' : 'Buscar Sugestões'}
        </button>
        {sugError && <p className="mt-3 text-sm text-red-600">{sugError}</p>}

        {suggestions.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Sugestões Encontradas</h3>
            <ul className="space-y-2">
              {suggestions.map((s: any, i: number) => (
                <li key={i} className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
                  {typeof s === 'string' ? s : (
                    <div>
                      {s.title && <p className="font-medium text-gray-900">{s.title}</p>}
                      {s.message && <p className="text-gray-700">{s.message}</p>}
                      {s.description && <p className="text-gray-600">{s.description}</p>}
                      {!s.title && !s.message && !s.description && (
                        <pre className="text-xs overflow-x-auto">{JSON.stringify(s, null, 2)}</pre>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
