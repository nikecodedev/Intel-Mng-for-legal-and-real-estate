'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getApiErrorMessage } from '@/lib/api';

interface PasswordRule {
  label: string;
  test: (p: string) => boolean;
}

const PASSWORD_RULES: PasswordRule[] = [
  { label: 'Mínimo 12 caracteres',          test: p => p.length >= 12 },
  { label: 'Uma letra maiúscula',            test: p => /[A-Z]/.test(p) },
  { label: 'Uma letra minúscula',            test: p => /[a-z]/.test(p) },
  { label: 'Um número',                      test: p => /[0-9]/.test(p) },
  { label: 'Um símbolo especial (!@#$%&*)', test: p => /[^A-Za-z0-9]/.test(p) },
];

function validatePassword(pwd: string): string | null {
  for (const rule of PASSWORD_RULES) {
    if (!rule.test(pwd)) return rule.label;
  }
  return null;
}

interface RegisterFormProps {
  onSuccess?: () => void;
}

export function RegisterForm({ onSuccess }: RegisterFormProps) {
  const { register } = useAuth();
  const [subdomain, setSubdomain] = useState('');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pwdError = passwordTouched ? validatePassword(password) : null;
  const allRulesPassed = PASSWORD_RULES.every(r => r.test(password));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordTouched(true);
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await register(email, password, firstName.trim() || undefined, lastName.trim() || undefined);
      onSuccess?.();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'block w-full rounded-lg bg-white/5 border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Subdomínio */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">
          Subdomínio <span className="text-slate-500 font-normal text-xs">(opcional)</span>
        </label>
        <input
          type="text"
          autoComplete="organization"
          value={subdomain}
          onChange={e => setSubdomain(e.target.value)}
          className={inputCls}
          placeholder="ex: gruporacional"
        />
        <p className="mt-1 text-xs text-slate-500">Identificador da sua empresa na plataforma.</p>
      </div>

      {/* E-mail */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">E-mail</label>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className={inputCls}
          placeholder="voce@empresa.com"
        />
      </div>

      {/* Nome e Sobrenome */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Nome</label>
          <input
            type="text"
            autoComplete="given-name"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            className={inputCls}
            placeholder="João"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Sobrenome</label>
          <input
            type="text"
            autoComplete="family-name"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            className={inputCls}
            placeholder="Silva"
          />
        </div>
      </div>

      {/* Senha com validação inline */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">Senha</label>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={e => { setPassword(e.target.value); setPasswordTouched(true); }}
          onBlur={() => setPasswordTouched(true)}
          required
          className={`${inputCls} ${
            passwordTouched
              ? allRulesPassed
                ? 'border-green-500/60 focus:border-green-500'
                : 'border-red-500/40 focus:border-red-500'
              : ''
          }`}
          placeholder="••••••••••••"
        />

        {/* Checklist inline — visível ao digitar */}
        {passwordTouched && password.length > 0 && (
          <ul className="mt-2 space-y-1">
            {PASSWORD_RULES.map(rule => {
              const passed = rule.test(password);
              return (
                <li key={rule.label} className={`flex items-center gap-1.5 text-xs transition-colors ${passed ? 'text-green-400' : 'text-slate-400'}`}>
                  <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[10px] font-bold ${passed ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-slate-500'}`}>
                    {passed ? '✓' : '·'}
                  </span>
                  {rule.label}
                </li>
              );
            })}
          </ul>
        )}
        {!passwordTouched && (
          <p className="mt-1.5 text-xs text-slate-500">
            Mínimo 12 caracteres, maiúscula, minúscula, número e símbolo.
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Criando conta...
          </>
        ) : (
          'Criar conta'
        )}
      </button>
    </form>
  );
}
