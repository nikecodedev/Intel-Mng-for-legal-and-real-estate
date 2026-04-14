'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';

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

function validatePassword(pwd: string): string | null {
  for (const rule of PASSWORD_RULES) {
    if (!rule.test(pwd)) return rule.label;
  }
  return null;
}

export default function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwTouched, setPwTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (typeof window !== 'undefined' && !token) {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (t) setToken(t);
  }

  const allRulesPassed = PASSWORD_RULES.every(r => r.test(password));
  const confirmMismatch = confirm.length > 0 && password !== confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwTouched(true);
    if (password !== confirm) { setError('As senhas não conferem.'); return; }
    const pwErr = validatePassword(password);
    if (pwErr) { setError(pwErr); return; }
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { token, new_password: password });
      setSuccess(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Falha ao redefinir a senha.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md rounded-lg border border-green-200 bg-white p-8 shadow-sm text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-4">Senha Redefinida</h1>
          <p className="text-sm text-green-700 mb-4">Sua senha foi redefinida com sucesso.</p>
          <Link href="/login" className="text-sm text-blue-600 hover:underline">Ir para o login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900 mb-6">Redefinir Senha</h1>
        {error && <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="hidden" value={token} />

          {/* Nova Senha */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nova Senha <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPwTouched(true); }}
              onBlur={() => setPwTouched(true)}
              required
              className={`w-full rounded border px-3 py-2 text-sm focus:ring-1 outline-none transition-colors ${
                pwTouched
                  ? allRulesPassed
                    ? 'border-green-500 focus:border-green-500 focus:ring-green-500'
                    : 'border-red-400 focus:border-red-500 focus:ring-red-500'
                  : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
              }`}
              placeholder="Mínimo 12 caracteres"
            />
            {pwTouched && password.length > 0 && (
              <ul className="mt-2 space-y-1">
                {PASSWORD_RULES.map(rule => {
                  const passed = rule.test(password);
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
            {!pwTouched && (
              <p className="mt-1 text-xs text-gray-500">Mínimo 12 caracteres, maiúscula, minúscula, número e símbolo.</p>
            )}
          </div>

          {/* Confirmar Senha */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirmar Nova Senha <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className={`w-full rounded border px-3 py-2 text-sm focus:ring-1 outline-none transition-colors ${
                confirmMismatch
                  ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
                  : confirm.length > 0 && !confirmMismatch
                    ? 'border-green-500 focus:border-green-500 focus:ring-green-500'
                    : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
              }`}
              placeholder="Repita a nova senha"
            />
            {confirmMismatch && (
              <p className="mt-1 text-xs text-red-600">As senhas não conferem.</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Redefinindo...' : 'Redefinir Senha'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-500">
          <Link href="/login" className="text-blue-600 hover:underline">Voltar ao login</Link>
        </p>
      </div>
    </div>
  );
}
