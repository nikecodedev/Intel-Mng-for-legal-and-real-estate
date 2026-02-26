'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { LoginForm } from '@/components/forms/LoginForm';

export default function LoginPage() {
  const { isAuthenticated, isInitialized } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') ?? '/dashboard';

  useEffect(() => {
    if (isInitialized && isAuthenticated) {
      router.replace(redirect.startsWith('/') ? redirect : '/dashboard');
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
    router.push(redirect.startsWith('/') ? redirect : '/dashboard');
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gray-100">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-6">GEMS – Sign in</h1>
        <LoginForm onSuccess={handleSuccess} />
      </div>
    </main>
  );
}
