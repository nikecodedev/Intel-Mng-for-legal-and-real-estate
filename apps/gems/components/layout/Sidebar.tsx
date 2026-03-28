'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/lib/types';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** If set, link is shown only when user has one of these roles. */
  roles?: UserRole[];
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: '\u25A0' },
  { href: '/legal', label: 'Legal', icon: '\u2696' },
  { href: '/auctions', label: 'Auctions', icon: '\u2692' },
  { href: '/real-estate', label: 'Real Estate', icon: '\u2302' },
  { href: '/finance', label: 'Finance', icon: '\u2234' },
  { href: '/crm', label: 'CRM', icon: '\u2605' },
  { href: '/workflow', label: 'Workflow', icon: '\u21BB', roles: ['OWNER', 'OPERATIONAL'] },
  { href: '/compliance', label: 'Compliance', icon: '\u2611', roles: ['OWNER'] },
  { href: '/investor', label: 'Investor', icon: '\u2197', roles: ['INVESTOR'] },
  { href: '/admin', label: 'Admin', icon: '\u2699', roles: ['OWNER'] },
  { href: '/super-admin', label: 'Super Admin', icon: '\u2731', roles: ['OWNER'] },
];

export function Sidebar({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { user, hasAnyRole } = useAuth();

  const visibleItems = navItems.filter((item) => {
    // Items without role restrictions are always visible
    if (!item.roles || item.roles.length === 0) return true;
    // When user has no role defined, still show non-restricted items (handled above)
    // but hide role-restricted items to avoid empty sidebar
    if (!user?.role) return false;
    return hasAnyRole(item.roles);
  });

  const userInitials = (() => {
    const first = user?.first_name?.trim()?.[0] ?? '';
    const last = user?.last_name?.trim()?.[0] ?? '';
    if (first || last) return (first + last).toUpperCase();
    return user?.email?.[0]?.toUpperCase() ?? '?';
  })();

  const userName = (() => {
    const first = user?.first_name?.trim();
    const last = user?.last_name?.trim();
    if (first || last) return [first, last].filter(Boolean).join(' ').trim();
    return user?.email ?? '';
  })();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-slate-900 transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-slate-700/50 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
            G
          </div>
          <Link href="/dashboard" className="text-lg font-bold tracking-tight text-white" onClick={onClose}>
            GEMS
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {visibleItems.map(({ href, label, icon }) => {
              const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onClose}
                    className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? 'border-l-[3px] border-blue-500 bg-blue-500/10 text-white'
                        : 'border-l-[3px] border-transparent text-slate-400 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <span className={`text-base ${isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'}`}>
                      {icon}
                    </span>
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User info at bottom */}
        {user && (
          <div className="border-t border-slate-700/50 px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-200">
                {userInitials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-200">{userName}</p>
                <p className="truncate text-xs text-slate-500">{user.role ?? 'Member'}</p>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
