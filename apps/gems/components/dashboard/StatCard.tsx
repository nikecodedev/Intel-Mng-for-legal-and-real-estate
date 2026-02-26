'use client';

interface StatCardProps {
  label: string;
  value: string | number;
  error?: boolean;
}

export function StatCard({ label, value, error }: StatCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${error ? 'text-red-600' : 'text-gray-900'}`}>
        {error ? 'Unable to load' : value}
      </p>
    </div>
  );
}
