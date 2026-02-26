'use client';

import { use, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import Link from 'next/link';
import {
  fetchTenantDashboard,
  suspendTenant,
  reactivateTenant,
  formatBytes,
  getApiErrorMessage,
  type Tenant,
} from '@/lib/super-admin-api';

function formatDate(iso: string | undefined | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium' });
  } catch {
    return String(iso);
  }
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    SUSPENDED: 'bg-red-100 text-red-800',
    INACTIVE: 'bg-gray-100 text-gray-700',
    TRIAL: 'bg-blue-100 text-blue-800',
  };
  return (
    <span className={`inline-flex rounded px-2 py-1 text-sm font-medium ${styles[status] ?? 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
}

export default function SuperAdminTenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [showSuspend, setShowSuspend] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');

  const { data: dashboard, isLoading, error } = useQuery(
    ['super-admin-tenant-dashboard', id],
    () => fetchTenantDashboard(id),
    { staleTime: 30 * 1000 }
  );

  const suspendMutation = useMutation({
    mutationFn: () => suspendTenant(id, suspendReason),
    onSuccess: () => {
      queryClient.invalidateQueries(['super-admin-tenant-dashboard', id]);
      queryClient.invalidateQueries('super-admin-dashboard');
      setShowSuspend(false);
      setSuspendReason('');
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: () => reactivateTenant(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['super-admin-tenant-dashboard', id]);
      queryClient.invalidateQueries('super-admin-dashboard');
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
        Loading…
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        Tenant not found or you don’t have access.
      </div>
    );
  }

  const tenant = dashboard.tenant as Tenant;
  const storage = dashboard.storage_usage;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{tenant.name}</h2>
        <Link href="/super-admin" className="text-sm text-blue-600 hover:underline">
          ← Back to list
        </Link>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Status</h3>
        <div className="flex items-center gap-3">
          {statusBadge(tenant.status)}
          {tenant.status === 'SUSPENDED' ? (
            <button
              type="button"
              onClick={() => reactivateMutation.mutate()}
              disabled={reactivateMutation.isLoading}
              className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              Reactivate
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowSuspend(true)}
              className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
            >
              Suspend
            </button>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Tenant details</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-600">ID</dt>
          <dd className="font-mono text-xs">{tenant.id}</dd>
          <dt className="text-gray-600">Code</dt>
          <dd className="font-medium">{tenant.tenant_code ?? '—'}</dd>
          <dt className="text-gray-600">Domain</dt>
          <dd className="font-medium">{tenant.domain ?? '—'}</dd>
          <dt className="text-gray-600">Plan</dt>
          <dd className="font-medium">{tenant.subscription_plan}</dd>
          <dt className="text-gray-600">Contact</dt>
          <dd className="font-medium">{tenant.contact_email ?? '—'}</dd>
          <dt className="text-gray-600">Created</dt>
          <dd className="font-medium">{formatDate(tenant.created_at)}</dd>
        </dl>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Storage usage</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-600">Total</dt>
          <dd className="font-medium">{formatBytes(storage?.total_bytes ?? 0)}</dd>
          <dt className="text-gray-600">Documents</dt>
          <dd className="font-medium">{formatBytes(storage?.document_bytes ?? 0)}</dd>
          <dt className="text-gray-600">Quota</dt>
          <dd className="font-medium">{storage?.quota_bytes != null ? formatBytes(storage.quota_bytes) : '—'}</dd>
          <dt className="text-gray-600">Usage %</dt>
          <dd className="font-medium">{storage?.usage_percentage != null ? `${storage.usage_percentage}%` : '—'}</dd>
        </dl>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Counts</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-600">Users</dt>
          <dd className="font-medium">{dashboard.user_count ?? 0}</dd>
          <dt className="text-gray-600">Active users</dt>
          <dd className="font-medium">{dashboard.active_user_count ?? 0}</dd>
          <dt className="text-gray-600">Documents</dt>
          <dd className="font-medium">{dashboard.document_count ?? 0}</dd>
        </dl>
      </section>

      {showSuspend && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Suspend tenant</h3>
            <p className="text-sm text-gray-600 mb-2">Reason (required):</p>
            <textarea
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              rows={3}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm mb-4"
            />
            {suspendMutation.isError && (
              <p className="mb-2 text-sm text-red-600">{getApiErrorMessage(suspendMutation.error)}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowSuspend(false); setSuspendReason(''); suspendMutation.reset(); }}
                className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => suspendMutation.mutate()}
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
