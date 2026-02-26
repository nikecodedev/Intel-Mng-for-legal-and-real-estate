'use client';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-2',
  lg: 'h-12 w-12 border-4',
};

/**
 * Graceful loading indicator. Use for buttons or inline loading.
 */
export function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  return (
    <div
      className={`animate-spin rounded-full border-gray-200 border-t-blue-600 ${sizeClasses[size]} ${className}`.trim()}
      role="status"
      aria-label="Loading"
    />
  );
}

/**
 * Full-page loading state. Use while initializing or loading a whole page.
 */
export function PageLoader({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8">
      <LoadingSpinner size="lg" />
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}

/**
 * Inline block loading (e.g. for a table or card). Preserves layout.
 */
export function BlockLoader({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white py-12">
      <LoadingSpinner size="md" />
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}
