'use client';

import { use, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import Link from 'next/link';
import {
  fetchTransactionById,
  markPayment,
  getFinanceValidationError,
  type FinancialTransaction,
  type PaymentStatus,
} from '@/lib/finance-api';
import { uploadDocument } from '@/lib/legal-api';

function formatDate(iso: string | undefined | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
  } catch {
    return String(iso);
  }
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function statusBadge(status: PaymentStatus) {
  const styles: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-800',
    PAID: 'bg-green-100 text-green-800',
    PARTIAL: 'bg-blue-100 text-blue-800',
    CANCELLED: 'bg-gray-100 text-gray-700',
    OVERDUE: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-flex rounded px-2 py-1 text-sm font-medium ${styles[status] ?? 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
}

export default function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);

  const { data: transaction, isLoading, error } = useQuery(
    ['finance-transaction', id],
    () => fetchTransactionById(id),
    { staleTime: 30 * 1000 }
  );

  const markPaidMutation = useMutation({
    mutationFn: async () => {
      if (!proofFile) throw new Error('Please select a proof file');
      const formData = new FormData();
      formData.append('file', proofFile);
      formData.append('title', `Payment proof - ${transaction?.transaction_number ?? id}`);
      formData.append('document_type', 'OTHER');
      const docResult = await uploadDocument(formData);
      return markPayment(id, {
        paid_date: paidDate,
        payment_method: paymentMethod,
        proof_document_id: docResult.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['finance-transaction', id]);
      queryClient.invalidateQueries('finance-transactions');
      setShowMarkPaid(false);
      setProofFile(null);
    },
  });

  const validationError = markPaidMutation.isError ? getFinanceValidationError(markPaidMutation.error) : null;

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
        Loading transaction…
      </div>
    );
  }

  if (error || !transaction) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        Transaction not found or you don’t have access.
      </div>
    );
  }

  const t = transaction as FinancialTransaction;
  const canMarkPaid = t.payment_status === 'PENDING' || t.payment_status === 'OVERDUE' || t.payment_status === 'PARTIAL';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 font-mono">{t.transaction_number}</h2>
        <Link href="/finance" className="text-sm text-blue-600 hover:underline">
          ← Back to list
        </Link>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Status</h3>
        <div className="flex items-center gap-3">
          {statusBadge(t.payment_status)}
          {t.paid_date && (
            <span className="text-sm text-gray-600">Paid on {formatDate(t.paid_date)}</span>
          )}
          {t.proof_document_id && (
            <Link
              href={`/legal/documents/${t.proof_document_id}`}
              className="text-sm text-blue-600 hover:underline"
            >
              View proof
            </Link>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Details</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-600">Type</dt>
          <dd className="font-medium">{t.transaction_type}</dd>
          <dt className="text-gray-600">Amount</dt>
          <dd className="font-medium">{formatCents(t.amount_cents)}</dd>
          <dt className="text-gray-600">Transaction date</dt>
          <dd className="font-medium">{formatDate(t.transaction_date)}</dd>
          <dt className="text-gray-600">Due date</dt>
          <dd className="font-medium">{formatDate(t.due_date)}</dd>
          <dt className="text-gray-600">Description</dt>
          <dd className="font-medium">{t.description}</dd>
          {t.vendor_name && (
            <>
              <dt className="text-gray-600">Vendor</dt>
              <dd className="font-medium">{t.vendor_name}</dd>
            </>
          )}
          {t.process_id && (
            <>
              <dt className="text-gray-600">Case (process)</dt>
              <dd className="font-medium font-mono text-xs">{t.process_id}</dd>
            </>
          )}
          {t.real_estate_asset_id && (
            <>
              <dt className="text-gray-600">Asset</dt>
              <dd className="font-medium">
                <Link href={`/real-estate/${t.real_estate_asset_id}`} className="text-blue-600 hover:underline">
                  {t.real_estate_asset_id.slice(0, 8)}…
                </Link>
              </dd>
            </>
          )}
        </dl>
      </section>

      {canMarkPaid && (
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          {!showMarkPaid ? (
            <button
              type="button"
              onClick={() => setShowMarkPaid(true)}
              className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              Mark as paid (upload proof)
            </button>
          ) : (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-700">Mark as paid</h3>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment date *</label>
                  <input
                    type="date"
                    value={paidDate}
                    onChange={(e) => setPaidDate(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment method *</label>
                  <input
                    type="text"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    placeholder="e.g. PIX, Transfer"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Proof document (file upload) *</label>
                <input
                  ref={proofInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700"
                />
                <p className="mt-1 text-xs text-gray-500">File is uploaded to documents; backend requires proof to mark paid.</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => markPaidMutation.mutate()}
                  disabled={!proofFile || markPaidMutation.isLoading}
                  className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {markPaidMutation.isLoading ? 'Uploading & marking…' : 'Confirm payment'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMarkPaid(false);
                    setProofFile(null);
                    markPaidMutation.reset();
                  }}
                  className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
