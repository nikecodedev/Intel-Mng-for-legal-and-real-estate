'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface MfaStatus {
  mfa_configured: boolean;
  mfa_enabled: boolean;
  last_verified: string | null;
}

export default function MfaPage() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [qrDataUri, setQrDataUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  useEffect(() => {
    api.get('/auth/mfa/status')
      .then((res: any) => setStatus(res.data?.data ?? null))
      .catch(() => {});
  }, []);

  async function handleSetup() {
    setLoading(true); setError(''); setSuccess('');
    try {
      const res = await api.post('/auth/mfa/setup', {});
      const d = (res as any).data;
      setQrDataUri(d.qr_data_uri);
      setSecret(d.secret);
      setSuccess('QR code gerado. Escaneie com Google Authenticator, Authy ou similar.');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erro ao configurar MFA.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) { setError('O código deve ter 6 dígitos.'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      await api.post('/auth/mfa/verify', { code });
      setSuccess('MFA verificado e ativado com sucesso!');
      setStatus({ mfa_configured: true, mfa_enabled: true, last_verified: new Date().toISOString() });
      setCode('');
      setQrDataUri(null);
      setSecret(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Código inválido ou expirado.');
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
            Obrigatória para perfis Owner e Admin.
          </p>
        </div>

        {status && (
          <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
            status.mfa_enabled ? 'border-green-200 bg-green-50 text-green-700' : 'border-yellow-200 bg-yellow-50 text-yellow-700'
          }`}>
            <span>{status.mfa_enabled ? '🔒' : '⚠️'}</span>
            <span>
              {status.mfa_enabled
                ? `MFA ativo — última verificação: ${status.last_verified ? new Date(status.last_verified).toLocaleString('pt-BR') : 'nunca'}`
                : 'MFA ainda não configurado.'}
            </span>
          </div>
        )}

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>}
        {success && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded p-3">{success}</p>}

        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-5">
          {!status?.mfa_enabled && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">Passo 1 — Configurar Autenticador</h3>
              <p className="text-xs text-gray-500">Gere um QR code TOTP e escaneie com Google Authenticator, Authy ou Microsoft Authenticator.</p>
              <button
                onClick={handleSetup}
                disabled={loading}
                className="rounded bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-900 disabled:opacity-50"
              >
                {loading && !qrDataUri ? 'Gerando...' : 'Gerar QR Code'}
              </button>

              {qrDataUri && (
                <div className="flex flex-col items-center gap-3 pt-2">
                  <div className="rounded-xl border-2 border-gray-100 bg-white p-3 shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrDataUri} alt="QR Code MFA" width={200} height={200} className="block" />
                  </div>
                  {secret && (
                    <div className="w-full rounded border border-gray-200 bg-gray-50 px-3 py-2">
                      <p className="text-xs text-gray-500 mb-1">Chave manual:</p>
                      <code className="text-xs font-mono text-gray-800 break-all">{secret}</code>
                    </div>
                  )}
                </div>
              )}
              <hr className="border-gray-200" />
            </div>
          )}

          <form onSubmit={handleVerify} className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">
              {status?.mfa_enabled ? 'Verificar Código TOTP' : 'Passo 2 — Verificar Código'}
            </h3>
            <p className="text-xs text-gray-500">
              {status?.mfa_enabled
                ? 'Insira o código de 6 dígitos do seu autenticador.'
                : 'Após escanear, insira o código de 6 dígitos gerado pelo aplicativo.'}
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
              {loading ? 'Verificando...' : status?.mfa_enabled ? 'Verificar' : 'Confirmar e Ativar MFA'}
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
