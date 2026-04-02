'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { LoginForm } from '@/components/forms/LoginForm';

/**
 * Sanitize redirect URL to prevent open redirect attacks.
 * Only allow relative paths starting with a single slash.
 * Rejects absolute URLs, protocol-relative URLs (//), and data/javascript URIs.
 */
function sanitizeRedirect(url: string): string {
  const fallback = '/dashboard';
  if (!url || typeof url !== 'string') return fallback;

  // Strip leading/trailing whitespace
  const trimmed = url.trim();

  // Must start with exactly one slash (reject "//evil.com", "\/evil.com")
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return fallback;
  }

  // Reject any URL that contains a protocol or authority indicator
  try {
    const parsed = new URL(trimmed, 'http://localhost');
    if (parsed.origin !== 'http://localhost') return fallback;
    if (parsed.protocol !== 'http:') return fallback;
  } catch {
    return fallback;
  }

  return trimmed;
}

function LoginContent() {
  const { isAuthenticated, isInitialized } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get('redirect') ?? '/dashboard';
  const redirect = sanitizeRedirect(rawRedirect);

  useEffect(() => {
    if (isInitialized && isAuthenticated) {
      router.replace(redirect);
    }
  }, [isInitialized, isAuthenticated, router, redirect]);

  if (!isInitialized) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          <p className="text-sm text-white/60">Carregando...</p>
        </div>
      </main>
    );
  }

  const handleSuccess = () => {
    router.push(redirect);
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 relative overflow-hidden">
      {/* Subtle background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo and branding */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/30">
            <span className="text-2xl font-bold text-white">G</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Bem-vindo de volta</h1>
          <p className="mt-1 text-sm text-slate-400">Entre na sua conta GEMS</p>
        </div>

        {/* Login form card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          <LoginForm onSuccess={handleSuccess} />
        </div>

        <p className="mt-6 text-center text-sm text-slate-400">
          Ainda n&atilde;o tem uma conta?{' '}
          <Link href="/signup" className="font-medium text-blue-400 hover:text-blue-300 transition-colors">
            Cadastre-se
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          <p className="text-sm text-white/60">Carregando...</p>
        </div>
      </main>
    }>
      <LoginContent />
    </Suspense>
  );
}
