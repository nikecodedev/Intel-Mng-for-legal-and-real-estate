/**
 * Shared types for GEMS frontend.
 * Align with backend API responses where applicable.
 */

export type UserRole = 'OWNER' | 'REVISOR' | 'OPERATIONAL' | 'INVESTOR';

export interface User {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  tenant_id: string;
  role?: UserRole;
  /** Set by backend when available (e.g. login/me); used in header. */
  tenant_name?: string | null;
}

export interface AuthMeResponse {
  success: boolean;
  data?: {
    user: User;
  };
}

export interface AuthTokens {
  access_token: string;
  refresh_token?: string;
}

export interface LoginResponse {
  success: boolean;
  data: {
    user: User;
    tokens: AuthTokens;
  };
}

export interface RefreshResponse {
  success: boolean;
  data: {
    access_token: string;
  };
}

export interface ApiError {
  success: false;
  error?: {
    code?: string;
    message?: string;
    timestamp?: string;
  };
}

export type ApiResponse<T> = { success: true; data?: T } | ApiError;

export interface PaginatedResponse<T> {
  success: boolean;
  data?: T[];
  total?: number;
  limit?: number;
  offset?: number;
}

// Dashboard API response shapes
export interface DocumentsListResponse {
  success: boolean;
  data: {
    documents: unknown[];
    pagination: { total: number; limit: number; offset: number };
  };
}

export interface SanitationQueueResponse {
  success: boolean;
  data: {
    items: unknown[];
    pagination: { total: number; limit: number; offset: number };
  };
}

export interface AuctionsListResponse {
  success: boolean;
  data: {
    assets: unknown[];
    pagination: { limit: number; offset: number };
  };
}

export interface RealEstateListResponse {
  success: boolean;
  assets: unknown[];
  total: number;
  limit: number;
  offset: number;
}

export interface FinancePayablesResponse {
  success: boolean;
  payables: unknown[];
  total: number;
  limit: number;
  offset: number;
}

export interface DeadlinesKpiResponse {
  success: boolean;
  kpi: {
    total_deadlines: number;
    overdue_count: number;
    due_today_count: number;
    due_this_week_count: number;
    due_this_month_count: number;
    critical_deadlines: Array<{
      id: string;
      title: string;
      due_date: string;
      days_until_due: number;
      resource_type: string;
    }>;
  };
}
