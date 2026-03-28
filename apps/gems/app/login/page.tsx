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
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  const handleSuccess = () => {
    router.push(redirect);
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gray-100">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-6">GEMS – Sign in</h1>
        <LoginForm onSuccess={handleSuccess} />
        <p className="mt-4 text-center text-sm text-gray-600">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="font-medium text-blue-600 hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </main>
    }>
      <LoginContent />
    </Suspense>
  );
}
