'use client';

import { formatCents } from '@/lib/utils/format';

interface CurrencyDisplayProps {
  cents: number | null | undefined;
  currency?: string;
  className?: string;
}

export function CurrencyDisplay({ cents, currency = 'BRL', className = '' }: CurrencyDisplayProps) {
  if (cents == null) return <span className={className}>—</span>;
  return <span className={className}>{formatCents(cents, currency)}</span>;
}
