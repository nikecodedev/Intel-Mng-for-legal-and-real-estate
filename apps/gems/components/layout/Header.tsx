'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from 'react-query';
import { api } from '@/lib/api';

function formatUserDisplay(user: { email: string; first_name?: string | null; last_name?: string | null }): string {
  const first = user.first_name?.trim();
  const last = user.last_name?.trim();
  if (first || last) return [first, last].filter(Boolean).join(' ').trim();
  return user.email;
}

function formatTenantDisplay(tenantName: string | null | undefined, tenantId: string): string {
  if (tenantName?.trim()) return tenantName.trim();
  if (tenantId) return `Inquilino ${tenantId.slice(0, 8)}`;
  return 'Inquilino';
}

function getPageTitle(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return 'Início';
  const titles: Record<string, string> = {
    dashboard: 'Painel',
    legal: 'Jurídico',
    auctions: 'Leilões',
    'real-estate': 'Imóveis',
    finance: 'Financeiro',
    crm: 'CRM',
    workflow: 'Fluxo de Trabalho',
    compliance: 'Conformidade',
    intelligence: 'Inteligência',
    profile: 'Perfil',
    investor: 'Investidor',
    admin: 'Administração',
    'super-admin': 'Super Admin',
  };
  return titles[segments[0]] ?? segments[0].charAt(0).toUpperCase() + segments[0].slice(1);
}

export function Header({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = () => {
    // Block logout if an upload is in progress
    if (typeof window !== 'undefined' && (window as unknown as Record<string, boolean>).__gemsUploading) {
      alert('Um upload está em andamento. Aguarde a conclusão antes de sair.');
      return;
    }
    logout();
    router.push('/login');
  };

  // Fetch avatar from /auth/me
  const { data: meData } = useQuery('header-auth-me', async () => {
    const res = await api.get('/auth/me');
    const d = res.data?.data ?? res.data;
    return d?.user ?? d;
  }, { staleTime: 5 * 60 * 1000, retry: false, enabled: !!user });

  const avatarUrl = meData?.avatar_url ?? null;

  const userInitials = (() => {
    if (!user) return '?';
    const first = user.first_name?.trim()?.[0] ?? '';
    const last = user.last_name?.trim()?.[0] ?? '';
    if (first || last) return (first + last).toUpperCase();
    return user.email[0].toUpperCase();
  })();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200/80 bg-white/80 px-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile menu button */}
        <button
          type="button"
          onClick={onMenuToggle}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 lg:hidden"
          aria-label="Alternar menu"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-gray-900">
            {getPageTitle(pathname)}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-3 min-w-0">
        {user && (
          <>
            <div className="hidden items-center gap-2 sm:flex">
              <span className="text-xs font-medium text-gray-400 bg-gray-100 rounded-full px-2.5 py-1" title={formatTenantDisplay(user.tenant_name, user.tenant_id)}>
                {formatTenantDisplay(user.tenant_name, user.tenant_id)}
              </span>
            </div>
            <Link href="/profile" className="hidden items-center gap-2.5 sm:flex hover:opacity-80 transition-opacity">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="h-8 w-8 rounded-full object-cover ring-1 ring-gray-200" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
                  {userInitials}
                </div>
              )}
              <span className="text-sm font-medium text-gray-700 truncate max-w-[150px]" title={user.email}>
                {formatUserDisplay(user)}
              </span>
            </Link>
          </>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          Sair
        </button>
      </div>
    </header>
  );
}
