'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  provisionTenant,
  getApiErrorMessage,
  type ProvisionTenantInput,
  type SubscriptionPlan,
} from '@/lib/super-admin-api';

const PLANS: SubscriptionPlan[] = ['FREE', 'STANDARD', 'PREMIUM', 'ENTERPRISE', 'CUSTOM'];

export default function SuperAdminCreateTenantPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ProvisionTenantInput>({
    name: '',
    tenant_code: '',
    domain: '',
    subscription_plan: 'STANDARD',
    contact_email: '',
    quotas: {
      max_storage_bytes: undefined,
      max_users: undefined,
      max_documents: undefined,
    },
    white_label: {
      company_name: '',
    },
  });

  const mutation = useMutation({
    mutationFn: (payload: ProvisionTenantInput) => provisionTenant(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries('super-admin-dashboard');
      router.push(`/super-admin/tenants/${data.tenant.id}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const payload: ProvisionTenantInput = {
      name: form.name.trim(),
      subscription_plan: form.subscription_plan,
    };
    if (form.tenant_code?.trim()) payload.tenant_code = form.tenant_code.trim();
    if (form.domain?.trim()) payload.domain = form.domain.trim();
    if (form.contact_email?.trim()) payload.contact_email = form.contact_email.trim();
    if (form.quotas?.max_storage_bytes || form.quotas?.max_users || form.quotas?.max_documents) {
      payload.quotas = {};
      if (form.quotas?.max_storage_bytes) payload.quotas.max_storage_bytes = form.quotas.max_storage_bytes;
      if (form.quotas?.max_users) payload.quotas.max_users = form.quotas.max_users;
      if (form.quotas?.max_documents) payload.quotas.max_documents = form.quotas.max_documents;
    }
    if (form.white_label?.company_name?.trim()) payload.white_label = { company_name: form.white_label.company_name.trim() };
    mutation.mutate(payload);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Create tenant</h2>
        <Link href="/super-admin" className="text-sm text-blue-600 hover:underline">
          ← Back to list
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        {mutation.isError && (
          <div className="rounded-md bg-red-50 p-4 text-red-800 text-sm" role="alert">
            {getApiErrorMessage(mutation.error)}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tenant code</label>
            <input
              type="text"
              value={form.tenant_code}
              onChange={(e) => setForm((f) => ({ ...f, tenant_code: e.target.value }))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
            <input
              type="text"
              value={form.domain}
              onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Subscription plan</label>
          <select
            value={form.subscription_plan}
            onChange={(e) => setForm((f) => ({ ...f, subscription_plan: e.target.value as SubscriptionPlan }))}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {PLANS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Contact email</label>
          <input
            type="email"
            value={form.contact_email}
            onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="border-t pt-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Quotas (optional)</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Max storage (bytes)</label>
              <input
                type="number"
                min="0"
                value={form.quotas?.max_storage_bytes ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    quotas: { ...f.quotas, max_storage_bytes: e.target.value ? Number(e.target.value) : undefined },
                  }))
                }
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Max users</label>
              <input
                type="number"
                min="0"
                value={form.quotas?.max_users ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    quotas: { ...f.quotas, max_users: e.target.value ? Number(e.target.value) : undefined },
                  }))
                }
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Max documents</label>
              <input
                type="number"
                min="0"
                value={form.quotas?.max_documents ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    quotas: { ...f.quotas, max_documents: e.target.value ? Number(e.target.value) : undefined },
                  }))
                }
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">White-label company name</label>
          <input
            type="text"
            value={form.white_label?.company_name ?? ''}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                white_label: { ...f.white_label, company_name: e.target.value },
              }))
            }
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={mutation.isLoading || !form.name.trim()}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isLoading ? 'Creating…' : 'Create tenant'}
          </button>
          <Link
            href="/super-admin"
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
