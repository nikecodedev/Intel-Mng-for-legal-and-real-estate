'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function MfaPage() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) {
      setError('O código deve ter 6 dígitos.');
      return;
    }
    setLoading(true); setError(''); setSuccess('');
    try {
      await api.post('/auth/mfa/verify', { code });
      setSuccess('Código verificado com sucesso.');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Código inválido ou MFA ainda não implementado no servidor.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSetup() {
    setLoading(true); setError(''); setSuccess('');
    try {
      const res = await api.post('/auth/mfa/setup', {});
      setSuccess('Configuração MFA iniciada. Escaneie o QR code no seu aplicativo autenticador.');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Configuração MFA ainda não disponível no servidor.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-xl font-bold text-white shadow-lg shadow-blue-500/25">
            G
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Autenticação de Dois Fatores</h1>
          <p className="mt-2 text-sm text-gray-500">
            Autenticação de dois fatores obrigatória para perfis Owner e Admin.
          </p>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>}
        {success && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded p-3">{success}</p>}

        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-5">
          {/* Setup */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-700">Configurar MFA</h3>
            <p className="text-xs text-gray-500">
              Clique abaixo para gerar um código QR e vincular seu aplicativo autenticador (Google Authenticator, Authy, etc.).
            </p>
            <button
              onClick={handleSetup}
              disabled={loading}
              className="rounded bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-900 disabled:opacity-50"
            >
              {loading ? 'Configurando...' : 'Configurar Autenticador'}
            </button>
          </div>

          <hr className="border-gray-200" />

          {/* Verify */}
          <form onSubmit={handleVerify} className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700">Verificar Código TOTP</h3>
            <p className="text-xs text-gray-500">
              Insira o código de 6 dígitos gerado pelo seu aplicativo autenticador.
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-full rounded border border-gray-300 px-4 py-3 text-center text-2xl tracking-[0.5em] font-mono"
              autoComplete="one-time-code"
            />
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full rounded bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Verificando...' : 'Verificar'}
            </button>
          </form>
        </div>

        <div className="text-center">
          <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">Voltar ao painel</Link>
        </div>
      </div>
    </div>
  );
}
