/**
 * CRM API (admin): investors list, detail, assigned assets.
 */

import { api } from '@/lib/api';

export interface InvestorListItem {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface InvestorsListResponse {
  success: boolean;
  investors: InvestorListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface InvestorDetail {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  is_active: boolean;
  is_email_verified: boolean;
  last_login_at: string | null;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssignedAssetItem {
  link_id: string;
  granted_at: string;
  access_notes: string | null;
  asset: {
    id: string;
    asset_reference: string | null;
    title: string | null;
    current_stage: string;
    risk_score: number;
  };
}

export interface AssignedAssetsResponse {
  success: boolean;
  assigned_assets: AssignedAssetItem[];
  total: number;
}

export function fetchInvestors(params?: { limit?: number; offset?: number }): Promise<InvestorsListResponse> {
  return api.get<InvestorsListResponse>('/crm/investors', { params }).then((r) => r.data);
}

export function fetchInvestorById(id: string): Promise<InvestorDetail> {
  return api.get<{ success: boolean; investor: InvestorDetail }>(`/crm/investors/${id}`).then((r) => {
    if (!r.data?.success || !r.data?.investor) throw new Error('Invalid response');
    return r.data.investor;
  });
}

export function fetchInvestorAssignedAssets(investorId: string): Promise<AssignedAssetItem[]> {
  return api.get<AssignedAssetsResponse>(`/crm/investors/${investorId}/assigned-assets`).then((r) => {
    if (!r.data?.success) throw new Error('Invalid response');
    return r.data.assigned_assets ?? [];
  });
}
