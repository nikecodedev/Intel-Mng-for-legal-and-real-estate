'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

const financeNav = [
  { href: '/finance', label: 'Visão Geral' },
  { href: '/finance/transactions', label: 'Transações' },
  { href: '/finance/expenses', label: 'Despesas' },
  { href: '/finance/receivables', label: 'Recebíveis' },
  { href: '/finance/payables', label: 'Contas a Pagar' },
  { href: '/finance/reconciliation', label: 'Conciliação' },
];

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <DashboardLayout title="Financeiro">
      <nav className="mb-4 flex gap-2 border-b border-gray-200">
        {financeNav.map(({ href, label }) => {
          const isActive =
            pathname === href ||
            (href !== '/finance' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`px-3 py-2 text-sm font-medium rounded-t border-b-2 -mb-px ${
                isActive
                  ? 'border-blue-600 text-blue-600 bg-white'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      {children}
    </DashboardLayout>
  );
}
