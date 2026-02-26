/**
 * Matching API: match records for an investor (match score display).
 */

import { api } from '@/lib/api';

export interface MatchRecord {
  id: string;
  tenant_id: string;
  investor_user_id: string;
  auction_asset_id: string;
  match_score: number;
  match_status?: string;
  created_at: string;
  [key: string]: unknown;
}

export interface MatchesListResponse {
  success: boolean;
  matches: MatchRecord[];
  total: number;
  limit: number;
  offset: number;
}

export function fetchMatchesForInvestor(
  investorId: string,
  params?: { min_score?: number; limit?: number; offset?: number }
): Promise<MatchesListResponse> {
  return api.get<MatchesListResponse>(`/matching/matches/${investorId}`, { params }).then((r) => r.data);
}
