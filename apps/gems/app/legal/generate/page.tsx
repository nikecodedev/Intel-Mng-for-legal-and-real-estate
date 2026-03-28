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
  { value: 'initial_petition', label: 'Initial Petition' },
  { value: 'defense', label: 'Defense' },
  { value: 'appeal', label: 'Appeal' },
] as const;

export default function LegalGeneratePage() {
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [selectedFactIds, setSelectedFactIds] = useState<Set<string>>(new Set());
  const [petitionType, setPetitionType] = useState<string>('initial_petition');
  const [generatedContent, setGeneratedContent] = useState<string>('');

  // Fetch documents with CPO VERDE status
  const { data: docsData, isLoading: docsLoading } = useQuery(
    'legal-documents-verde',
    async () => {
      const res = await api.get('/documents', { params: { limit: 100, status_cpo: 'VERDE' } });
      return (res.data.data?.documents ?? res.data?.documents ?? []) as DocumentListItem[];
    },
    { staleTime: 60 * 1000, retry: 1 }
  );

  // Fetch facts for selected document
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
      if (selectedFactIds.size === 0) throw new Error('Select at least one fact');
      const content = `[${petitionType}] Generated petition based on ${selectedFactIds.size} selected facts.`;
      const res = await api.post('/generated-documents', {
        content,
        source_fact_ids: Array.from(selectedFactIds),
      });
      return res.data;
    },
    {
      onSuccess: (data) => {
        setGeneratedContent(
          `Petition generated successfully.\n\nID: ${data.data?.id ?? 'N/A'}\nType: ${petitionType}\nSource facts: ${selectedFactIds.size}\n\nThe document has been saved and is available in the generated documents list.`
        );
      },
    }
  );

  const toggleFact = (factId: string) => {
    setSelectedFactIds((prev) => {
      const next = new Set(prev);
      if (next.has(factId)) {
        next.delete(factId);
      } else {
        next.add(factId);
      }
      return next;
    });
  };

  const selectAllFacts = () => {
    if (selectedFactIds.size === facts.length) {
      setSelectedFactIds(new Set());
    } else {
      setSelectedFactIds(new Set(facts.map((f) => f.id)));
    }
  };

  const documents = docsData ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Generate Petition</h2>
        <Link href="/legal/review" className="text-sm text-blue-600 hover:underline">
          View generated documents for review &rarr;
        </Link>
      </div>

      {/* Step 1: Select Document */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-700 mb-3">1. Select source document (CPO Verde only)</h3>
        {docsLoading ? (
          <BlockLoader message="Loading documents..." />
        ) : documents.length === 0 ? (
          <p className="text-sm text-gray-500">No documents with CPO Verde status found.</p>
        ) : (
          <select
            value={selectedDocId}
            onChange={(e) => {
              setSelectedDocId(e.target.value);
              setSelectedFactIds(new Set());
              setGeneratedContent('');
            }}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">-- Select a document --</option>
            {documents.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.title || doc.document_number} (CPO Verde)
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Step 2: Select Facts */}
      {selectedDocId && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-700">2. Select source facts</h3>
            {facts.length > 0 && (
              <button
                onClick={selectAllFacts}
                className="text-xs text-blue-600 hover:underline"
              >
                {selectedFactIds.size === facts.length ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>
          {factsLoading ? (
            <BlockLoader message="Loading facts..." />
          ) : facts.length === 0 ? (
            <p className="text-sm text-gray-500">No facts extracted for this document.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {facts.map((fact) => (
                <label
                  key={fact.id}
                  className="flex items-start gap-3 rounded border border-gray-100 p-3 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedFactIds.has(fact.id)}
                    onChange={() => toggleFact(fact.id)}
                    className="mt-0.5 rounded border-gray-300"
                  />
                  <div className="text-sm">
                    <span className="font-medium text-gray-800">{fact.fact_key}</span>
                    <span className="text-gray-400 mx-1">:</span>
                    <span className="text-gray-600">{fact.fact_value}</span>
                    {fact.confidence != null && (
                      <span className="ml-2 text-xs text-gray-400">({Math.round(fact.confidence * 100)}%)</span>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Select Petition Type & Generate */}
      {selectedDocId && selectedFactIds.size > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">3. Select petition type and generate</h3>
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm text-gray-600 mb-1">Petition type</label>
              <select
                value={petitionType}
                onChange={(e) => setPetitionType(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                {PETITION_TYPES.map((pt) => (
                  <option key={pt.value} value={pt.value}>
                    {pt.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isLoading}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {generateMutation.isLoading ? 'Generating...' : 'Generate Petition'}
            </button>
          </div>
          {generateMutation.isError && (
            <p className="mt-3 text-sm text-red-600">
              {(generateMutation.error as Error)?.message || 'Failed to generate petition. Ensure all source documents are CPO-approved.'}
            </p>
          )}
        </div>
      )}

      {/* Preview */}
      {generatedContent && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Generated Petition Preview</h3>
          <pre className="whitespace-pre-wrap text-sm text-gray-800 bg-gray-50 rounded p-4 border border-gray-100">
            {generatedContent}
          </pre>
        </div>
      )}
    </div>
  );
}
