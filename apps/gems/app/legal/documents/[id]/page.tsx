'use client';

import { use } from 'react';
import { useQuery } from 'react-query';
import Link from 'next/link';
import { DateDisplay, StatusBadge, BlockLoader } from '@/components/ui';
import { formatPercent } from '@/lib/utils';
import { fetchDocumentById, fetchDocumentFacts, type DocumentFact, type QualityFlag } from '@/lib/legal-api';

export default function LegalDocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, error } = useQuery(['legal-document', id], () => fetchDocumentById(id), {
    staleTime: 60 * 1000,
  });
  const { data: facts = [], isLoading: factsLoading } = useQuery(
    ['legal-document-facts', id],
    () => fetchDocumentFacts(id),
    { staleTime: 60 * 1000, enabled: !!id }
  );

  if (isLoading) return <BlockLoader message="Loading document…" />;

  if (error || !data?.data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        Document not found or you don’t have access.
      </div>
    );
  }

  const { document, extraction, quality_flags } = data.data;
  const ext = extraction;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{document.title || document.document_number}</h2>
        <Link
          href={`/legal/documents/${id}/view`}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          View source
        </Link>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Document</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-600">Number</dt><dd className="font-medium">{document.document_number}</dd>
          <dt className="text-gray-600">Type</dt><dd className="font-medium">{document.document_type}</dd>
          <dt className="text-gray-600">Status (CPO)</dt><dd className="font-medium"><StatusBadge variant="cpo" value={document.status_cpo} /></dd>
          <dt className="text-gray-600">OCR confidence</dt><dd className="font-medium">{document.ocr_confidence != null ? formatPercent(Number(document.ocr_confidence), true) : '—'}</dd>
          <dt className="text-gray-600">Created</dt><dd className="font-medium"><DateDisplay value={document.created_at} style="long" /></dd>
        </dl>
      </section>

      {ext && (
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-3">Extracted fields</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {ext.process_number != null && <><dt className="text-gray-600">Process number</dt><dd className="font-medium">{String(ext.process_number)}</dd></>}
            {ext.court != null && <><dt className="text-gray-600">Court</dt><dd className="font-medium">{String(ext.court)}</dd></>}
            {ext.overall_confidence != null && <><dt className="text-gray-600">Confidence</dt><dd className="font-medium">{formatPercent(Number(ext.overall_confidence), true)}</dd></>}
            {ext.processed_at != null && <><dt className="text-gray-600">Processed at</dt><dd className="font-medium"><DateDisplay value={ext.processed_at} style="long" /></dd></>}
          </dl>
          {(ext.parties != null && (Array.isArray(ext.parties) ? ext.parties.length > 0 : Object.keys(ext.parties as object).length > 0)) && (
            <div className="mt-3">
              <dt className="text-gray-600 text-sm">Parties</dt>
              <dd className="mt-1 text-sm font-medium">{JSON.stringify(ext.parties)}</dd>
            </div>
          )}
          {(ext.monetary_values != null && (Array.isArray(ext.monetary_values) ? (ext.monetary_values as unknown[]).length > 0 : Object.keys(ext.monetary_values as object).length > 0)) && (
            <div className="mt-3">
              <dt className="text-gray-600 text-sm">Monetary values</dt>
              <dd className="mt-1 text-sm font-medium">{JSON.stringify(ext.monetary_values)}</dd>
            </div>
          )}
        </section>
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Facts</h3>
        {factsLoading ? (
          <p className="text-sm text-gray-500">Loading facts…</p>
        ) : facts.length === 0 ? (
          <p className="text-sm text-gray-500">No facts extracted yet.</p>
        ) : (
          <ul className="space-y-2">
            {facts.map((f: DocumentFact) => (
              <li key={f.id} className="flex flex-wrap gap-2 text-sm">
                <span className="font-medium text-gray-700">{f.fact_type}:</span>
                <span className="text-gray-900">{typeof f.fact_value === 'object' ? JSON.stringify(f.fact_value) : String(f.fact_value)}</span>
                {f.page_number != null && <span className="text-gray-500">(p.{f.page_number})</span>}
                {f.confidence_score != null && <span className="text-gray-500">{Math.round(Number(f.confidence_score) * 100)}%</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {quality_flags && quality_flags.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-6">
          <h3 className="text-sm font-medium text-amber-800 mb-3">Quality flags</h3>
          <ul className="space-y-2">
            {(quality_flags as QualityFlag[]).map((f) => (
              <li key={f.id} className="text-sm">
                <span className="font-medium">{f.flag_type}</span> ({f.severity}): {f.flag_message}
                <span className="text-amber-700 ml-2">— {f.queue_status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
