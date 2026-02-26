/**
 * UI constants for status badges and labels.
 * Display-only; valid values and rules come from API.
 */

export const PAYMENT_STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  PAID: 'bg-green-100 text-green-800',
  PARTIAL: 'bg-blue-100 text-blue-800',
  CANCELLED: 'bg-gray-100 text-gray-700',
  OVERDUE: 'bg-red-100 text-red-800',
};

export const CPO_STATUS_STYLES: Record<string, string> = {
  VERDE: 'bg-green-100 text-green-800',
  AMARELO: 'bg-yellow-100 text-yellow-800',
  VERMELHO: 'bg-red-100 text-red-800',
};

export const TENANT_STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  SUSPENDED: 'bg-red-100 text-red-800',
  INACTIVE: 'bg-gray-100 text-gray-700',
  TRIAL: 'bg-blue-100 text-blue-800',
};

export const RISK_LEVEL_STYLES: Record<string, string> = {
  LOW: 'bg-green-100 text-green-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  HIGH: 'bg-red-100 text-red-800',
};
