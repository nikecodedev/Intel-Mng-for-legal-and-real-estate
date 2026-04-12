'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface SetupData {
  secret: string;
  qr_data_uri: string;
  otpauth_url: string;
}

export default function MfaPage() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [mfaEnabled, setMfaEnabled] = useState(false);

  async function handleSetup() {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.post<{ success: boolean } & SetupData>('/auth/mfa/setup', {});
      const d = res.data;
      setSetupData({
        secret: d.secret,
        qr_data_uri: d.qr_data_uri,
        otpauth_url: d.otpauth_url,
      });
      setSuccess('QR code gerado. Escaneie com seu aplicativo autenticador (Google Authenticator, Authy, etc.) e insira o código abaixo para confirmar.');
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.message || 'Falha ao configurar MFA.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) {
      setError('O código deve ter 6 dígitos.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await api.post('/auth/mfa/verify', { code });
      setMfaEnabled(true);
      setSuccess('MFA ativado com sucesso! Sua conta agora está protegida por autenticação de dois fatores.');
      setCode('');
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.message || 'Código inválido ou expirado.');
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
            MFA obrigatório para perfis Owner e Admin — TOTP via Google Authenticator ou Authy.
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>
        )}
        {success && (
          <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded p-3">{success}</p>
        )}

        {mfaEnabled ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center space-y-3">
            <div className="text-3xl">✓</div>
            <p className="text-sm font-medium text-green-800">MFA Ativado com Sucesso</p>
            <p className="text-xs text-green-700">
              Sua conta está protegida. A partir do próximo login, você precisará inserir o código do seu aplicativo autenticador.
            </p>
            <Link
              href="/dashboard"
              className="inline-block rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              Ir ao Painel
            </Link>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-5">
            {/* Step 1: Setup */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-700">Passo 1 — Configurar Autenticador</h3>
              <p className="text-xs text-gray-500">
                Gere um QR code para vincular seu aplicativo autenticador.
              </p>
              <button
                onClick={handleSetup}
                disabled={loading}
                className="rounded bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-900 disabled:opacity-50"
              >
                {loading && !setupData ? 'Gerando...' : 'Gerar QR Code'}
              </button>

              {/* Real QR code rendered as data URI image */}
              {setupData && (
                <div className="mt-3 space-y-3">
                  <div className="flex justify-center rounded-lg border border-gray-200 bg-white p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={setupData.qr_data_uri}
                      alt="QR Code MFA"
                      width={200}
                      height={200}
                      className="block"
                    />
                  </div>
                  <div className="rounded border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs text-gray-500 mb-1">Ou insira a chave manualmente no aplicativo:</p>
                    <code className="break-all text-xs font-mono text-gray-800 select-all">
                      {setupData.secret}
                    </code>
                  </div>
                </div>
              )}
            </div>

            <hr className="border-gray-200" />

            {/* Step 2: Verify */}
            <form onSubmit={handleVerify} className="space-y-4">
              <h3 className="text-sm font-medium text-gray-700">Passo 2 — Verificar Código TOTP</h3>
              <p className="text-xs text-gray-500">
                Insira o código de 6 dígitos do seu aplicativo autenticador para ativar o MFA.
              </p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full rounded border border-gray-300 px-4 py-3 text-center text-2xl tracking-[0.5em] font-mono"
                autoComplete="one-time-code"
              />
              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full rounded bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Verificando...' : 'Verificar e Ativar MFA'}
              </button>
            </form>
          </div>
        )}

        <div className="text-center">
          <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
            Voltar ao painel
          </Link>
        </div>
      </div>
    </div>
  );
}
