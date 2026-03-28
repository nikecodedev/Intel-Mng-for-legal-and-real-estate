'use client';

interface StatCardProps {
  label: string;
  value: string | number;
  error?: boolean;
}

export function StatCard({ label, value, error }: StatCardProps) {
  return (
    <div className="stat-card border-l-4 border-l-blue-500/60">
      <p className="stat-label">{label}</p>
      <p className="stat-value mt-2">
        {error ? (
          <span className="text-gray-400">0</span>
        ) : (
          value
        )}
      </p>
    </div>
  );
}
