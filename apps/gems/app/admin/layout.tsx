'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

/**
 * Admin layout: OWNER only. INVESTOR is explicitly blocked from /admin/*.
 */
const adminNav = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/investors', label: 'Investors' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <DashboardLayout title="Admin" allowedRoles={['OWNER']}>
      <nav className="mb-4 flex gap-2 border-b border-gray-200">
        {adminNav.map(({ href, label }) => {
          const isActive = pathname === href || (href !== '/admin' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`px-3 py-2 text-sm font-medium rounded-t border-b-2 -mb-px ${
                isActive ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-gray-600 hover:text-gray-900'
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
