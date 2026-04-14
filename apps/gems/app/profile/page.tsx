'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BlockLoader } from '@/components/ui';
import { api } from '@/lib/api';

interface PasswordRule {
  label: string;
  test: (p: string) => boolean;
}

const PASSWORD_RULES: PasswordRule[] = [
  { label: 'Mínimo 12 caracteres',           test: p => p.length >= 12 },
  { label: 'Uma letra maiúscula',             test: p => /[A-Z]/.test(p) },
  { label: 'Uma letra minúscula',             test: p => /[a-z]/.test(p) },
  { label: 'Um número',                       test: p => /[0-9]/.test(p) },
  { label: 'Um símbolo especial (!@#$%&*)',  test: p => /[^A-Za-z0-9]/.test(p) },
];

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

  // Avatar state
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 375000) {
      setAvatarMsg({ type: 'error', text: 'Imagem muito grande. Máximo 375KB.' });
      return;
    }
    setAvatarLoading(true);
    setAvatarMsg(null);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await api.put('/auth/me', { avatar_base64: base64 });
      setAvatarMsg({ type: 'success', text: 'Foto atualizada.' });
      queryClient.invalidateQueries('auth-me');
    } catch (err: any) {
      setAvatarMsg({ type: 'error', text: err?.response?.data?.message || 'Falha ao enviar foto.' });
    } finally {
      setAvatarLoading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  }

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newPwTouched, setNewPwTouched] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const allRulesPassed = PASSWORD_RULES.every(r => r.test(newPassword));
  const confirmMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

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
    setNewPwTouched(true);
    setPwMsg(null);
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: 'error', text: 'A nova senha e a confirmação não coincidem.' });
      return;
    }
    const pwErr = PASSWORD_RULES.find(r => !r.test(newPassword));
    if (pwErr) {
      setPwMsg({ type: 'error', text: pwErr.label });
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
      setNewPwTouched(false);
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
          {/* Avatar + Name header */}
          <section className="rounded-lg border border-gray-200 bg-white p-6 flex items-center gap-5">
            <div className="relative group">
              {userData.avatar_url ? (
                <img src={userData.avatar_url} alt="Avatar" className="h-20 w-20 rounded-full object-cover shadow-lg ring-2 ring-white" />
              ) : (
                <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-2xl font-bold text-white shadow-lg">
                  {(userData.first_name?.[0] ?? '').toUpperCase()}{(userData.last_name?.[0] ?? '').toUpperCase()}
                </div>
              )}
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarLoading}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 group-hover:bg-black/40 transition-colors cursor-pointer"
                title="Alterar foto"
              >
                <span className="text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  {avatarLoading ? '...' : 'Alterar'}
                </span>
              </button>
              <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {[userData.first_name, userData.last_name].filter(Boolean).join(' ') || 'Sem nome'}
              </h2>
              <p className="text-sm text-gray-500">{userData.email ?? ''}</p>
              <span className="mt-1 inline-block rounded-full bg-blue-100 px-3 py-0.5 text-xs font-medium text-blue-700">
                {userData.role ?? 'Papel desconhecido'}
              </span>
              {avatarMsg && (
                <p className={`mt-1 text-xs ${avatarMsg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>{avatarMsg.text}</p>
              )}
            </div>
          </section>

          {/* User info (read-only) */}
          <section className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Informações do Usuário</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <dt className="text-gray-600">Nome</dt>
              <dd className="font-medium text-gray-900">
                {[userData.first_name, userData.last_name].filter(Boolean).join(' ') || '—'}
              </dd>
              <dt className="text-gray-600">E-mail</dt>
              <dd className="font-medium text-gray-900">{userData.email ?? '—'}</dd>
              <dt className="text-gray-600">Perfil</dt>
              <dd className="font-medium text-gray-900">{userData.role ?? '—'}</dd>
              <dt className="text-gray-600">Empresa</dt>
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
                  <dt className="text-gray-600">ID da Empresa</dt>
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
                <label className="block text-sm text-gray-600 mb-1">
                  Senha atual <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Digite sua senha atual"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Nova senha <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setNewPwTouched(true); }}
                  onBlur={() => setNewPwTouched(true)}
                  className={`w-full rounded border px-3 py-2 text-sm focus:ring-1 outline-none transition-colors ${
                    newPwTouched
                      ? allRulesPassed
                        ? 'border-green-500 focus:border-green-500 focus:ring-green-500'
                        : 'border-red-400 focus:border-red-500 focus:ring-red-500'
                      : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                  }`}
                  placeholder="Mínimo 12 caracteres"
                />
                {newPwTouched && newPassword.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {PASSWORD_RULES.map(rule => {
                      const passed = rule.test(newPassword);
                      return (
                        <li key={rule.label} className={`flex items-center gap-1.5 text-xs ${passed ? 'text-green-600' : 'text-gray-400'}`}>
                          <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[10px] font-bold ${passed ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                            {passed ? '✓' : '·'}
                          </span>
                          {rule.label}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {!newPwTouched && (
                  <p className="mt-1 text-xs text-gray-500">Mínimo 12 caracteres, maiúscula, minúscula, número e símbolo.</p>
                )}
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Confirmar nova senha <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full rounded border px-3 py-2 text-sm focus:ring-1 outline-none transition-colors ${
                    confirmMismatch
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
                      : confirmPassword.length > 0 && !confirmMismatch
                        ? 'border-green-500 focus:border-green-500 focus:ring-green-500'
                        : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                  }`}
                  placeholder="Repita a nova senha"
                />
                {confirmMismatch && (
                  <p className="mt-1 text-xs text-red-600">As senhas não conferem.</p>
                )}
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
