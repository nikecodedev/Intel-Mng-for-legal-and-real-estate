'use client';

import { useQuery } from 'react-query';
import Link from 'next/link';
import { api } from '@/lib/api';

const NAV_CARDS = [
  { href: '/admin/users',      icon: '👥', label: 'Utilizadores',      desc: 'Criar e gerir contas' },
  { href: '/admin/investors',  icon: '💼', label: 'Investidores',       desc: 'Perfis KYC e preferências' },
  { href: '/admin/audit',      icon: '🔒', label: 'Audit Log',          desc: 'Trilha de integridade' },
  { href: '/admin/overrides',  icon: '⚠️', label: 'Overrides',          desc: 'Eventos com OTP' },
  { href: '/admin/reports',    icon: '📊', label: 'Relatórios',         desc: 'Exportar dados' },
  { href: '/super-admin',      icon: '🏢', label: 'Super Admin',        desc: 'Tenants e quotas' },
];

export default function AdminPage() {
  const usersQ = useQuery('admin-users-count', async () => {
    const res = await api.get('/auth/users', { params: { limit: 200 } });
    return res.data?.users ?? res.data?.data ?? [];
  }, { staleTime: 60_000, retry: false });

  const overridesQ = useQuery('admin-overrides-recent', async () => {
    const res = await api.get('/admin/overrides');
    return res.data?.data?.events ?? [];
  }, { staleTime: 30_000, retry: false });

  const auditQ = useQuery('admin-audit-violations', async () => {
    const res = await api.get('/audit-integrity/violations').catch(() => ({ data: { violations: [] } }));
    return res.data?.violations ?? [];
  }, { staleTime: 60_000, retry: false });

  const users: any[]     = usersQ.data ?? [];
  const overrides: any[] = overridesQ.data ?? [];
  const violations: any[] = auditQ.data ?? [];

  const activeUsers   = users.filter((u: any) => u.is_active).length;
  const recentOverrides = overrides.slice(0, 5);

  const statCards = [
    { label: 'Utilizadores',     value: users.length,    sub: `${activeUsers} ativos`,        color: '#3B82F6' },
    { label: 'Overrides',        value: overrides.length, sub: 'total registado',             color: '#F59E0B' },
    { label: 'Violações Audit',  value: violations.length, sub: violations.length > 0 ? '⚠️ atenção' : '✅ ok', color: violations.length > 0 ? '#EF4444' : '#10B981' },
    { label: 'Perfis',           value: [...new Set(users.map((u: any) => u.role))].length, sub: 'papéis distintos', color: '#8B5CF6' },
  ];

  return (
    <div className="space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Administração</h1>
          <p className="text-sm text-gray-500 mt-1">Gestão de utilizadores, auditoria e configurações do tenant.</p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {statCards.map((card) => (
            <div key={card.label} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium text-gray-500 mb-1">{card.label}</p>
              <p className="text-3xl font-bold text-gray-900">{usersQ.isLoading ? '…' : card.value}</p>
              <p className="text-xs mt-1" style={{ color: card.color }}>{card.sub}</p>
            </div>
          ))}
        </div>

        {/* Nav Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {NAV_CARDS.map((c) => (
            <Link key={c.href} href={c.href}
              className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm hover:border-blue-300 hover:shadow-md transition-all flex items-start gap-3">
              <span className="text-2xl">{c.icon}</span>
              <div>
                <p className="font-semibold text-gray-900 text-sm">{c.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{c.desc}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Recent Overrides */}
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-800">Overrides Recentes</h2>
            <Link href="/admin/overrides" className="text-xs text-blue-600 hover:underline">Ver todos</Link>
          </div>
          {overridesQ.isLoading ? (
            <p className="px-6 py-4 text-sm text-gray-400">Carregando...</p>
          ) : recentOverrides.length === 0 ? (
            <p className="px-6 py-4 text-sm text-gray-400">Nenhum override registado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Utilizador</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Entidade</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">OTP</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentOverrides.map((ev: any) => (
                    <tr key={ev.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-900">{ev.user_email}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">{ev.override_type}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{ev.target_entity}</td>
                      <td className="px-4 py-3">
                        {ev.otp_verified
                          ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">✓ Sim</span>
                          : <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">✗ Não</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {ev.created_at ? new Date(ev.created_at).toLocaleDateString('pt-BR') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Audit Violations Alert */}
        {violations.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
            <span className="text-red-500 text-xl">⚠️</span>
            <div>
              <p className="text-sm font-semibold text-red-800">{violations.length} violação{violations.length !== 1 ? 'ões' : ''} de integridade detectada{violations.length !== 1 ? 's' : ''}</p>
              <p className="text-xs text-red-600 mt-0.5">Aceda ao <Link href="/admin/audit" className="underline font-medium">Audit Log</Link> para verificar.</p>
            </div>
          </div>
        )}

    </div>
  );
}
