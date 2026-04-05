'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import Link from 'next/link';
import { StatusBadge, DateDisplay, BlockLoader } from '@/components/ui';
import { formatBytes } from '@/lib/utils';
import { api } from '@/lib/api';
import {
  fetchTenantDashboard,
  suspendTenant,
  reactivateTenant,
  getApiErrorMessage,
  type Tenant,
} from '@/lib/super-admin-api';

function VerifyChainButton({ tenantId }: { tenantId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  async function run() {
    setLoading(true); setResult(null);
    try {
      const res = await api.get(`/audit-integrity/verify-chain/${tenantId}`);
      setResult(res.data?.data ?? res.data);
    } catch (err: any) {
      if (err?.response?.status === 422) setResult(err.response.data?.data ?? { chain_integrity: 'invalid' });
      else setResult({ error: err?.response?.data?.message || 'Falha' });
    } finally { setLoading(false); }
  }
  return (
    <div>
      <button onClick={run} disabled={loading} className="rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
        {loading ? 'Verificando...' : 'Verificar Cadeia SHA-256'}
      </button>
      {result && !result.error && (
        <p className={`mt-2 text-sm ${result.chain_integrity === 'valid' ? 'text-green-600' : 'text-red-600'}`}>
          {result.chain_integrity === 'valid' ? 'Cadeia válida' : 'Cadeia inválida'} — {result.total_entries ?? 0} registos, {result.valid_entries ?? 0} válidos
        </p>
      )}
      {result?.error && <p className="mt-2 text-sm text-red-600">{result.error}</p>}
    </div>
  );
}

export default function SuperAdminTenantDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const queryClient = useQueryClient();
  const [showSuspend, setShowSuspend] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');

  // Edit tenant state
  const [editingTenant, setEditingTenant] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPlan, setEditPlan] = useState('');
  const [editContactEmail, setEditContactEmail] = useState('');
  const [editDomain, setEditDomain] = useState('');
  const [editTenantLoading, setEditTenantLoading] = useState(false);
  const [editTenantMsg, setEditTenantMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  function startEditTenant() {
    setEditName(tenant?.name ?? '');
    setEditPlan(tenant?.subscription_plan ?? '');
    setEditContactEmail(tenant?.contact_email ?? '');
    setEditDomain(tenant?.domain ?? '');
    setEditingTenant(true);
    setEditTenantMsg(null);
  }

  async function saveEditTenant() {
    setEditTenantLoading(true);
    setEditTenantMsg(null);
    try {
      await api.put(`/super-admin/tenants/${id}`, {
        name: editName,
        subscription_plan: editPlan,
        contact_email: editContactEmail,
        domain: editDomain,
      });
      setEditingTenant(false);
      setEditTenantMsg({ type: 'success', text: 'Tenant atualizado com sucesso.' });
      queryClient.invalidateQueries(['super-admin-tenant-dashboard', id]);
    } catch (err: any) {
      setEditTenantMsg({ type: 'error', text: err?.response?.data?.message || 'Falha ao atualizar tenant.' });
    } finally {
      setEditTenantLoading(false);
    }
  }

  if (isLoading) return <BlockLoader message="Carregando..." />;

  if (error || !dashboard) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        Tenant nao encontrado ou voce nao tem acesso.
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
          Voltar para lista
        </Link>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Status</h3>
        <div className="flex items-center gap-3">
          <StatusBadge variant="tenant" value={tenant.status} />
          {tenant.status === 'SUSPENDED' ? (
            <button
              type="button"
              onClick={() => reactivateMutation.mutate()}
              disabled={reactivateMutation.isLoading}
              className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {reactivateMutation.isLoading ? 'Reativando...' : 'Reativar'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowSuspend(true)}
              className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
            >
              Suspender
            </button>
          )}
        </div>
        {reactivateMutation.isError && (
          <p className="mt-2 text-sm text-red-600">Falha ao reativar tenant.</p>
        )}
        {reactivateMutation.isSuccess && (
          <p className="mt-2 text-sm text-green-600">Tenant reativado com sucesso.</p>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-500">Detalhes do Tenant</h3>
          {!editingTenant && (
            <button
              onClick={startEditTenant}
              className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              Editar
            </button>
          )}
        </div>

        {editTenantMsg && (
          <div className={`mb-3 rounded-lg border p-3 text-sm ${editTenantMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
            {editTenantMsg.text}
          </div>
        )}

        {editingTenant ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
            <h4 className="text-sm font-medium text-blue-800">Editar Tenant</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Nome</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Plano de Assinatura</label>
                <input
                  value={editPlan}
                  onChange={(e) => setEditPlan(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">E-mail de Contato</label>
                <input
                  type="email"
                  value={editContactEmail}
                  onChange={(e) => setEditContactEmail(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Domínio</label>
                <input
                  value={editDomain}
                  onChange={(e) => setEditDomain(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={saveEditTenant}
                disabled={editTenantLoading}
                className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {editTenantLoading ? 'Salvando...' : 'Salvar'}
              </button>
              <button
                onClick={() => { setEditingTenant(false); setEditTenantMsg(null); }}
                className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-600">ID</dt>
            <dd className="font-mono text-xs">{tenant.id}</dd>
            <dt className="text-gray-600">Codigo</dt>
            <dd className="font-medium">{tenant.tenant_code ?? '—'}</dd>
            <dt className="text-gray-600">Dominio</dt>
            <dd className="font-medium">{tenant.domain ?? '—'}</dd>
            <dt className="text-gray-600">Plano</dt>
            <dd className="font-medium">{tenant.subscription_plan}</dd>
            <dt className="text-gray-600">Contato</dt>
            <dd className="font-medium">{tenant.contact_email ?? '—'}</dd>
            <dt className="text-gray-600">Criado em</dt>
            <dd className="font-medium"><DateDisplay value={tenant.created_at} style="medium" /></dd>
          </dl>
        )}
      </section>

      {/* Links para Cotas e White-Label */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Configuracoes</h3>
        <div className="flex gap-4">
          <Link
            href={`/super-admin/tenants/${id}/quotas`}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Gerenciar Cotas
          </Link>
          <Link
            href={`/super-admin/tenants/${id}/white-label`}
            className="rounded bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
          >
            Configurar White-Label
          </Link>
          <VerifyChainButton tenantId={id} />
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Uso de Armazenamento</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-600">Total</dt>
          <dd className="font-medium">{formatBytes(storage?.total_bytes ?? 0)}</dd>
          <dt className="text-gray-600">Documentos</dt>
          <dd className="font-medium">{formatBytes(storage?.document_bytes ?? 0)}</dd>
          <dt className="text-gray-600">Cota</dt>
          <dd className="font-medium">{storage?.quota_bytes != null ? formatBytes(storage.quota_bytes) : '—'}</dd>
          <dt className="text-gray-600">Uso %</dt>
          <dd className="font-medium">{storage?.usage_percentage != null ? `${storage.usage_percentage}%` : '—'}</dd>
        </dl>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Contagens</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-600">Usuarios</dt>
          <dd className="font-medium">{dashboard.user_count ?? 0}</dd>
          <dt className="text-gray-600">Usuarios ativos</dt>
          <dd className="font-medium">{dashboard.active_user_count ?? 0}</dd>
          <dt className="text-gray-600">Documentos</dt>
          <dd className="font-medium">{dashboard.document_count ?? 0}</dd>
        </dl>
      </section>

      {showSuspend && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Suspender Tenant</h3>
            <p className="text-sm text-gray-600 mb-2">Motivo (obrigatorio):</p>
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
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => suspendMutation.mutate()}
                disabled={!suspendReason.trim() || suspendMutation.isLoading}
                className="rounded bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {suspendMutation.isLoading ? 'Suspendendo...' : 'Suspender'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
