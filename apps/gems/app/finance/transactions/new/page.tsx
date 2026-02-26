'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createTransaction, getFinanceValidationError, type CreateTransactionInput, type TransactionType } from '@/lib/finance-api';
import { fetchAssets } from '@/lib/real-estate-api';
import { useQuery } from 'react-query';

const TRANSACTION_TYPES: TransactionType[] = ['PAYABLE', 'RECEIVABLE', 'EXPENSE', 'INCOME', 'TRANSFER'];

export default function NewTransactionPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateTransactionInput & { amount: string }>({
    transaction_type: 'PAYABLE',
    amount: '',
    amount_cents: 0,
    transaction_date: new Date().toISOString().slice(0, 10),
    description: '',
    process_id: '',
    real_estate_asset_id: '',
    client_id: '',
    vendor_name: '',
    payment_method: '',
    due_date: '',
    notes: '',
  });

  const { data: assetsData } = useQuery('real-estate-assets', () => fetchAssets({ limit: 200 }), { staleTime: 60 * 1000 });
  const assets = assetsData?.assets ?? [];

  const mutation = useMutation({
    mutationFn: () => {
      const amountCents = Math.round(parseFloat(form.amount || '0') * 100);
      if (!Number.isFinite(amountCents) || amountCents <= 0) throw new Error('Invalid amount');
      const payload: CreateTransactionInput = {
        transaction_type: form.transaction_type,
        amount_cents: amountCents,
        currency: 'BRL',
        transaction_date: form.transaction_date,
        description: form.description.trim(),
      };
      if (form.due_date) payload.due_date = form.due_date;
      if (form.process_id?.trim()) payload.process_id = form.process_id.trim();
      if (form.real_estate_asset_id) payload.real_estate_asset_id = form.real_estate_asset_id;
      if (form.client_id?.trim()) payload.client_id = form.client_id.trim();
      if (form.vendor_name?.trim()) payload.vendor_name = form.vendor_name.trim();
      if (form.payment_method?.trim()) payload.payment_method = form.payment_method.trim();
      if (form.notes?.trim()) payload.notes = form.notes.trim();
      return createTransaction(payload);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries('finance-transactions');
      router.push(`/finance/transactions/${data.id}`);
    },
  });

  const validationError = mutation.isError ? getFinanceValidationError(mutation.error) : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Create transaction</h2>
        <Link href="/finance" className="text-sm text-blue-600 hover:underline">
          ← Back to list
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        {validationError && (
          <div className="rounded-md bg-red-50 p-4 text-red-800 text-sm" role="alert">
            <p className="font-medium">{validationError.message}</p>
            {validationError.details && (
              <ul className="mt-2 list-disc list-inside">
                {Object.entries(validationError.details).map(([key, val]) => (
                  <li key={key}>{key}: {val}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
            <select
              value={form.transaction_type}
              onChange={(e) => setForm((f) => ({ ...f, transaction_type: e.target.value as TransactionType }))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              required
            >
              {TRANSACTION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (BRL) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Transaction date *</label>
          <input
            type="date"
            value={form.transaction_date}
            onChange={(e) => setForm((f) => ({ ...f, transaction_date: e.target.value }))}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </div>

        <div className="border-t pt-4">
          <p className="text-sm text-gray-600 mb-2">Link to (at least one required — backend validated)</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Case (process ID)</label>
              <input
                type="text"
                value={form.process_id}
                onChange={(e) => setForm((f) => ({ ...f, process_id: e.target.value }))}
                placeholder="UUID"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Asset</label>
              <select
                value={form.real_estate_asset_id}
                onChange={(e) => setForm((f) => ({ ...f, real_estate_asset_id: e.target.value }))}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">—</option>
                {(assets as { id: string; asset_code?: string }[]).map((a) => (
                  <option key={a.id} value={a.id}>{a.asset_code ?? a.id.slice(0, 8)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Client ID</label>
              <input
                type="text"
                value={form.client_id}
                onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                placeholder="UUID"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Due date</label>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vendor name</label>
            <input
              type="text"
              value={form.vendor_name}
              onChange={(e) => setForm((f) => ({ ...f, vendor_name: e.target.value }))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Payment method</label>
          <input
            type="text"
            value={form.payment_method}
            onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))}
            placeholder="e.g. PIX, Transfer"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={mutation.isLoading}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isLoading ? 'Creating…' : 'Create transaction'}
          </button>
          <Link
            href="/finance"
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
