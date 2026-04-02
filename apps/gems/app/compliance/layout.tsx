'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

const complianceNav = [
  { href: '/compliance', label: 'Cadeia de Auditoria' },
  { href: '/compliance/quality-gates', label: 'Portões de Qualidade' },
];

export default function ComplianceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <DashboardLayout title="Conformidade">
      <nav className="mb-4 flex gap-2 border-b border-gray-200">
        {complianceNav.map(({ href, label }) => {
          const isActive = pathname === href || (href !== '/compliance' && pathname.startsWith(href));
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
