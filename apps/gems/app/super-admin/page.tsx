'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import Link from 'next/link';
import { StatusBadge, BlockLoader } from '@/components/ui';
import { formatBytes } from '@/lib/utils';
import {
  fetchSuperAdminDashboard,
  suspendTenant,
  reactivateTenant,
  getApiErrorMessage,
  type TenantListItem,
} from '@/lib/super-admin-api';

export default function SuperAdminTenantsPage() {
  const queryClient = useQueryClient();
  const [suspendId, setSuspendId] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState('');

  const { data: dashboard, isLoading, error } = useQuery(
    'super-admin-dashboard',
    fetchSuperAdminDashboard,
    { staleTime: 30 * 1000 }
  );

  const suspendMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => suspendTenant(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries('super-admin-dashboard');
      setSuspendId(null);
      setSuspendReason('');
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => reactivateTenant(id),
    onSuccess: () => {
      queryClient.invalidateQueries('super-admin-dashboard');
    },
  });

  const tenants = dashboard?.tenants ?? [];

  if (isLoading) return <BlockLoader message="Loading…" />;

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        {getApiErrorMessage(error)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-4 text-sm">
          <span className="text-gray-600">Total tenants: <strong>{dashboard?.total_tenants ?? 0}</strong></span>
          <span className="text-green-600">Active: <strong>{dashboard?.active_tenants ?? 0}</strong></span>
          <span className="text-red-600">Suspended: <strong>{dashboard?.suspended_tenants ?? 0}</strong></span>
          <span className="text-gray-600">Storage: <strong>{formatBytes(dashboard?.total_storage_bytes ?? 0)}</strong></span>
        </div>
        <Link
          href="/super-admin/tenants/new"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Create tenant
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Storage</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Users</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {tenants.map((row: TenantListItem) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                  <Link href={`/super-admin/tenants/${row.id}`} className="text-blue-600 hover:underline">
                    {row.name}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm"><StatusBadge variant="tenant" value={row.status} /></td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                  {formatBytes(row.storage_bytes ?? 0)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{row.user_count ?? 0}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                  {row.status === 'SUSPENDED' ? (
                    <button
                      type="button"
                      onClick={() => reactivateMutation.mutate(row.id)}
                      disabled={reactivateMutation.isLoading}
                      className="text-green-600 hover:underline disabled:opacity-50"
                    >
                      Reactivate
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSuspendId(row.id)}
                      className="text-amber-600 hover:underline"
                    >
                      Suspend
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {tenants.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
          No tenants.
        </div>
      )}

      {suspendId && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Suspend tenant</h3>
            <p className="text-sm text-gray-600 mb-2">Reason (required):</p>
            <textarea
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              rows={3}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm mb-4"
              placeholder="e.g. Payment overdue"
            />
            {suspendMutation.isError && (
              <p className="mb-2 text-sm text-red-600">{getApiErrorMessage(suspendMutation.error)}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setSuspendId(null); setSuspendReason(''); suspendMutation.reset(); }}
                className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => suspendMutation.mutate({ id: suspendId, reason: suspendReason })}
                disabled={!suspendReason.trim() || suspendMutation.isLoading}
                className="rounded bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {suspendMutation.isLoading ? 'Suspending…' : 'Suspend'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
