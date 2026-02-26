/**
 * Dashboard data fetchers. Used with React Query.
 */

import { api } from '@/lib/api';
import type {
  DocumentsListResponse,
  SanitationQueueResponse,
  AuctionsListResponse,
  RealEstateListResponse,
  FinancePayablesResponse,
  DeadlinesKpiResponse,
} from '@/lib/types';

export async function fetchDocumentsTotal(): Promise<number> {
  const { data } = await api.get<DocumentsListResponse>('/documents', {
    params: { limit: 1, offset: 0 },
  });
  if (!data?.success || !data.data?.pagination) return 0;
  return data.data.pagination.total;
}

export async function fetchSanitationPending(): Promise<number> {
  const { data } = await api.get<SanitationQueueResponse>('/documents/sanitation-queue', {
    params: { limit: 1, offset: 0 },
  });
  if (!data?.success || !data.data?.pagination) return 0;
  return data.data.pagination.total;
}

export async function fetchActiveAuctionsCount(): Promise<number> {
  const { data } = await api.get<AuctionsListResponse>('/auctions/assets', {
    params: { limit: 500, offset: 0 },
  });
  if (!data?.success || !data.data?.assets) return 0;
  return data.data.assets.length;
}

export async function fetchAssetsInRenovation(): Promise<number> {
  const { data } = await api.get<RealEstateListResponse>('/assets', {
    params: { state: 'RENOVATION', limit: 1, offset: 0 },
  });
  if (!data?.success) return 0;
  return data.total ?? 0;
}

export async function fetchPendingFinancialApprovals(): Promise<number> {
  const { data } = await api.get<FinancePayablesResponse>('/finance/payables', {
    params: { payment_status: 'PENDING', limit: 1, offset: 0 },
  });
  if (!data?.success) return 0;
  return data.total ?? 0;
}

export async function fetchUpcomingDeadlines(): Promise<DeadlinesKpiResponse['kpi'] | null> {
  const { data } = await api.get<DeadlinesKpiResponse>('/dashboards/kpis/deadlines');
  if (!data?.success || !data.kpi) return null;
  return data.kpi;
}
