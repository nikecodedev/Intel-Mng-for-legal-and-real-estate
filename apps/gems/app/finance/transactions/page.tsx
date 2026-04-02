'use client';

import { useState, useMemo } from 'react';
import { useQuery } from 'react-query';
import Link from 'next/link';
import { DataTable } from '@/components/tables/DataTable';
import { StatusBadge, DateDisplay, CurrencyDisplay, BlockLoader } from '@/components/ui';
import {
  fetchTransactions,
  type FinancialTransaction,
  type PaymentStatus,
  type TransactionType,
} from '@/lib/finance-api';
import { fetchAssets as fetchRealEstateAssets } from '@/lib/real-estate-api';

export default function FinanceTransactionsPage() {
  const [processId, setProcessId] = useState('');
  const [assetId, setAssetId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [txType, setTxType] = useState('');
  const [payStatus, setPayStatus] = useState('');

  const filters = useMemo(() => ({
    process_id: processId || undefined,
    real_estate_asset_id: assetId || undefined,
    start_date: startDate || undefined,
    end_date: endDate || undefined,
    transaction_type: (txType || undefined) as TransactionType | undefined,
    payment_status: (payStatus || undefined) as PaymentStatus | undefined,
    limit: 100,
    offset: 0,
  }), [processId, assetId, startDate, endDate, txType, payStatus]);

  const { data: assetsData } = useQuery(
    'real-estate-assets-for-filter',
    () => fetchRealEstateAssets({ limit: 200 }),
    { staleTime: 5 * 60 * 1000, retry: false }
  );

  const { data, isLoading, error } = useQuery(
    ['finance-transactions', filters],
    () => fetchTransactions(filters),
    { staleTime: 30 * 1000 }
  );

  const transactions = data?.transactions ?? [];
  const total = data?.total ?? 0;
  const assets = assetsData?.assets ?? [];

  const columns = [
    {
      key: 'transaction_number',
      header: 'Número',
      render: (row: FinancialTransaction) => (
        <Link href={`/finance/transactions/${row.id}`} className="text-blue-600 hover:underline font-mono text-xs">
          {row.transaction_number}
        </Link>
      ),
    },
    {
      key: 'transaction_type',
      header: 'Tipo',
      render: (row: FinancialTransaction) => row.transaction_type,
    },
    {
      key: 'amount_cents',
      header: 'Valor',
      render: (row: FinancialTransaction) => <CurrencyDisplay cents={row.amount_cents} />,
    },
    {
      key: 'transaction_date',
      header: 'Data',
      render: (row: FinancialTransaction) => <DateDisplay value={row.transaction_date} style="short" />,
    },
    {
      key: 'payment_status',
      header: 'Situação',
      render: (row: FinancialTransaction) => <StatusBadge variant="payment" value={row.payment_status} />,
    },
    {
      key: 'description',
      header: 'Descrição',
      render: (row: FinancialTransaction) =>
        row.description ? (row.description.length > 40 ? row.description.slice(0, 40) + '...' : row.description) : '-',
    },
  ];

  if (isLoading) return <BlockLoader message="Carregando transações..." />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/finance/transactions/new" className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          Nova transação
        </Link>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <input value={processId} onChange={e => setProcessId(e.target.value)} placeholder="Processo" className="rounded border border-gray-300 px-3 py-2 text-sm" />
        <select value={assetId} onChange={e => setAssetId(e.target.value)} className="rounded border border-gray-300 px-3 py-2 text-sm">
          <option value="">Ativo</option>
          {assets.map((a: any) => <option key={a.id} value={a.id}>{a.asset_code || a.id.slice(0, 8)}</option>)}
        </select>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="rounded border border-gray-300 px-3 py-2 text-sm" />
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="rounded border border-gray-300 px-3 py-2 text-sm" />
        <select value={txType} onChange={e => setTxType(e.target.value)} className="rounded border border-gray-300 px-3 py-2 text-sm">
          <option value="">Tipo</option>
          <option value="PAYABLE">A Pagar</option>
          <option value="RECEIVABLE">A Receber</option>
          <option value="EXPENSE">Despesa</option>
          <option value="INCOME">Receita</option>
          <option value="TRANSFER">Transferência</option>
        </select>
        <select value={payStatus} onChange={e => setPayStatus(e.target.value)} className="rounded border border-gray-300 px-3 py-2 text-sm">
          <option value="">Situação</option>
          <option value="PENDING">Pendente</option>
          <option value="PAID">Pago</option>
          <option value="PARTIAL">Parcial</option>
          <option value="OVERDUE">Vencido</option>
          <option value="CANCELLED">Cancelado</option>
        </select>
      </div>

      {error ? (
        <p className="text-sm text-red-600">Falha ao carregar transações.</p>
      ) : (
        <>
          <p className="text-xs text-gray-500">Mostrando {transactions.length} de {total}</p>
          <DataTable<FinancialTransaction>
            columns={columns}
            data={transactions}
            keyExtractor={(row) => row.id}
            emptyMessage="Nenhuma transação encontrada."
          />
        </>
      )}
    </div>
  );
}
