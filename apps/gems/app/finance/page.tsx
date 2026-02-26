'use client';

import { useState } from 'react';
import { useQuery } from 'react-query';
import Link from 'next/link';
import { DataTable } from '@/components/tables/DataTable';
import {
  fetchTransactions,
  type FinancialTransaction,
  type PaymentStatus,
  type TransactionType,
} from '@/lib/finance-api';
import { fetchAssets as fetchRealEstateAssets } from '@/lib/real-estate-api';

function formatDate(iso: string | undefined | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'short' });
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
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${styles[status] ?? 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
}

export default function FinanceTransactionsPage() {
  const [processId, setProcessId] = useState('');
  const [assetId, setAssetId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | ''>('');
  const [transactionType, setTransactionType] = useState<TransactionType | ''>('');

  const { data: assetsData } = useQuery('real-estate-assets-for-filter', () => fetchRealEstateAssets({ limit: 200 }), {
    staleTime: 5 * 60 * 1000,
  });
  const assets = assetsData?.assets ?? [];

  const filters = {
    process_id: processId.trim() || undefined,
    real_estate_asset_id: assetId || undefined,
    start_date: startDate || undefined,
    end_date: endDate || undefined,
    payment_status: paymentStatus || undefined,
    transaction_type: transactionType || undefined,
    limit: 100,
    offset: 0,
  };

  const { data, isLoading, error } = useQuery(
    ['finance-transactions', filters],
    () => fetchTransactions(filters),
    { staleTime: 30 * 1000 }
  );

  const transactions = data?.transactions ?? [];
  const columns = [
    {
      key: 'transaction_number',
      header: 'Number',
      render: (row: FinancialTransaction) => (
        <Link href={`/finance/transactions/${row.id}`} className="text-blue-600 hover:underline font-mono text-sm">
          {row.transaction_number}
        </Link>
      ),
    },
    { key: 'transaction_type', header: 'Type', render: (row: FinancialTransaction) => row.transaction_type },
    { key: 'amount_cents', header: 'Amount', render: (row: FinancialTransaction) => formatCents(row.amount_cents) },
    { key: 'transaction_date', header: 'Date', render: (row: FinancialTransaction) => formatDate(row.transaction_date) },
    { key: 'payment_status', header: 'Status', render: (row: FinancialTransaction) => statusBadge(row.payment_status) },
    { key: 'description', header: 'Description', render: (row: FinancialTransaction) => (row.description?.slice(0, 40) ?? '') + (row.description && row.description.length > 40 ? '…' : '') },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 justify-between">
        <Link
          href="/finance/transactions/new"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New transaction
        </Link>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Filters</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Case (process ID)</label>
            <input
              type="text"
              value={processId}
              onChange={(e) => setProcessId(e.target.value)}
              placeholder="UUID"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Asset</label>
            <select
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">All</option>
              {(assets as { id: string; asset_code?: string }[]).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.asset_code ?? a.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">From date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Type</label>
            <select
              value={transactionType}
              onChange={(e) => setTransactionType(e.target.value as TransactionType | '')}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">All</option>
              <option value="PAYABLE">PAYABLE</option>
              <option value="RECEIVABLE">RECEIVABLE</option>
              <option value="EXPENSE">EXPENSE</option>
              <option value="INCOME">INCOME</option>
              <option value="TRANSFER">TRANSFER</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Payment status</label>
            <select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus | '')}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">All</option>
              <option value="PENDING">PENDING</option>
              <option value="PAID">PAID</option>
              <option value="PARTIAL">PARTIAL</option>
              <option value="OVERDUE">OVERDUE</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
          Loading transactions…
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          Failed to load transactions. Please try again.
        </div>
      )}
      {!isLoading && !error && (
        <DataTable<FinancialTransaction>
          columns={columns}
          data={transactions}
          keyExtractor={(row) => row.id}
          emptyMessage="No transactions match the filters."
        />
      )}
      {data && data.total > 0 && (
        <p className="text-sm text-gray-500">
          Showing {data.transactions.length} of {data.total}
        </p>
      )}
    </div>
  );
}
