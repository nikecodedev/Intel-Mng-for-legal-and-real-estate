import { db } from './database.js';
import { QueryResult } from 'pg';
import { TenantRequiredError, NotFoundError } from '../utils/errors.js';

export interface InvestorPreferenceProfile {
  id: string;
  tenant_id: string;
  investor_user_id: string;
  min_budget_cents: number | null;
  max_budget_cents: number;
  preferred_budget_cents: number | null;
  risk_tolerance_score: number;
  preferred_asset_types: string[];
  excluded_asset_types: string[];
  preferred_locations: string[];
  excluded_locations: string[];
  min_property_size_sqm: number | null;
  max_property_size_sqm: number | null;
  preferred_number_of_rooms: number | null;
  preferred_number_of_bathrooms: number | null;
  min_expected_roi_percentage: number | null;
  max_acceptable_risk_score: number | null;
  auto_notify_enabled: boolean;
  notification_threshold: number;
  notification_channels: string[];
  is_active: boolean;
  profile_completed_at: Date | null;
  notes: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  deleted_by: string | null;
}

export interface CreateInvestorPreferenceProfileInput {
  tenant_id: string;
  investor_user_id: string;
  min_budget_cents?: number;
  max_budget_cents: number;
  preferred_budget_cents?: number;
  risk_tolerance_score?: number;
  preferred_asset_types?: string[];
  excluded_asset_types?: string[];
  preferred_locations?: string[];
  excluded_locations?: string[];
  min_property_size_sqm?: number;
  max_property_size_sqm?: number;
  preferred_number_of_rooms?: number;
  preferred_number_of_bathrooms?: number;
  min_expected_roi_percentage?: number;
  max_acceptable_risk_score?: number;
  auto_notify_enabled?: boolean;
  notification_threshold?: number;
  notification_channels?: string[];
  notes?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

function requireTenantId(tenantId: string | undefined | null, operation: string): asserts tenantId is string {
  if (!tenantId) {
    throw new TenantRequiredError(operation);
  }
}

function mapRow(row: any): InvestorPreferenceProfile {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    investor_user_id: row.investor_user_id as string,
    min_budget_cents: row.min_budget_cents ? Number(row.min_budget_cents) : null,
    max_budget_cents: Number(row.max_budget_cents),
    preferred_budget_cents: row.preferred_budget_cents ? Number(row.preferred_budget_cents) : null,
    risk_tolerance_score: Number(row.risk_tolerance_score) || 50,
    preferred_asset_types: Array.isArray(row.preferred_asset_types) ? (row.preferred_asset_types as string[]) : [],
    excluded_asset_types: Array.isArray(row.excluded_asset_types) ? (row.excluded_asset_types as string[]) : [],
    preferred_locations: Array.isArray(row.preferred_locations) ? (row.preferred_locations as string[]) : [],
    excluded_locations: Array.isArray(row.excluded_locations) ? (row.excluded_locations as string[]) : [],
    min_property_size_sqm: row.min_property_size_sqm ? Number(row.min_property_size_sqm) : null,
    max_property_size_sqm: row.max_property_size_sqm ? Number(row.max_property_size_sqm) : null,
    preferred_number_of_rooms: row.preferred_number_of_rooms ? Number(row.preferred_number_of_rooms) : null,
    preferred_number_of_bathrooms: row.preferred_number_of_bathrooms ? Number(row.preferred_number_of_bathrooms) : null,
    min_expected_roi_percentage: row.min_expected_roi_percentage ? Number(row.min_expected_roi_percentage) : null,
    max_acceptable_risk_score: row.max_acceptable_risk_score ? Number(row.max_acceptable_risk_score) : null,
    auto_notify_enabled: Boolean(row.auto_notify_enabled),
    notification_threshold: Number(row.notification_threshold) || 85,
    notification_channels: Array.isArray(row.notification_channels) ? (row.notification_channels as string[]) : ['email'],
    is_active: Boolean(row.is_active),
    profile_completed_at: row.profile_completed_at ? new Date(row.profile_completed_at as string) : null,
    notes: (row.notes as string) ?? null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    metadata: (row.metadata as Record<string, unknown>) || {},
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
    deleted_at: row.deleted_at ? new Date(row.deleted_at as string) : null,
    deleted_by: (row.deleted_by as string) ?? null,
  };
}

/**
 * Investor Preference Profile Model
 * Manages investor preferences for matching engine
 */
export class InvestorPreferenceProfileModel {
  /**
   * Find profile by investor ID within tenant
   */
  static async findByInvestorId(
    investorUserId: string,
    tenantId: string
  ): Promise<InvestorPreferenceProfile | null> {
    requireTenantId(tenantId, 'InvestorPreferenceProfileModel.findByInvestorId');
    
    const result: QueryResult<InvestorPreferenceProfile> = await db.query<InvestorPreferenceProfile>(
      `SELECT * FROM investor_preference_profiles 
       WHERE investor_user_id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND is_active = true
       ORDER BY created_at DESC
       LIMIT 1`,
      [investorUserId, tenantId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /**
   * Find profile by ID within tenant
   */
  static async findById(id: string, tenantId: string): Promise<InvestorPreferenceProfile | null> {
    requireTenantId(tenantId, 'InvestorPreferenceProfileModel.findById');
    
    const result: QueryResult<InvestorPreferenceProfile> = await db.query<InvestorPreferenceProfile>(
      `SELECT * FROM investor_preference_profiles 
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /**
   * Create or update preference profile
   */
  static async createOrUpdate(
    input: CreateInvestorPreferenceProfileInput
  ): Promise<InvestorPreferenceProfile> {
    requireTenantId(input.tenant_id, 'InvestorPreferenceProfileModel.createOrUpdate');
    
    // Check if profile exists
    const existing = await this.findByInvestorId(input.investor_user_id, input.tenant_id);
    
    if (existing) {
      // Update existing profile
      const updates: string[] = [];
      const values: unknown[] = [];
      let paramCount = 1;

      if (input.min_budget_cents !== undefined) {
        updates.push(`min_budget_cents = $${paramCount++}`);
        values.push(input.min_budget_cents);
      }
      if (input.max_budget_cents !== undefined) {
        updates.push(`max_budget_cents = $${paramCount++}`);
        values.push(input.max_budget_cents);
      }
      if (input.preferred_budget_cents !== undefined) {
        updates.push(`preferred_budget_cents = $${paramCount++}`);
        values.push(input.preferred_budget_cents);
      }
      if (input.risk_tolerance_score !== undefined) {
        updates.push(`risk_tolerance_score = $${paramCount++}`);
        values.push(input.risk_tolerance_score);
      }
      if (input.preferred_asset_types !== undefined) {
        updates.push(`preferred_asset_types = $${paramCount++}`);
        values.push(input.preferred_asset_types);
      }
      if (input.excluded_asset_types !== undefined) {
        updates.push(`excluded_asset_types = $${paramCount++}`);
        values.push(input.excluded_asset_types);
      }
      if (input.preferred_locations !== undefined) {
        updates.push(`preferred_locations = $${paramCount++}`);
        values.push(input.preferred_locations);
      }
      if (input.excluded_locations !== undefined) {
        updates.push(`excluded_locations = $${paramCount++}`);
        values.push(input.excluded_locations);
      }
      if (input.min_property_size_sqm !== undefined) {
        updates.push(`min_property_size_sqm = $${paramCount++}`);
        values.push(input.min_property_size_sqm);
      }
      if (input.max_property_size_sqm !== undefined) {
        updates.push(`max_property_size_sqm = $${paramCount++}`);
        values.push(input.max_property_size_sqm);
      }
      if (input.preferred_number_of_rooms !== undefined) {
        updates.push(`preferred_number_of_rooms = $${paramCount++}`);
        values.push(input.preferred_number_of_rooms);
      }
      if (input.preferred_number_of_bathrooms !== undefined) {
        updates.push(`preferred_number_of_bathrooms = $${paramCount++}`);
        values.push(input.preferred_number_of_bathrooms);
      }
      if (input.min_expected_roi_percentage !== undefined) {
        updates.push(`min_expected_roi_percentage = $${paramCount++}`);
        values.push(input.min_expected_roi_percentage);
      }
      if (input.max_acceptable_risk_score !== undefined) {
        updates.push(`max_acceptable_risk_score = $${paramCount++}`);
        values.push(input.max_acceptable_risk_score);
      }
      if (input.auto_notify_enabled !== undefined) {
        updates.push(`auto_notify_enabled = $${paramCount++}`);
        values.push(input.auto_notify_enabled);
      }
      if (input.notification_threshold !== undefined) {
        updates.push(`notification_threshold = $${paramCount++}`);
        values.push(input.notification_threshold);
      }
      if (input.notification_channels !== undefined) {
        updates.push(`notification_channels = $${paramCount++}`);
        values.push(input.notification_channels);
      }
      if (input.notes !== undefined) {
        updates.push(`notes = $${paramCount++}`);
        values.push(input.notes);
      }
      if (input.tags !== undefined) {
        updates.push(`tags = $${paramCount++}`);
        values.push(input.tags);
      }
      if (input.metadata !== undefined) {
        updates.push(`metadata = $${paramCount++}`);
        values.push(JSON.stringify(input.metadata));
      }

      updates.push(`profile_completed_at = CURRENT_TIMESTAMP`);
      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(existing.id, input.tenant_id);

      const result: QueryResult<InvestorPreferenceProfile> = await db.query<InvestorPreferenceProfile>(
        `UPDATE investor_preference_profiles 
         SET ${updates.join(', ')}
         WHERE id = $${paramCount++} AND tenant_id = $${paramCount++} AND deleted_at IS NULL
         RETURNING *`,
        values
      );

      return mapRow(result.rows[0]);
    } else {
      // Create new profile
      const result: QueryResult<InvestorPreferenceProfile> = await db.query<InvestorPreferenceProfile>(
        `INSERT INTO investor_preference_profiles 
         (tenant_id, investor_user_id, min_budget_cents, max_budget_cents, preferred_budget_cents,
          risk_tolerance_score, preferred_asset_types, excluded_asset_types, preferred_locations,
          excluded_locations, min_property_size_sqm, max_property_size_sqm, preferred_number_of_rooms,
          preferred_number_of_bathrooms, min_expected_roi_percentage, max_acceptable_risk_score,
          auto_notify_enabled, notification_threshold, notification_channels, notes, tags, metadata,
          profile_completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, CURRENT_TIMESTAMP)
         RETURNING *`,
        [
          input.tenant_id,
          input.investor_user_id,
          input.min_budget_cents || null,
          input.max_budget_cents,
          input.preferred_budget_cents || null,
          input.risk_tolerance_score || 50,
          input.preferred_asset_types || [],
          input.excluded_asset_types || [],
          input.preferred_locations || [],
          input.excluded_locations || [],
          input.min_property_size_sqm || null,
          input.max_property_size_sqm || null,
          input.preferred_number_of_rooms || null,
          input.preferred_number_of_bathrooms || null,
          input.min_expected_roi_percentage || null,
          input.max_acceptable_risk_score || null,
          input.auto_notify_enabled !== false,
          input.notification_threshold || 85,
          input.notification_channels || ['email'],
          input.notes || null,
          input.tags || [],
          JSON.stringify(input.metadata || {}),
        ]
      );
      return mapRow(result.rows[0]);
    }
  }
}
