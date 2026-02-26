'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/lib/types';

interface NavItem {
  href: string;
  label: string;
  /** If set, link is shown only when user has one of these roles. */
  roles?: UserRole[];
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/legal', label: 'Legal' },
  { href: '/auctions', label: 'Auctions' },
  { href: '/real-estate', label: 'Real Estate' },
  { href: '/finance', label: 'Finance' },
  { href: '/crm', label: 'CRM' },
  { href: '/investor', label: 'Investor', roles: ['INVESTOR'] },
  { href: '/admin', label: 'Admin', roles: ['OWNER'] },
  { href: '/super-admin', label: 'Super Admin', roles: ['OWNER'] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, hasAnyRole } = useAuth();

  const visibleItems = navItems.filter((item) => {
    if (!item.roles || item.roles.length === 0) return true;
    return user?.role && hasAnyRole(item.roles);
  });

  return (
    <aside className="w-56 min-h-screen bg-white border-r border-gray-200 flex flex-col shrink-0">
      <div className="p-4 border-b border-gray-200">
        <Link href="/dashboard" className="font-semibold text-gray-900 text-[15px]">
          GEMS
        </Link>
      </div>
      <nav className="flex-1 p-2 overflow-y-auto">
        <ul className="space-y-0.5">
          {visibleItems.map(({ href, label }) => {
            const isActive = pathname === href || (href === '/super-admin' && pathname.startsWith('/super-admin'));
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`block px-3 py-2 rounded-md text-sm text-gray-700 ${
                    isActive
                      ? 'bg-gray-100 text-gray-900 font-medium'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
