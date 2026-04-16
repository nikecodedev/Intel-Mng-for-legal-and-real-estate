'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import Link from 'next/link';
import { StatusBadge, BlockLoader } from '@/components/ui';
import { formatBytes } from '@/lib/utils';
import { api } from '@/lib/api';
import {
  fetchSuperAdminDashboard,
  suspendTenant,
  reactivateTenant,
  getApiErrorMessage,
  type TenantListItem,
} from '@/lib/super-admin-api';

const MAINTENANCE_ACTIONS = [
  { action: 'clear_cache',        label: 'Limpar Cache Redis',        color: 'text-blue-700 border-blue-300 hover:bg-blue-50',   desc: 'Remove entradas de cache expiradas' },
  { action: 'reprocess_queue',    label: 'Reprocessar Fila',          color: 'text-amber-700 border-amber-300 hover:bg-amber-50', desc: 'Reenfileira jobs falhados' },
  { action: 'verify_integrity',   label: 'Verificar Integridade',     color: 'text-purple-700 border-purple-300 hover:bg-purple-50', desc: 'Valida hash chain do audit log' },
  { action: 'run_backups',        label: 'Executar Backup',           color: 'text-green-700 border-green-300 hover:bg-green-50', desc: 'Força backup imediato da BD' },
];

export default function SuperAdminTenantsPage() {
  const queryClient = useQueryClient();
  const [suspendId, setSuspendId] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [maintenanceResult, setMaintenanceResult] = useState<Record<string, string>>({});
  const [maintenanceLoading, setMaintenanceLoading] = useState<string | null>(null);

  const { data: dashboard, isLoading, error } = useQuery(
    'super-admin-dashboard',
    fetchSuperAdminDashboard,
    { staleTime: 30 * 1000 }
  );

  const backupQuery = useQuery('super-admin-backup', async () => {
    const res = await api.get('/super-admin/backup-status').catch(() => ({ data: null }));
    return res.data?.backup ?? res.data ?? null;
  }, { staleTime: 60 * 1000, retry: false });

  async function runMaintenance(action: string) {
    setMaintenanceLoading(action);
    try {
      const res = await api.post(`/super-admin/maintenance/${action}`, {});
      setMaintenanceResult(prev => ({ ...prev, [action]: res.data?.message ?? 'Concluído.' }));
    } catch (err: any) {
      setMaintenanceResult(prev => ({ ...prev, [action]: err?.response?.data?.message ?? 'Erro ao executar.' }));
    } finally {
      setMaintenanceLoading(null);
    }
  }

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

      {/* Backup Status */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-800">Estado dos Backups</h2>
          <button onClick={() => backupQuery.refetch()} className="text-xs text-blue-600 hover:underline">Atualizar</button>
        </div>
        {backupQuery.isLoading ? (
          <p className="text-sm text-gray-400">Carregando...</p>
        ) : !backupQuery.data ? (
          <p className="text-sm text-gray-400">Sem informação de backup disponível.</p>
        ) : (
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            {backupQuery.data.last_backup_at && (
              <><dt className="text-gray-500">Último backup</dt><dd className="font-medium">{new Date(backupQuery.data.last_backup_at).toLocaleString('pt-BR')}</dd></>
            )}
            {backupQuery.data.status && (
              <><dt className="text-gray-500">Estado</dt><dd>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${backupQuery.data.status === 'OK' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {backupQuery.data.status}
                </span>
              </dd></>
            )}
            {backupQuery.data.size_bytes != null && (
              <><dt className="text-gray-500">Tamanho</dt><dd className="font-medium">{formatBytes(backupQuery.data.size_bytes)}</dd></>
            )}
            {backupQuery.data.next_backup_at && (
              <><dt className="text-gray-500">Próximo backup</dt><dd className="font-medium">{new Date(backupQuery.data.next_backup_at).toLocaleString('pt-BR')}</dd></>
            )}
          </dl>
        )}
      </div>

      {/* Maintenance Panel */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-1">Manutenção do Sistema</h2>
        <p className="text-xs text-gray-400 mb-4">Operações administrativas sobre cache, filas e integridade.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {MAINTENANCE_ACTIONS.map(({ action, label, color, desc }) => (
            <div key={action} className="rounded-lg border border-gray-100 p-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">{label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                {maintenanceResult[action] && (
                  <p className={`text-xs mt-1 ${maintenanceResult[action].toLowerCase().includes('erro') ? 'text-red-600' : 'text-green-600'}`}>
                    {maintenanceResult[action]}
                  </p>
                )}
              </div>
              <button
                onClick={() => runMaintenance(action)}
                disabled={maintenanceLoading === action}
                className={`shrink-0 rounded border px-3 py-1.5 text-xs font-medium ${color} disabled:opacity-50`}
              >
                {maintenanceLoading === action ? 'A executar...' : 'Executar'}
              </button>
            </div>
          ))}
        </div>
      </div>

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
