'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { BlockLoader } from '@/components/ui';

interface DocumentListItem {
  id: string;
  document_number: string;
  title: string;
  status_cpo: string;
}

interface DocumentFact {
  id: string;
  document_id: string;
  fact_type: string;
  fact_key: string;
  fact_value: string;
  confidence: number;
}

const PETITION_TYPES = [
  { value: 'initial_petition', label: 'Petição Inicial' },
  { value: 'defense', label: 'Defesa' },
  { value: 'appeal', label: 'Recurso' },
] as const;

export default function LegalGeneratePage() {
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [selectedFactIds, setSelectedFactIds] = useState<Set<string>>(new Set());
  const [petitionType, setPetitionType] = useState<string>('initial_petition');
  const [generatedContent, setGeneratedContent] = useState<string>('');

  const { data: docsData, isLoading: docsLoading } = useQuery(
    'legal-documents-verde',
    async () => {
      const res = await api.get('/documents', { params: { limit: 100, status_cpo: 'VERDE' } });
      return (res.data.data?.documents ?? res.data?.documents ?? []) as DocumentListItem[];
    },
    { staleTime: 60 * 1000, retry: 1 }
  );

  const { data: facts = [], isLoading: factsLoading } = useQuery(
    ['legal-document-facts', selectedDocId],
    async () => {
      const res = await api.get(`/documents/${selectedDocId}/facts`);
      return (res.data.data ?? []) as DocumentFact[];
    },
    { enabled: !!selectedDocId, staleTime: 60 * 1000, retry: 1 }
  );

  const generateMutation = useMutation(
    async () => {
      if (selectedFactIds.size === 0) throw new Error('Selecione pelo menos um fato');
      const res = await api.post('/generated-documents/petition', {
        petition_type: petitionType,
        source_fact_ids: Array.from(selectedFactIds),
      }, { timeout: 120000 });
      return res.data;
    },
    {
      onSuccess: (data) => {
        const doc = data.data ?? data;
        setGeneratedContent(doc.content || `Petição gerada com sucesso.\n\nID: ${doc.id ?? 'N/A'}\nTipo: ${petitionType}`);
      },
    }
  );

  const toggleFact = (factId: string) => {
    setSelectedFactIds((prev) => {
      const next = new Set(prev);
      if (next.has(factId)) next.delete(factId);
      else next.add(factId);
      return next;
    });
  };

  const selectAllFacts = () => {
    if (selectedFactIds.size === facts.length) setSelectedFactIds(new Set());
    else setSelectedFactIds(new Set(facts.map((f) => f.id)));
  };

  const documents = docsData ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Gerar Petição</h2>
        <Link href="/legal/review" className="text-sm text-blue-600 hover:underline">
          Ver documentos gerados para revisão &rarr;
        </Link>
      </div>

      {/* Passo 1 */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-700 mb-3">1. Selecionar documento fonte (apenas CPO Verde)</h3>
        {docsLoading ? (
          <BlockLoader message="Carregando documentos..." />
        ) : documents.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum documento com status CPO Verde encontrado.</p>
        ) : (
          <select
            value={selectedDocId}
            onChange={(e) => { setSelectedDocId(e.target.value); setSelectedFactIds(new Set()); setGeneratedContent(''); }}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">-- Selecione um documento --</option>
            {documents.map((doc) => (
              <option key={doc.id} value={doc.id}>{doc.title || doc.document_number} (CPO Verde)</option>
            ))}
          </select>
        )}
      </div>

      {/* Passo 2 */}
      {selectedDocId && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-700">2. Selecionar fatos fonte</h3>
            {facts.length > 0 && (
              <button onClick={selectAllFacts} className="text-xs text-blue-600 hover:underline">
                {selectedFactIds.size === facts.length ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
            )}
          </div>
          {factsLoading ? (
            <BlockLoader message="Carregando fatos..." />
          ) : facts.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum fato extraído para este documento.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {facts.map((fact) => (
                <label key={fact.id} className="flex items-start gap-3 rounded border border-gray-100 p-3 hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={selectedFactIds.has(fact.id)} onChange={() => toggleFact(fact.id)} className="mt-0.5 rounded border-gray-300" />
                  <div className="text-sm">
                    <span className="font-medium text-gray-800">{fact.fact_key}</span>
                    <span className="text-gray-400 mx-1">:</span>
                    <span className="text-gray-600">{fact.fact_value}</span>
                    {fact.confidence != null && <span className="ml-2 text-xs text-gray-400">({Math.round(fact.confidence * 100)}%)</span>}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Passo 3 */}
      {selectedDocId && selectedFactIds.size > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">3. Selecionar tipo de petição e gerar</h3>
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm text-gray-600 mb-1">Tipo de petição</label>
              <select value={petitionType} onChange={(e) => setPetitionType(e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
                {PETITION_TYPES.map((pt) => (<option key={pt.value} value={pt.value}>{pt.label}</option>))}
              </select>
            </div>
            <button onClick={() => generateMutation.mutate()} disabled={generateMutation.isLoading} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {generateMutation.isLoading ? 'Gerando...' : 'Gerar Petição'}
            </button>
          </div>
          {generateMutation.isError && (
            <p className="mt-3 text-sm text-red-600">
              {(generateMutation.error as Error)?.message || 'Falha ao gerar petição. Verifique se os documentos fonte têm CPO aprovado.'}
            </p>
          )}
        </div>
      )}

      {/* Pré-visualização */}
      {generatedContent && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Pré-visualização da Petição Gerada</h3>
          <pre className="whitespace-pre-wrap text-sm text-gray-800 bg-gray-50 rounded p-4 border border-gray-100">{generatedContent}</pre>
        </div>
      )}
    </div>
  );
}
