'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/lib/types';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles?: UserRole[];
  section?: string;
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Painel', icon: <DashboardIcon />, section: 'main' },
  { href: '/legal', label: 'Jurídico', icon: <LegalIcon />, section: 'main' },
  { href: '/auctions', label: 'Leilões', icon: <AuctionsIcon />, section: 'main' },
  { href: '/real-estate', label: 'Imóveis', icon: <RealEstateIcon />, section: 'main' },
  { href: '/finance', label: 'Financeiro', icon: <FinanceIcon />, section: 'main' },
  { href: '/crm', label: 'CRM', icon: <CRMIcon />, section: 'main' },
  { href: '/knowledge', label: 'Conhecimento', icon: <KnowledgeIcon />, section: 'tools' },
  { href: '/workflow', label: 'Fluxos', icon: <WorkflowIcon />, section: 'tools' },
  { href: '/compliance', label: 'Conformidade', icon: <ComplianceIcon />, section: 'tools' },
  { href: '/intelligence', label: 'Inteligência', icon: <IntelligenceIcon />, section: 'tools' },
  { href: '/investor', label: 'Investidor', icon: <InvestorIcon />, section: 'admin', roles: ['INVESTOR'] },
  { href: '/admin', label: 'Administração', icon: <AdminIcon />, section: 'admin', roles: ['OWNER'] },
  { href: '/super-admin', label: 'Super Admin', icon: <SuperAdminIcon />, section: 'admin', roles: ['OWNER'] },
];

export function Sidebar({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { user, hasAnyRole } = useAuth();

  const visibleItems = navItems.filter((item) => {
    if (!item.roles || item.roles.length === 0) return true;
    if (!user?.role) return false;
    return hasAnyRole(item.roles);
  });

  const mainItems = visibleItems.filter(i => i.section === 'main');
  const toolItems = visibleItems.filter(i => i.section === 'tools');
  const adminItems = visibleItems.filter(i => i.section === 'admin');

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

  function NavLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
    const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
    return (
      <Link
        href={href}
        onClick={onClose}
        className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-200 ${
          isActive
            ? 'bg-white/10 text-white shadow-sm shadow-black/10'
            : 'text-white/50 hover:bg-white/[0.06] hover:text-white/80'
        }`}
      >
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 ${
          isActive
            ? 'bg-blue-500/20 text-blue-400'
            : 'bg-white/[0.04] text-white/30 group-hover:bg-white/[0.08] group-hover:text-white/60'
        }`}>
          {icon}
        </span>
        {label}
      </Link>
    );
  }

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-gradient-to-b from-[#0f1629] to-[#0c1220] transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-sm font-bold text-white shadow-lg shadow-blue-500/25">
            G
          </div>
          <Link href="/dashboard" className="text-[17px] font-bold tracking-tight text-white" onClick={onClose}>
            GEMS
          </Link>
          <span className="ml-auto rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-white/30">v2</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 pt-2 pb-4">
          {/* Main */}
          <div className="space-y-0.5">
            {mainItems.map(({ href, label, icon }) => (
              <NavLink key={href} href={href} label={label} icon={icon} />
            ))}
          </div>

          {/* Tools */}
          {toolItems.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-white/20">Ferramentas</p>
              <div className="space-y-0.5">
                {toolItems.map(({ href, label, icon }) => (
                  <NavLink key={href} href={href} label={label} icon={icon} />
                ))}
              </div>
            </div>
          )}

          {/* Admin */}
          {adminItems.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-white/20">Administração</p>
              <div className="space-y-0.5">
                {adminItems.map(({ href, label, icon }) => (
                  <NavLink key={href} href={href} label={label} icon={icon} />
                ))}
              </div>
            </div>
          )}
        </nav>

        {/* User */}
        {user && (
          <div className="mx-3 mb-4 rounded-xl bg-white/[0.04] p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/30 to-violet-500/30 text-xs font-bold text-blue-300 ring-1 ring-white/10">
                {userInitials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white/80">{userName}</p>
                <p className="truncate text-[11px] text-white/30">{user.role ?? 'Member'}</p>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

/* ── SVG Icons (16x16, stroke-based) ── */

function DashboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="6" height="6" rx="1" /><rect x="9" y="1" width="6" height="6" rx="1" /><rect x="1" y="9" width="6" height="6" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  );
}

function LegalIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1v14M3 4l5-3 5 3M2 4h12M4 4v5a4 4 0 004 4M12 4v5a4 4 0 01-4 4" />
    </svg>
  );
}

function AuctionsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2l4 4-8 8H2v-4l8-8zM8 4l4 4" />
    </svg>
  );
}

function RealEstateIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 14V7l6-5 6 5v7H2z" /><path d="M6 14v-4h4v4" />
    </svg>
  );
}

function FinanceIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1v14M5 4h5a2 2 0 010 4H6a2 2 0 000 4h5" />
    </svg>
  );
}

function CRMIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="5" r="3" /><path d="M1 14c0-3 2-5 5-5s5 2 5 5" /><path d="M11 5a3 3 0 010 6" /><path d="M13 14c0-2-1-4-3-5" />
    </svg>
  );
}

function KnowledgeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 2h4l2 2 2-2h4v11H9l-1 1-1-1H2V2z" />
    </svg>
  );
}

function WorkflowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="3" cy="8" r="2" /><circle cx="13" cy="4" r="2" /><circle cx="13" cy="12" r="2" /><path d="M5 7l6-2M5 9l6 2" />
    </svg>
  );
}

function ComplianceIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1l6 3v4c0 3.5-2.5 6-6 7-3.5-1-6-3.5-6-7V4l6-3z" /><path d="M5.5 8l2 2 3.5-4" />
    </svg>
  );
}

function InvestorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12l4-8 4 8" /><path d="M5.5 9h5" />
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2.5" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M13 3l-1.5 1.5M4.5 11.5L3 13" />
    </svg>
  );
}

function IntelligenceIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="6" r="4" /><path d="M5 12h6M7 10v4M9 10v4" />
    </svg>
  );
}

function SuperAdminIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4l2-4z" />
    </svg>
  );
}
