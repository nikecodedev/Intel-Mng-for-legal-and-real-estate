'use client';

import type { RiskLevel } from '@/lib/auction-api';

/**
 * Displays backend risk_level only. No frontend calculation.
 * Green = LOW, Yellow = MEDIUM, Red = HIGH.
 */
interface RiskIndicatorProps {
  riskLevel: RiskLevel;
  riskScore?: number;
  showScore?: boolean;
  className?: string;
}

const STYLES: Record<RiskLevel, { bg: string; text: string; label: string }> = {
  LOW: { bg: 'bg-green-100', text: 'text-green-800', label: 'Low' },
  MEDIUM: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Medium' },
  HIGH: { bg: 'bg-red-100', text: 'text-red-800', label: 'High' },
};

export function RiskIndicator({ riskLevel, riskScore, showScore, className = '' }: RiskIndicatorProps) {
  const style = STYLES[riskLevel] ?? STYLES.LOW;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text} ${className}`}
      title={riskScore != null ? `Score: ${riskScore} (from backend)` : undefined}
    >
      <span className={`h-2 w-2 rounded-full ${riskLevel === 'LOW' ? 'bg-green-600' : riskLevel === 'MEDIUM' ? 'bg-yellow-600' : 'bg-red-600'}`} aria-hidden />
      {style.label}
      {showScore && riskScore != null && <span className="opacity-90">({riskScore})</span>}
    </span>
  );
}
