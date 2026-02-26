/**
 * Real Estate module API.
 */

import { api, getApiErrorMessage } from '@/lib/api';

export { getApiErrorMessage };

export const ASSET_STATES = ['ACQUIRED', 'REGULARIZATION', 'RENOVATION', 'READY', 'SOLD', 'RENTED'] as const;
export type AssetState = (typeof ASSET_STATES)[number];

export type CostType = 'acquisition' | 'regularization' | 'renovation' | 'maintenance' | 'taxes' | 'legal' | 'other';

export interface RealEstateAsset {
  id: string;
  asset_code: string;
  property_address: string;
  property_type: string | null;
  property_size_sqm: number | null;
  number_of_rooms: number | null;
  number_of_bathrooms: number | null;
  current_state: string;
  state_changed_at: string;
  state_changed_by: string | null;
  state_change_reason: string | null;
  auction_asset_id: string | null;
  linked_document_ids: string[];
  linked_financial_record_ids: string[];
  acquisition_date: string | null;
  acquisition_price_cents: number | null;
  acquisition_source: string | null;
  sale_date: string | null;
  sale_price_cents: number | null;
  sale_buyer_name: string | null;
  rental_start_date: string | null;
  rental_end_date: string | null;
  rental_monthly_amount_cents: number | null;
  rental_tenant_name: string | null;
  is_vacant?: boolean;
  notes: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface RealEstateListResponse {
  success: boolean;
  assets: RealEstateAsset[];
  total: number;
  limit: number;
  offset: number;
}

export interface RealEstateAssetResponse {
  success: boolean;
  asset: RealEstateAsset;
}

export interface AssetCost {
  id: string;
  real_estate_asset_id: string;
  cost_type: CostType;
  cost_category: string | null;
  description: string;
  amount_cents: number;
  currency: string;
  cost_date: string;
  payment_status: string;
  vendor_name: string | null;
  created_at: string;
}

export interface AssetCostsResponse {
  success: boolean;
  costs: AssetCost[];
  total: number;
  limit: number;
  offset: number;
}

export interface CostBreakdown {
  acquisition_cost_cents: number;
  regularization_cost_cents: number;
  renovation_cost_cents: number;
  maintenance_cost_cents: number;
  taxes_cost_cents: number;
  legal_cost_cents: number;
  other_cost_cents: number;
  total_cost_cents: number;
  acquisition_price_cents: number | null;
  total_real_cost_cents: number;
  formatted: {
    acquisition_cost: string;
    regularization_cost: string;
    renovation_cost: string;
    maintenance_cost: string;
    taxes_cost: string;
    legal_cost: string;
    other_cost: string;
    total_cost: string;
    acquisition_price: string;
    total_real_cost: string;
  };
}

export interface CostBreakdownResponse {
  success: boolean;
  breakdown: CostBreakdown;
}

export interface ValidTransitionsResponse {
  success: boolean;
  current_state: string;
  valid_next_states: string[];
}

export function fetchAssets(params: {
  state?: string;
  is_vacant?: boolean;
  property_type?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<RealEstateListResponse> {
  return api.get<RealEstateListResponse>('/assets', { params }).then((r) => r.data);
}

export function fetchAssetById(id: string): Promise<RealEstateAsset> {
  return api.get<RealEstateAssetResponse>(`/assets/${id}`).then((r) => {
    if (!r.data?.success || !r.data?.asset) throw new Error('Invalid response');
    return r.data.asset;
  });
}

export function fetchAssetCosts(
  assetId: string,
  params?: { cost_type?: string; payment_status?: string; limit?: number; offset?: number }
): Promise<AssetCostsResponse> {
  return api.get<AssetCostsResponse>(`/assets/${assetId}/costs`, { params }).then((r) => r.data);
}

export function fetchCostBreakdown(assetId: string): Promise<CostBreakdown> {
  return api.get<CostBreakdownResponse>(`/assets/${assetId}/real-cost`).then((r) => {
    if (!r.data?.success || !r.data?.breakdown) throw new Error('Invalid response');
    return r.data.breakdown;
  });
}

export function fetchValidTransitions(
  assetId: string
): Promise<{ current_state: string; valid_next_states: string[] }> {
  return api.get<ValidTransitionsResponse>(`/assets/${assetId}/valid-transitions`).then((r) => {
    if (!r.data?.success) throw new Error('Invalid response');
    return { current_state: r.data.current_state, valid_next_states: r.data.valid_next_states };
  });
}
