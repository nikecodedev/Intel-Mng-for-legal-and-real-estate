'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { api, getApiErrorMessage } from '@/lib/api';
import { BlockLoader } from '@/components/ui';
import Link from 'next/link';

interface GeneratedDocument {
  id: string;
  content: string;
  review_status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewed_by?: string | null;
  reviewer_name?: string | null;
  rejection_reason?: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
};

export default function LegalReviewPage() {
  const queryClient = useQueryClient();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data: documents = [], isLoading, isError, error } = useQuery(
    'generated-documents',
    async () => {
      const res = await api.get('/generated-documents');
      const body = res.data?.data ?? res.data;
      return (body?.generated_documents ?? body ?? []) as GeneratedDocument[];
    },
    { staleTime: 30 * 1000 }
  );

  const approveMutation = useMutation(
    async (id: string) => {
      const res = await api.post(`/generated-documents/${id}/approve`, {});
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('generated-documents');
      },
    }
  );

  const submitReviewMutation = useMutation(
    async (docId: string) => {
      const res = await api.post(`/generated-documents/${docId}/submit-review`, {});
      return res.data;
    },
    { onSuccess: () => { queryClient.invalidateQueries('generated-documents'); } }
  );

  const rejectMutation = useMutation(
    async ({ id, reason }: { id: string; reason: string }) => {
      const res = await api.post(`/generated-documents/${id}/reject`, { reason });
      return res.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('generated-documents');
        setRejectingId(null);
        setRejectReason('');
      },
    }
  );

  const handleReject = (id: string) => {
    if (!rejectReason.trim()) return;
    rejectMutation.mutate({ id, reason: rejectReason.trim() });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Review Generated Documents</h2>
        <Link
          href="/legal/generate"
          className="text-sm text-blue-600 hover:underline"
        >
          Generate new petition
        </Link>
      </div>

      {isLoading ? (
        <BlockLoader message="Loading generated documents..." />
      ) : isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{getApiErrorMessage(error)}</p>
        </div>
      ) : documents.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-gray-500">No generated documents found.</p>
          <Link href="/legal/generate" className="mt-2 inline-block text-sm text-blue-600 hover:underline">
            Generate a petition
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Content Preview
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Review Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Generated
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reviewed By
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-700 max-w-xs">
                    <span className="line-clamp-2">
                      {doc.content ? doc.content.slice(0, 100) + (doc.content.length > 100 ? '...' : '') : 'No content'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        STATUS_STYLES[doc.review_status] ?? 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {doc.review_status}
                    </span>
                    {doc.rejection_reason ? (
                      <p className="mt-1 text-xs text-red-500 max-w-xs truncate" title={doc.rejection_reason}>
                        Reason: {doc.rejection_reason}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {doc.reviewer_name ? doc.reviewer_name : doc.reviewed_by ? doc.reviewed_by : '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {doc.review_status === 'PENDING' ? (
                      <div className="flex items-center justify-end gap-2">
                        {rejectingId === doc.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              placeholder="Rejection reason..."
                              className="rounded border border-gray-300 px-2 py-1 text-sm w-48"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleReject(doc.id);
                                if (e.key === 'Escape') {
                                  setRejectingId(null);
                                  setRejectReason('');
                                }
                              }}
                            />
                            <button
                              onClick={() => handleReject(doc.id)}
                              disabled={!rejectReason.trim() || rejectMutation.isLoading}
                              className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              {rejectMutation.isLoading ? 'Rejecting...' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => {
                                setRejectingId(null);
                                setRejectReason('');
                              }}
                              className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => approveMutation.mutate(doc.id)}
                              disabled={approveMutation.isLoading}
                              className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => {
                                setRejectingId(doc.id);
                                setRejectReason('');
                              }}
                              className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    ) : (doc.review_status as string) === 'DRAFT' ? (
                      <button
                        onClick={() => submitReviewMutation.mutate(doc.id)}
                        disabled={submitReviewMutation.isLoading}
                        className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {submitReviewMutation.isLoading ? 'Submitting...' : 'Submit for Review'}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
