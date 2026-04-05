'use client';

import { useQuery } from 'react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BlockLoader } from '@/components/ui';
import { api } from '@/lib/api';

export default function ProfilePage() {
  const { data: userData, isLoading, error } = useQuery(
    'auth-me',
    async () => {
      const res = await api.get('/auth/me');
      return res.data?.data ?? res.data;
    },
    { staleTime: 60 * 1000 }
  );

  return (
    <DashboardLayout title="Perfil">
      {isLoading && <BlockLoader message="Carregando perfil..." />}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          Falha ao carregar dados do perfil.
        </div>
      )}

      {userData && (
        <div className="space-y-6">
          <section className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Informações do Usuário</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <dt className="text-gray-600">Nome</dt>
              <dd className="font-medium text-gray-900">
                {[userData.first_name, userData.last_name].filter(Boolean).join(' ') || '—'}
              </dd>
              <dt className="text-gray-600">E-mail</dt>
              <dd className="font-medium text-gray-900">{userData.email ?? '—'}</dd>
              <dt className="text-gray-600">Papel</dt>
              <dd className="font-medium text-gray-900">{userData.role ?? '—'}</dd>
              <dt className="text-gray-600">Inquilino</dt>
              <dd className="font-medium text-gray-900">
                {userData.tenant_name ?? userData.tenant_id ?? '—'}
              </dd>
              {userData.id && (
                <>
                  <dt className="text-gray-600">ID do Usuário</dt>
                  <dd className="font-mono text-xs text-gray-500">{userData.id}</dd>
                </>
              )}
              {userData.tenant_id && (
                <>
                  <dt className="text-gray-600">ID do Inquilino</dt>
                  <dd className="font-mono text-xs text-gray-500">{userData.tenant_id}</dd>
                </>
              )}
              {userData.created_at && (
                <>
                  <dt className="text-gray-600">Conta criada em</dt>
                  <dd className="font-medium text-gray-900">
                    {new Date(userData.created_at).toLocaleDateString('pt-BR')}
                  </dd>
                </>
              )}
            </dl>
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
