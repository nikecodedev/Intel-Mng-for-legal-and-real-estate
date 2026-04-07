'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BlockLoader } from '@/components/ui';
import { api } from '@/lib/api';

export default function ProfilePage() {
  const queryClient = useQueryClient();

  const { data: userData, isLoading, error } = useQuery(
    'auth-me',
    async () => {
      const res = await api.get('/auth/me');
      const d = res.data?.data ?? res.data;
      return d?.user ?? d;
    },
    { staleTime: 60 * 1000 }
  );

  // Edit profile state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (userData) {
      setFirstName(userData.first_name ?? '');
      setLastName(userData.last_name ?? '');
    }
  }, [userData]);

  async function saveProfile() {
    setProfileLoading(true);
    setProfileMsg(null);
    try {
      await api.put('/auth/me', { first_name: firstName, last_name: lastName });
      setProfileMsg({ type: 'success', text: 'Perfil atualizado com sucesso.' });
      queryClient.invalidateQueries('auth-me');
    } catch (err: any) {
      setProfileMsg({ type: 'error', text: err?.response?.data?.message || 'Falha ao atualizar perfil.' });
    } finally {
      setProfileLoading(false);
    }
  }

  async function changePassword() {
    setPwMsg(null);
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: 'error', text: 'A nova senha e a confirmacao nao coincidem.' });
      return;
    }
    setPwLoading(true);
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPwMsg({ type: 'success', text: 'Senha alterada com sucesso.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPwMsg({ type: 'error', text: err?.response?.data?.message || 'Falha ao alterar senha.' });
    } finally {
      setPwLoading(false);
    }
  }

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
          {/* User info (read-only) */}
          <section className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Informacoes do Usuario</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <dt className="text-gray-600">Nome</dt>
              <dd className="font-medium text-gray-900">
                {[userData.first_name, userData.last_name].filter(Boolean).join(' ') || '\u2014'}
              </dd>
              <dt className="text-gray-600">E-mail</dt>
              <dd className="font-medium text-gray-900">{userData.email ?? '\u2014'}</dd>
              <dt className="text-gray-600">Papel</dt>
              <dd className="font-medium text-gray-900">{userData.role ?? '\u2014'}</dd>
              <dt className="text-gray-600">Inquilino</dt>
              <dd className="font-medium text-gray-900">
                {userData.tenant_name ?? userData.tenant_id ?? '\u2014'}
              </dd>
              {userData.id && (
                <>
                  <dt className="text-gray-600">ID do Usuario</dt>
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

          {/* Edit profile form */}
          <section className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Editar Perfil</h2>
            {profileMsg && (
              <div className={`mb-4 rounded-lg border p-3 text-sm ${profileMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                {profileMsg.text}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Nome</label>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Seu nome"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Sobrenome</label>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Seu sobrenome"
                />
              </div>
            </div>
            <button
              onClick={saveProfile}
              disabled={profileLoading}
              className="rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {profileLoading ? 'Salvando...' : 'Salvar'}
            </button>
          </section>

          {/* Change password */}
          <section className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Alterar Senha</h2>
            {pwMsg && (
              <div className={`mb-4 rounded-lg border p-3 text-sm ${pwMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                {pwMsg.text}
              </div>
            )}
            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Senha atual</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Digite sua senha atual"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Nova senha</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Minimo 8 caracteres, 1 maiuscula, 1 minuscula, 1 numero"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Confirmar nova senha</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Repita a nova senha"
                />
              </div>
            </div>
            <button
              onClick={changePassword}
              disabled={pwLoading || !currentPassword || !newPassword || !confirmPassword}
              className="rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {pwLoading ? 'Alterando...' : 'Alterar Senha'}
            </button>
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
