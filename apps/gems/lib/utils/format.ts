/**
 * Display-only formatting. No business rules; values come from API.
 */

export function formatDate(
  iso: string | undefined | null,
  options: Intl.DateTimeFormatOptions & { style?: 'short' | 'medium' | 'long' } = {}
): string {
  if (iso == null || iso === '') return '—';
  try {
    const style = options.style ?? 'short';
    const opts: Intl.DateTimeFormatOptions =
      style === 'short'
        ? { dateStyle: 'short' }
        : style === 'medium'
          ? { dateStyle: 'medium' }
          : { dateStyle: 'long', timeStyle: 'short' };
    return new Date(iso).toLocaleDateString(undefined, { ...opts, ...options });
  } catch {
    return String(iso);
  }
}

export function formatCents(cents: number, currency = 'BRL'): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/** Display percentage from 0–1 or 0–100; backend may send either. */
export function formatPercent(value: number | null | undefined, fromFraction = true): string {
  if (value == null) return '—';
  const p = fromFraction ? value * 100 : value;
  return `${Math.round(p)}%`;
}
