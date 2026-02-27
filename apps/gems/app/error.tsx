'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.error('App error:', error);
    }
  }, [error]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-50">
      <div className="max-w-md w-full rounded-lg border border-red-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Something went wrong</h1>
        <p className="text-sm text-gray-600 mb-4">
          An unexpected error occurred. You can try again or go back to the home page.
        </p>
        {error?.message && (
          <pre className="mb-4 p-3 rounded bg-gray-100 text-xs text-red-700 overflow-auto max-h-32">
            {error.message}
          </pre>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Home
          </Link>
          <Link
            href="/login"
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Log in
          </Link>
        </div>
      </div>
    </main>
  );
}
