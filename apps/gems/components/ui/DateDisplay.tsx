'use client';

import { formatDate as format } from '@/lib/utils/format';

interface DateDisplayProps {
  value: string | null | undefined;
  style?: 'short' | 'medium' | 'long';
  className?: string;
}

export function DateDisplay({ value, style = 'short', className = '' }: DateDisplayProps) {
  return <span className={className}>{format(value, { style })}</span>;
}
