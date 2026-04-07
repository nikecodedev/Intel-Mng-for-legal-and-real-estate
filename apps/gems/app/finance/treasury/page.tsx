'use client';

import { useQuery } from 'react-query';
import { api } from '@/lib/api';
import { DateDisplay, BlockLoader, CurrencyDisplay } from '@/components/ui';

interface BankAccount {
  id: string;
  account_name: string;
  bank_name: string | null;
  balance_cents: number;
  currency: string;
  last_updated: string;
}

async function fetchTreasury() {
  const { data } = await api.get<{ success: boolean; data: { accounts: BankAccount[]; total_balance_cents: number } }>('/finance/treasury');
  return data?.data;
}

export default function TreasuryPage() {
  const { data, isLoading, error } = useQuery(
    'finance-treasury',
    fetchTreasury,
    { staleTime: 30_000 }
  );

  if (isLoading) return <BlockLoader message="Carregando tesouraria..." />;

  const accounts = data?.accounts ?? [];
  const totalCents = data?.total_balance_cents ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Tesouraria</h2>
        <p className="text-sm text-gray-500">Saldo consolidado das contas bancarias</p>
      </div>

      {/* Saldo total */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-500">Saldo Total</p>
        <p className="text-3xl font-bold text-gray-900">
          <CurrencyDisplay cents={totalCents} />
        </p>
      </div>

      {/* Tabela de contas */}
      {error || !accounts.length ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
          Nenhuma conta bancaria cadastrada.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Conta</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Banco</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Saldo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ultima Atualizacao</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {accounts.map((acc) => (
                <tr key={acc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{acc.account_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{acc.bank_name || '—'}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                    <CurrencyDisplay cents={acc.balance_cents} />
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <DateDisplay value={acc.last_updated} style="short" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
