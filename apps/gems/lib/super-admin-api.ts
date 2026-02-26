/**
 * Super Admin API: tenants, provision, suspend/reactivate, storage.
 */

import { api, getApiErrorMessage } from '@/lib/api';

export { getApiErrorMessage };

export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'INACTIVE' | 'TRIAL';
export type SubscriptionPlan = 'FREE' | 'STANDARD' | 'PREMIUM' | 'ENTERPRISE' | 'CUSTOM';

export interface Tenant {
  id: string;
  name: string;
  status: TenantStatus;
  tenant_code: string | null;
  domain: string | null;
  subscription_plan: SubscriptionPlan;
  contact_email: string | null;
  created_at: string;
  updated_at: string;
  suspended_at: string | null;
  suspension_reason: string | null;
  [key: string]: unknown;
}

export interface TenantListItem {
  id: string;
  name: string;
  status: string;
  storage_bytes: number;
  user_count: number;
}

export interface SuperAdminDashboard {
  total_tenants: number;
  active_tenants: number;
  suspended_tenants: number;
  total_storage_bytes: number;
  tenants: TenantListItem[];
}

export interface TenantsListResponse {
  success: boolean;
  tenants: Tenant[];
  total: number;
  limit: number;
  offset: number;
}

export interface TenantStorageUsage {
  total_storage_bytes?: number;
  document_storage_bytes?: number;
  total_bytes?: number;
  document_bytes?: number;
  usage_percentage?: number;
  quota_bytes?: number | null;
  measurement_date?: string;
  [key: string]: unknown;
}

export interface ProvisionTenantInput {
  name: string;
  tenant_code?: string;
  domain?: string;
  subscription_plan?: SubscriptionPlan;
  contact_email?: string;
  quotas?: {
    max_storage_bytes?: number;
    max_users?: number;
    max_documents?: number;
  };
  white_label?: {
    company_name?: string;
    primary_color?: string;
  };
}

/** Dashboard includes tenant list with storage_bytes and user_count per tenant */
export function fetchSuperAdminDashboard(): Promise<SuperAdminDashboard> {
  return api.get<{ success: boolean; dashboard: SuperAdminDashboard }>('/super-admin/dashboard').then((r) => {
    if (!r.data?.success || !r.data?.dashboard) throw new Error('Invalid response');
    return r.data.dashboard;
  });
}

export function fetchTenants(params?: {
  status?: TenantStatus;
  subscription_plan?: SubscriptionPlan;
  limit?: number;
  offset?: number;
}): Promise<TenantsListResponse> {
  return api.get<TenantsListResponse>('/super-admin/tenants', { params }).then((r) => r.data);
}

export function fetchTenantById(id: string): Promise<Tenant> {
  return api.get<{ success: boolean; tenant: Tenant }>(`/super-admin/tenants/${id}`).then((r) => {
    if (!r.data?.success || !r.data?.tenant) throw new Error('Invalid response');
    return r.data.tenant;
  });
}

export interface TenantDashboardData {
  tenant: Tenant;
  storage_usage: { total_bytes: number; document_bytes: number; usage_percentage: number; quota_bytes: number | null };
  user_count: number;
  active_user_count: number;
  document_count: number;
}

export function fetchTenantDashboard(tenantId: string): Promise<TenantDashboardData> {
  return api.get<{ success: boolean; dashboard: TenantDashboardData }>(`/super-admin/tenants/${tenantId}/dashboard`).then((r) => {
    if (!r.data?.success || !r.data?.dashboard) throw new Error('Invalid response');
    return r.data.dashboard;
  });
}

export function fetchTenantStorage(tenantId: string): Promise<TenantStorageUsage> {
  return api.get<{ success: boolean; usage: TenantStorageUsage }>(`/super-admin/tenants/${tenantId}/storage`).then((r) => {
    if (!r.data?.success || !(r.data as { usage?: TenantStorageUsage }).usage) throw new Error('Invalid response');
    return (r.data as { usage: TenantStorageUsage }).usage;
  });
}

export function provisionTenant(input: ProvisionTenantInput): Promise<{ tenant: Tenant }> {
  return api.post<{ success: boolean; tenant: Tenant }>('/super-admin/tenants', input).then((r) => {
    if (!r.data?.success || !(r.data as { tenant?: Tenant }).tenant) throw new Error('Invalid response');
    return { tenant: (r.data as { tenant: Tenant }).tenant };
  });
}

export function suspendTenant(tenantId: string, reason: string): Promise<Tenant> {
  return api.post<{ success: boolean; tenant: Tenant }>(`/super-admin/tenants/${tenantId}/suspend`, { reason }).then((r) => {
    if (!r.data?.success || !(r.data as { tenant?: Tenant }).tenant) throw new Error('Invalid response');
    return (r.data as { tenant: Tenant }).tenant;
  });
}

export function reactivateTenant(tenantId: string): Promise<Tenant> {
  return api.post<{ success: boolean; tenant: Tenant }>(`/super-admin/tenants/${tenantId}/reactivate`).then((r) => {
    if (!r.data?.success || !(r.data as { tenant?: Tenant }).tenant) throw new Error('Invalid response');
    return (r.data as { tenant: Tenant }).tenant;
  });
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
