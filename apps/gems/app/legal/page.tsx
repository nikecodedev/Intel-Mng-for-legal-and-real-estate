'use client';

import { useQuery } from 'react-query';
import Link from 'next/link';
import { DataTable } from '@/components/tables/DataTable';
import { fetchDocuments, type DocumentListItem } from '@/lib/legal-api';

function formatDate(iso: string | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'short' });
  } catch {
    return iso;
  }
}

function cpoBadge(status: DocumentListItem['status_cpo']) {
  if (!status) return <span className="text-gray-500">—</span>;
  const colors: Record<string, string> = {
    VERDE: 'bg-green-100 text-green-800',
    AMARELO: 'bg-yellow-100 text-yellow-800',
    VERMELHO: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${colors[status] ?? 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
}

export default function LegalDocumentsPage() {
  const { data, isLoading, error } = useQuery('legal-documents', () => fetchDocuments({ limit: 100 }), {
    staleTime: 60 * 1000,
  });

  const documents = data?.data?.documents ?? [];
  const columns = [
    { key: 'title', header: 'Name', render: (row: DocumentListItem) => <Link href={`/legal/documents/${row.id}`} className="text-blue-600 hover:underline">{row.title || row.file_name || row.document_number}</Link> },
    { key: 'status_cpo', header: 'Status (CPO)', render: (row: DocumentListItem) => cpoBadge(row.status_cpo) },
    { key: 'ocr_confidence', header: 'Confidence', render: (row: DocumentListItem) => row.ocr_confidence != null ? `${Math.round(Number(row.ocr_confidence) * 100)}%` : '—' },
    { key: 'created_at', header: 'Upload date', render: (row: DocumentListItem) => formatDate(row.created_at) },
  ];

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
        Loading documents…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        Failed to load documents. Please try again.
      </div>
    );
  }

  return (
    <DataTable<DocumentListItem>
      columns={columns}
      data={documents}
      keyExtractor={(row) => row.id}
      emptyMessage="No documents yet. Upload a document to get started."
    />
  );
}
