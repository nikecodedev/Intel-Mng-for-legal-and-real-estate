'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function CaseDraftingPage({ params }: { params: { id: string } }) {
  const { id } = params;

  const [form, setForm] = useState({
    main_thesis: '',
    legal_text: '',
    doctrine: '',
    stj_precedents: '',
    tjsp_precedents: '',
    case_application: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [generatedText, setGeneratedText] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [sugLoading, setSugLoading] = useState(false);

  async function fetchSuggestions() {
    if (!form.main_thesis.trim()) return;
    setSugLoading(true);
    try {
      const { data } = await api.post('/knowledge/search', { query: form.main_thesis, limit: 5 });
      setSuggestions(data?.results ?? []);
    } catch { setSuggestions([]); }
    finally { setSugLoading(false); }
  }

  function set(field: string, value: string) {
    setForm((p) => ({ ...p, [field]: value }));
    setError('');
  }

  function validateTriplo(): boolean {
    // Spec 14: Triplo Fechamento — mínimo 2 precedentes de jurisdição STJ/TJSP
    const stjFilled = form.stj_precedents.trim().length > 0;
    const tjspFilled = form.tjsp_precedents.trim().length > 0;
    const count = (stjFilled ? 1 : 0) + (tjspFilled ? 1 : 0);
    if (count < 2) {
      setError('Mínimo 2 precedentes de jurisprudência (STJ/TJSP) obrigatórios para Triplo Fechamento.');
      return false;
    }
    return true;
  }

  async function handleGenerateAI() {
    if (!validateTriplo()) return;
    setLoading(true);
    setError('');
    setSuccess('');
    setGeneratedText('');
    try {
      const { data } = await api.post('/generated-documents', {
        document_type: 'PETITION',
        context: {
          case_id: id,
          ...form,
        },
      });
      setGeneratedText(data?.document?.content ?? data?.content ?? 'Documento gerado com sucesso.');
      setSuccess('Peca gerada com IA com sucesso.');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Falha ao gerar peca com IA.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Editor de Pecas</h1>
        <Link href={`/legal/cases/${id}`} className="text-sm text-blue-600 hover:underline">Voltar ao Processo</Link>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>}
      {success && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded p-3">{success}</p>}

      <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tese Principal</label>
          <textarea value={form.main_thesis} onChange={(e) => set('main_thesis', e.target.value)} rows={3} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="Descreva a tese principal..." />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Texto Legal</label>
          <textarea value={form.legal_text} onChange={(e) => set('legal_text', e.target.value)} rows={3} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="Fundamentacao legal..." />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Doutrina</label>
          <textarea value={form.doctrine} onChange={(e) => set('doctrine', e.target.value)} rows={3} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="Citacoes doutrinarias..." />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Jurisprudencia STJ</label>
          <textarea value={form.stj_precedents} onChange={(e) => set('stj_precedents', e.target.value)} rows={3} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="Precedentes do STJ..." />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Jurisprudencia TJSP</label>
          <textarea value={form.tjsp_precedents} onChange={(e) => set('tjsp_precedents', e.target.value)} rows={3} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="Precedentes do TJSP..." />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Aplicacao ao Caso</label>
          <textarea value={form.case_application} onChange={(e) => set('case_application', e.target.value)} rows={3} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="Como se aplica ao caso concreto..." />
        </div>

        <button
          onClick={handleGenerateAI}
          disabled={loading}
          className="rounded bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {loading ? 'Gerando com IA...' : 'Gerar com IA'}
        </button>
      </div>

      {/* Sugestões da Base de Conhecimento */}
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-indigo-800">Sugestões da Base de Conhecimento</h3>
          <button onClick={fetchSuggestions} disabled={sugLoading || !form.main_thesis.trim()} className="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-700 disabled:opacity-50">
            {sugLoading ? 'Buscando...' : 'Buscar Sugestões'}
          </button>
        </div>
        {suggestions.length > 0 ? (
          <ul className="space-y-2">
            {suggestions.map((s: any, i: number) => (
              <li key={s.id ?? i} className="rounded border border-indigo-100 bg-white p-3 text-sm">
                <p className="font-medium text-gray-900">{s.title}</p>
                {s.summary && <p className="text-xs text-gray-500 mt-1">{s.summary}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-indigo-600">Preencha a Tese Principal e clique em Buscar Sugestões.</p>
        )}
      </div>

      {generatedText && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-6">
          <h3 className="text-sm font-medium text-purple-800 mb-2">Peca Gerada</h3>
          <pre className="whitespace-pre-wrap text-sm text-gray-800">{generatedText}</pre>
        </div>
      )}
    </div>
  );
}
