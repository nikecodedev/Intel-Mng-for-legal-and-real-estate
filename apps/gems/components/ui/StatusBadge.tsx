'use client';

import {
  PAYMENT_STATUS_STYLES,
  CPO_STATUS_STYLES,
  TENANT_STATUS_STYLES,
  RISK_LEVEL_STYLES,
} from '@/lib/utils/constants';

export type StatusBadgeVariant = 'payment' | 'cpo' | 'tenant' | 'risk' | 'generic';

const VARIANT_MAP: Record<StatusBadgeVariant, Record<string, string>> = {
  payment: PAYMENT_STATUS_STYLES,
  cpo: CPO_STATUS_STYLES,
  tenant: TENANT_STATUS_STYLES,
  risk: RISK_LEVEL_STYLES,
  generic: {},
};

interface StatusBadgeProps {
  /** Value from API (e.g. PENDING, VERDE, ACTIVE, LOW). */
  value: string | null | undefined;
  variant?: StatusBadgeVariant;
  /** Override label; default is value. */
  label?: string;
  className?: string;
}

export function StatusBadge({ value, variant = 'generic', label, className = '' }: StatusBadgeProps) {
  if (value == null || value === '') {
    return <span className={`text-gray-500 ${className}`}>—</span>;
  }
  const styles = VARIANT_MAP[variant];
  const style = styles[value] ?? 'bg-gray-100 text-gray-800';
  return (
    <span
      className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${style} ${className}`.trim()}
    >
      {label ?? value}
    </span>
  );
}
