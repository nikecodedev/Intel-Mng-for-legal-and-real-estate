/**
 * Auction module API. All risk/ROI values come from backend; frontend only displays.
 */

import { api, getApiErrorMessage } from '@/lib/api';

export { getApiErrorMessage };

export const AUCTION_STAGES = ['F0', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9'] as const;
export type AuctionStage = (typeof AUCTION_STAGES)[number];

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface AuctionAsset {
  id: string;
  current_stage: string;
  linked_document_ids: string[];
  due_diligence_checklist: unknown;
  risk_score: number;
  risk_level: RiskLevel;
  bidding_disabled: boolean;
  asset_reference: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuctionsListResponse {
  success: boolean;
  data: {
    assets: AuctionAsset[];
    pagination: { limit: number; offset: number };
  };
}

export interface AuctionAssetResponse {
  success: boolean;
  data: AuctionAsset;
}

export interface TransitionResponse {
  success: boolean;
  data: { asset: AuctionAsset; previous_stage: string; to_stage: string };
}

export interface RiskResponse {
  success: boolean;
  data: {
    risk_score: number;
    risk_level: RiskLevel;
    bidding_disabled: boolean;
  };
}

export interface ROIData {
  id: string;
  auction_asset_id: string;
  inputs: {
    acquisition_price_cents: number;
    taxes_itbi_cents: number;
    legal_costs_cents: number;
    renovation_estimate_cents: number;
    expected_resale_value_cents: number;
    expected_resale_date: string | null;
  };
  outputs: {
    total_cost_cents: number;
    net_profit_cents: number;
    roi_percentage: number;
    break_even_date: string | null;
  };
  version_number: number;
  updated_at: string;
}

export interface ROIResponse {
  success: boolean;
  data: ROIData;
}

export function fetchAuctions(params: { stage?: string; limit?: number; offset?: number } = {}): Promise<AuctionsListResponse> {
  return api.get<AuctionsListResponse>('/auctions/assets', { params }).then((r) => r.data);
}

export function fetchAuctionById(id: string): Promise<AuctionAsset> {
  return api.get<AuctionAssetResponse>(`/auctions/assets/${id}`).then((r) => {
    if (!r.data?.success || !r.data?.data) throw new Error('Invalid response');
    return r.data.data;
  });
}

export function advanceAuctionStage(id: string, toStage: string): Promise<TransitionResponse['data']> {
  return api.post<TransitionResponse>(`/auctions/assets/${id}/transition`, { to_stage: toStage }).then((r) => {
    if (!r.data?.success || !r.data?.data) throw new Error('Invalid response');
    return r.data.data;
  });
}

export function fetchAuctionRisk(id: string): Promise<RiskResponse['data']> {
  return api.get<RiskResponse>(`/auctions/assets/${id}/risk`).then((r) => {
    if (!r.data?.success || !r.data?.data) throw new Error('Invalid response');
    return r.data.data;
  });
}

export function fetchAuctionROI(id: string): Promise<ROIData> {
  return api.get<ROIResponse>(`/auctions/assets/${id}/roi`).then((r) => {
    if (!r.data?.success || !r.data?.data) throw new Error('Invalid response');
    return r.data.data;
  });
}

/** Next MPGA stage (F0->F1->...->F9). Returns null if already at F9. */
export function getNextStage(current: string): string | null {
  if (current === 'F9') return null;
  const n = parseInt(current.replace(/^F/, ''), 10);
  if (Number.isNaN(n) || n < 0 || n >= 9) return null;
  return `F${n + 1}`;
}
