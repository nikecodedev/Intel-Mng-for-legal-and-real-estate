'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import Link from 'next/link';
import {
  fetchSanitationQueue,
  resolveFlag,
  escalateFlag,
  getApiErrorMessage,
  type SanitationQueueItem,
} from '@/lib/legal-api';

const RESOLUTION_ACTIONS = ['RESCANNED', 'MANUAL_OVERRIDE', 'DISMISSED', 'REPROCESSED'] as const;

export default function LegalSanitationPage() {
  const [resolveFlagId, setResolveFlagId] = useState<string | null>(null);
  const [resolveAction, setResolveAction] = useState<string>(RESOLUTION_ACTIONS[0]);
  const [resolveNotes, setResolveNotes] = useState('');
  const [escalateFlagId, setEscalateFlagId] = useState<string | null>(null);
  const [escalateNotes, setEscalateNotes] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery('legal-sanitation', () => fetchSanitationQueue({ limit: 100 }), {
    staleTime: 30 * 1000,
  });

  const resolveMutation = useMutation({
    mutationFn: ({ flagId, resolution_action, resolution_notes }: { flagId: string; resolution_action: string; resolution_notes?: string }) =>
      resolveFlag(flagId, { resolution_action, resolution_notes }),
    onSuccess: () => {
      queryClient.invalidateQueries('legal-sanitation');
      setResolveFlagId(null);
      setResolveNotes('');
    },
  });

  const escalateMutation = useMutation({
    mutationFn: ({ flagId, notes }: { flagId: string; notes?: string }) => escalateFlag(flagId, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries('legal-sanitation');
      setEscalateFlagId(null);
      setEscalateNotes('');
    },
  });

  const items = data?.data?.items ?? [];

  const openResolve = (flagId: string) => {
    setResolveFlagId(flagId);
    setResolveAction(RESOLUTION_ACTIONS[0]);
    setResolveNotes('');
  };
  const openEscalate = (flagId: string) => {
    setEscalateFlagId(flagId);
    setEscalateNotes('');
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
        Loading sanitation queue…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        Failed to load queue. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Document</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Flag</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Severity</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {items.map((row: SanitationQueueItem) => (
              <tr key={row.flag_id}>
                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  <Link href={`/legal/documents/${row.document_id}`} className="text-blue-600 hover:underline">
                    {row.document_title || row.document_number}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">{row.flag_type}: {row.flag_message}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm">{row.severity}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm">{row.queue_status}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                  <button
                    type="button"
                    onClick={() => openResolve(row.flag_id)}
                    className="mr-2 text-blue-600 hover:underline"
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    onClick={() => openEscalate(row.flag_id)}
                    className="text-amber-600 hover:underline"
                  >
                    Escalate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
          No flagged documents in the sanitation queue.
        </div>
      )}

      {resolveFlagId && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Resolve flag</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
                <select
                  value={resolveAction}
                  onChange={(e) => setResolveAction(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                >
                  {RESOLUTION_ACTIONS.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  value={resolveNotes}
                  onChange={(e) => setResolveNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResolveFlagId(null)}
                  className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => resolveMutation.mutate({ flagId: resolveFlagId, resolution_action: resolveAction, resolution_notes: resolveNotes || undefined })}
                  disabled={resolveMutation.isLoading}
                  className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {resolveMutation.isLoading ? 'Saving…' : 'Resolve'}
                </button>
              </div>
              {resolveMutation.isError && (
                <p className="text-sm text-red-600">{getApiErrorMessage(resolveMutation.error)}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {escalateFlagId && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Escalate flag</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  value={escalateNotes}
                  onChange={(e) => setEscalateNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEscalateFlagId(null)}
                  className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => escalateMutation.mutate({ flagId: escalateFlagId, notes: escalateNotes || undefined })}
                  disabled={escalateMutation.isLoading}
                  className="rounded bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {escalateMutation.isLoading ? 'Sending…' : 'Escalate'}
                </button>
              </div>
              {escalateMutation.isError && (
                <p className="text-sm text-red-600">{getApiErrorMessage(escalateMutation.error)}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
