'use client';

import { useQuery } from 'react-query';
import Link from 'next/link';
import { DataTable } from '@/components/tables/DataTable';
import { StatusBadge, DateDisplay, BlockLoader } from '@/components/ui';
import { formatPercent } from '@/lib/utils';
import { fetchDocuments, type DocumentListItem } from '@/lib/legal-api';

export default function LegalDocumentsPage() {
  const { data, isLoading, error } = useQuery('legal-documents', () => fetchDocuments({ limit: 100 }), {
    staleTime: 60 * 1000,
  });

  const documents = data?.data?.documents ?? [];
  const columns = [
    { key: 'title', header: 'Name', render: (row: DocumentListItem) => <Link href={`/legal/documents/${row.id}`} className="text-blue-600 hover:underline">{row.title || row.file_name || row.document_number}</Link> },
    { key: 'status_cpo', header: 'Status (CPO)', render: (row: DocumentListItem) => <StatusBadge variant="cpo" value={row.status_cpo} /> },
    { key: 'ocr_confidence', header: 'Confidence', render: (row: DocumentListItem) => row.ocr_confidence != null ? formatPercent(Number(row.ocr_confidence), true) : '—' },
    { key: 'created_at', header: 'Upload date', render: (row: DocumentListItem) => <DateDisplay value={row.created_at} style="short" /> },
  ];

  if (isLoading) return <BlockLoader message="Loading documents…" />;

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
