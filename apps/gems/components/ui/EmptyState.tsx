'use client';

interface EmptyStateProps {
  message: string;
  className?: string;
}

export function EmptyState({ message, className = '' }: EmptyStateProps) {
  return (
    <div
      className={`rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500 ${className}`.trim()}
    >
      {message}
    </div>
  );
}
