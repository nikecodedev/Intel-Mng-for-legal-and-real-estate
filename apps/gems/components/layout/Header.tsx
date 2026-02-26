'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

function formatUserDisplay(user: { email: string; first_name?: string | null; last_name?: string | null }): string {
  const first = user.first_name?.trim();
  const last = user.last_name?.trim();
  if (first || last) return [first, last].filter(Boolean).join(' ').trim();
  return user.email;
}

function formatTenantDisplay(tenantName: string | null | undefined, tenantId: string): string {
  if (tenantName?.trim()) return tenantName.trim();
  if (tenantId) return `Tenant ${tenantId.slice(0, 8)}`;
  return 'Tenant';
}

export function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <header className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-4 shrink-0">
      <div className="min-w-0" />
      <div className="flex items-center gap-4 min-w-0">
        {user && (
          <>
            <div className="hidden sm:block text-sm text-gray-500 truncate max-w-[140px]" title={formatTenantDisplay(user.tenant_name, user.tenant_id)}>
              {formatTenantDisplay(user.tenant_name, user.tenant_id)}
            </div>
            <span className="hidden sm:block w-px h-4 bg-gray-200 shrink-0" aria-hidden />
            <div className="text-sm text-gray-700 truncate max-w-[180px]" title={user.email}>
              {formatUserDisplay(user)}
            </div>
          </>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="shrink-0 text-sm text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100"
        >
          Log out
        </button>
      </div>
    </header>
  );
}
