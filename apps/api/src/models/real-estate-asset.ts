import { db } from './database.js';
import { QueryResult } from 'pg';
import { TenantRequiredError, InvalidTransitionError, NotFoundError } from '../utils/errors.js';

/**
 * Real Estate Asset State Machine
 * Valid states: ACQUIRED → REGULARIZATION → RENOVATION → READY → SOLD/RENTED
 */
export const ASSET_STATES = ['ACQUIRED', 'REGULARIZATION', 'RENOVATION', 'READY', 'SOLD', 'RENTED'] as const;
export type AssetState = (typeof ASSET_STATES)[number];

/**
 * Valid state transitions
 * Enforced at API level to block invalid transitions
 */
const VALID_TRANSITIONS: Record<AssetState, AssetState[]> = {
  ACQUIRED: ['REGULARIZATION', 'SOLD'], // Can skip to SOLD if sold before processing
  REGULARIZATION: ['RENOVATION', 'SOLD'], // Can skip to SOLD
  RENOVATION: ['READY', 'SOLD'], // Can skip to SOLD
  READY: ['SOLD', 'RENTED'],
  SOLD: [], // Terminal state
  RENTED: ['READY', 'SOLD'], // Can return to READY or be sold
};

/**
 * Check if state transition is valid
 */
export function isValidTransition(from: AssetState, to: AssetState): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

/**
 * Get valid next states for current state
 */
export function getValidNextStates(current: AssetState): AssetState[] {
  return VALID_TRANSITIONS[current];
}

export interface RealEstateAsset {
  id: string;
  tenant_id: string;
  asset_code: string;
  property_address: string;
  property_type: string | null;
  property_size_sqm: number | null;
  number_of_rooms: number | null;
  number_of_bathrooms: number | null;
  current_state: AssetState;
  state_changed_at: Date;
  state_changed_by: string | null;
  state_change_reason: string | null;
  auction_asset_id: string | null;
  linked_document_ids: string[];
  linked_financial_record_ids: string[];
  acquisition_date: Date | null;
  acquisition_price_cents: number | null;
  acquisition_source: string | null;
  sale_date: Date | null;
  sale_price_cents: number | null;
  sale_buyer_name: string | null;
  rental_start_date: Date | null;
  rental_end_date: Date | null;
  rental_monthly_amount_cents: number | null;
  rental_tenant_name: string | null;
  is_vacant: boolean;
  vacancy_start_date: Date | null;
  vacancy_alert_sent: boolean;
  vacancy_alert_threshold_days: number;
  owner_id: string | null;
  assigned_to_id: string | null;
  notes: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  deleted_by: string | null;
}

export interface CreateRealEstateAssetInput {
  tenant_id: string;
  asset_code: string;
  property_address: string;
  property_type?: string;
  property_size_sqm?: number;
  number_of_rooms?: number;
  number_of_bathrooms?: number;
  auction_asset_id?: string;
  linked_document_ids?: string[];
  acquisition_date?: string;
  acquisition_price_cents?: number;
  acquisition_source?: string;
  owner_id?: string;
  assigned_to_id?: string;
  notes?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateRealEstateAssetInput {
  property_address?: string;
  property_type?: string;
  property_size_sqm?: number;
  number_of_rooms?: number;
  number_of_bathrooms?: number;
  linked_document_ids?: string[];
  linked_financial_record_ids?: string[];
  notes?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  owner_id?: string;
  assigned_to_id?: string;
}

export interface TransitionStateInput {
  to_state: AssetState;
  reason?: string;
  sale_date?: string;
  sale_price_cents?: number;
  sale_buyer_name?: string;
  rental_start_date?: string;
  rental_end_date?: string;
  rental_monthly_amount_cents?: number;
  rental_tenant_name?: string;
}

function requireTenantId(tenantId: string | undefined | null, operation: string): asserts tenantId is string {
  if (!tenantId) {
    throw new TenantRequiredError(operation);
  }
}

function mapRow(row: any): RealEstateAsset {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    asset_code: row.asset_code as string,
    property_address: row.property_address as string,
    property_type: (row.property_type as string) ?? null,
    property_size_sqm: row.property_size_sqm ? Number(row.property_size_sqm) : null,
    number_of_rooms: row.number_of_rooms ? Number(row.number_of_rooms) : null,
    number_of_bathrooms: row.number_of_bathrooms ? Number(row.number_of_bathrooms) : null,
    current_state: row.current_state as AssetState,
    state_changed_at: new Date(row.state_changed_at as string),
    state_changed_by: (row.state_changed_by as string) ?? null,
    state_change_reason: (row.state_change_reason as string) ?? null,
    auction_asset_id: (row.auction_asset_id as string) ?? null,
    linked_document_ids: Array.isArray(row.linked_document_ids) ? (row.linked_document_ids as string[]) : [],
    linked_financial_record_ids: Array.isArray(row.linked_financial_record_ids) 
      ? (row.linked_financial_record_ids as string[]) : [],
    acquisition_date: row.acquisition_date ? new Date(row.acquisition_date as string) : null,
    acquisition_price_cents: row.acquisition_price_cents ? Number(row.acquisition_price_cents) : null,
    acquisition_source: (row.acquisition_source as string) ?? null,
    sale_date: row.sale_date ? new Date(row.sale_date as string) : null,
    sale_price_cents: row.sale_price_cents ? Number(row.sale_price_cents) : null,
    sale_buyer_name: (row.sale_buyer_name as string) ?? null,
    rental_start_date: row.rental_start_date ? new Date(row.rental_start_date as string) : null,
    rental_end_date: row.rental_end_date ? new Date(row.rental_end_date as string) : null,
    rental_monthly_amount_cents: row.rental_monthly_amount_cents 
      ? Number(row.rental_monthly_amount_cents) : null,
    rental_tenant_name: (row.rental_tenant_name as string) ?? null,
    is_vacant: Boolean(row.is_vacant),
    vacancy_start_date: row.vacancy_start_date ? new Date(row.vacancy_start_date as string) : null,
    vacancy_alert_sent: Boolean(row.vacancy_alert_sent),
    vacancy_alert_threshold_days: Number(row.vacancy_alert_threshold_days) || 90,
    owner_id: (row.owner_id as string) ?? null,
    assigned_to_id: (row.assigned_to_id as string) ?? null,
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
 * Real Estate Asset Model
 * Manages real estate assets with state machine and cost tracking
 */
export class RealEstateAssetModel {
  /**
   * Find asset by ID within tenant
   */
  static async findById(id: string, tenantId: string): Promise<RealEstateAsset | null> {
    requireTenantId(tenantId, 'RealEstateAssetModel.findById');
    
    const result: QueryResult<RealEstateAsset> = await db.query<RealEstateAsset>(
      `SELECT * FROM real_estate_assets 
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /**
   * Find asset by asset code within tenant
   */
  static async findByAssetCode(assetCode: string, tenantId: string): Promise<RealEstateAsset | null> {
    requireTenantId(tenantId, 'RealEstateAssetModel.findByAssetCode');
    
    const result: QueryResult<RealEstateAsset> = await db.query<RealEstateAsset>(
      `SELECT * FROM real_estate_assets 
       WHERE asset_code = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [assetCode, tenantId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /**
   * List assets with filters
   */
  static async list(
    tenantId: string,
    filters?: {
      state?: AssetState;
      is_vacant?: boolean;
      property_type?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ assets: RealEstateAsset[]; total: number }> {
    requireTenantId(tenantId, 'RealEstateAssetModel.list');
    
    const conditions: string[] = ['tenant_id = $1', 'deleted_at IS NULL'];
    const values: unknown[] = [tenantId];
    let paramCount = 2;

    if (filters?.state) {
      conditions.push(`current_state = $${paramCount++}`);
      values.push(filters.state);
    }
    if (filters?.is_vacant !== undefined) {
      conditions.push(`is_vacant = $${paramCount++}`);
      values.push(filters.is_vacant);
    }
    if (filters?.property_type) {
      conditions.push(`property_type = $${paramCount++}`);
      values.push(filters.property_type);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM real_estate_assets WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated results
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;
    values.push(limit, offset);

    const result: QueryResult<RealEstateAsset> = await db.query<RealEstateAsset>(
      `SELECT * FROM real_estate_assets 
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramCount++} OFFSET $${paramCount++}`,
      values
    );

    return {
      assets: result.rows.map(mapRow),
      total,
    };
  }

  /**
   * Create new real estate asset
   */
  static async create(input: CreateRealEstateAssetInput): Promise<RealEstateAsset> {
    requireTenantId(input.tenant_id, 'RealEstateAssetModel.create');
    
    const result: QueryResult<RealEstateAsset> = await db.query<RealEstateAsset>(
      `INSERT INTO real_estate_assets 
       (tenant_id, asset_code, property_address, property_type, property_size_sqm, 
        number_of_rooms, number_of_bathrooms, auction_asset_id, linked_document_ids,
        acquisition_date, acquisition_price_cents, acquisition_source,
        owner_id, assigned_to_id, notes, tags, metadata, is_vacant, vacancy_start_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING *`,
      [
        input.tenant_id,
        input.asset_code,
        input.property_address,
        input.property_type || null,
        input.property_size_sqm || null,
        input.number_of_rooms || null,
        input.number_of_bathrooms || null,
        input.auction_asset_id || null,
        input.linked_document_ids || [],
        input.acquisition_date || null,
        input.acquisition_price_cents || null,
        input.acquisition_source || null,
        input.owner_id || null,
        input.assigned_to_id || null,
        input.notes || null,
        input.tags || [],
        JSON.stringify(input.metadata || {}),
        true, // New assets are vacant by default
        input.acquisition_date || new Date().toISOString().split('T')[0],
      ]
    );
    return mapRow(result.rows[0]);
  }

  /**
   * Update asset (does not change state)
   */
  static async update(
    id: string,
    tenantId: string,
    input: UpdateRealEstateAssetInput
  ): Promise<RealEstateAsset> {
    requireTenantId(tenantId, 'RealEstateAssetModel.update');
    
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (input.property_address !== undefined) {
      updates.push(`property_address = $${paramCount++}`);
      values.push(input.property_address);
    }
    if (input.property_type !== undefined) {
      updates.push(`property_type = $${paramCount++}`);
      values.push(input.property_type);
    }
    if (input.property_size_sqm !== undefined) {
      updates.push(`property_size_sqm = $${paramCount++}`);
      values.push(input.property_size_sqm);
    }
    if (input.number_of_rooms !== undefined) {
      updates.push(`number_of_rooms = $${paramCount++}`);
      values.push(input.number_of_rooms);
    }
    if (input.number_of_bathrooms !== undefined) {
      updates.push(`number_of_bathrooms = $${paramCount++}`);
      values.push(input.number_of_bathrooms);
    }
    if (input.linked_document_ids !== undefined) {
      updates.push(`linked_document_ids = $${paramCount++}`);
      values.push(input.linked_document_ids);
    }
    if (input.linked_financial_record_ids !== undefined) {
      updates.push(`linked_financial_record_ids = $${paramCount++}`);
      values.push(input.linked_financial_record_ids);
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
    if (input.owner_id !== undefined) {
      updates.push(`owner_id = $${paramCount++}`);
      values.push(input.owner_id);
    }
    if (input.assigned_to_id !== undefined) {
      updates.push(`assigned_to_id = $${paramCount++}`);
      values.push(input.assigned_to_id);
    }

    if (updates.length === 0) {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundError('Real estate asset');
      }
      return existing;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id, tenantId);

    const result: QueryResult<RealEstateAsset> = await db.query<RealEstateAsset>(
      `UPDATE real_estate_assets 
       SET ${updates.join(', ')}
       WHERE id = $${paramCount++} AND tenant_id = $${paramCount++} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Real estate asset');
    }

    return mapRow(result.rows[0]);
  }

  /**
   * Transition asset state (with validation)
   */
  static async transitionState(
    id: string,
    tenantId: string,
    userId: string,
    input: TransitionStateInput
  ): Promise<RealEstateAsset> {
    requireTenantId(tenantId, 'RealEstateAssetModel.transitionState');
    
    // Get current asset
    const asset = await this.findById(id, tenantId);
    if (!asset) {
      throw new NotFoundError('Real estate asset');
    }

    // Validate transition
    if (!isValidTransition(asset.current_state, input.to_state)) {
      const validNext = getValidNextStates(asset.current_state);
      throw new InvalidTransitionError(
        `Invalid state transition from ${asset.current_state} to ${input.to_state}. ` +
        `Valid next states: ${validNext.join(', ')}`
      );
    }

    // Prepare update based on target state
    const stateUpdates: string[] = [
      `current_state = $1`,
      `state_changed_at = CURRENT_TIMESTAMP`,
      `state_changed_by = $2`,
      `state_change_reason = $3`,
      `updated_at = CURRENT_TIMESTAMP`,
    ];
    const stateValues: unknown[] = [input.to_state, userId, input.reason || null];

    // Handle SOLD state
    if (input.to_state === 'SOLD') {
      if (input.sale_date) {
        stateUpdates.push(`sale_date = $${stateValues.length + 1}`);
        stateValues.push(input.sale_date);
      }
      if (input.sale_price_cents !== undefined) {
        stateUpdates.push(`sale_price_cents = $${stateValues.length + 1}`);
        stateValues.push(input.sale_price_cents);
      }
      if (input.sale_buyer_name) {
        stateUpdates.push(`sale_buyer_name = $${stateValues.length + 1}`);
        stateValues.push(input.sale_buyer_name);
      }
      // Mark as not vacant when sold
      stateUpdates.push(`is_vacant = false`);
    }

    // Handle RENTED state
    if (input.to_state === 'RENTED') {
      if (input.rental_start_date) {
        stateUpdates.push(`rental_start_date = $${stateValues.length + 1}`);
        stateValues.push(input.rental_start_date);
      }
      if (input.rental_end_date) {
        stateUpdates.push(`rental_end_date = $${stateValues.length + 1}`);
        stateValues.push(input.rental_end_date);
      }
      if (input.rental_monthly_amount_cents !== undefined) {
        stateUpdates.push(`rental_monthly_amount_cents = $${stateValues.length + 1}`);
        stateValues.push(input.rental_monthly_amount_cents);
      }
      if (input.rental_tenant_name) {
        stateUpdates.push(`rental_tenant_name = $${stateValues.length + 1}`);
        stateValues.push(input.rental_tenant_name);
      }
      // Mark as not vacant when rented
      stateUpdates.push(`is_vacant = false`);
    }

    // Handle READY state (can become vacant)
    if (input.to_state === 'READY') {
      stateUpdates.push(`is_vacant = true`);
      stateUpdates.push(`vacancy_start_date = CURRENT_DATE`);
      stateUpdates.push(`vacancy_alert_sent = false`);
    }

    stateValues.push(id, tenantId);

    // Update asset state
    const result: QueryResult<RealEstateAsset> = await db.query<RealEstateAsset>(
      `UPDATE real_estate_assets 
       SET ${stateUpdates.join(', ')}
       WHERE id = $${stateValues.length - 1} AND tenant_id = $${stateValues.length} AND deleted_at IS NULL
       RETURNING *`,
      stateValues
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Real estate asset');
    }

    // Log state transition
    await db.query(
      `INSERT INTO asset_state_transitions 
       (tenant_id, real_estate_asset_id, from_state, to_state, transitioned_by, transition_reason, is_valid)
       VALUES ($1, $2, $3, $4, $5, $6, true)`,
      [tenantId, id, asset.current_state, input.to_state, userId, input.reason || null]
    );

    return mapRow(result.rows[0]);
  }

  /**
   * Update vacancy status
   */
  static async updateVacancy(
    id: string,
    tenantId: string,
    isVacant: boolean
  ): Promise<RealEstateAsset> {
    requireTenantId(tenantId, 'RealEstateAssetModel.updateVacancy');
    
    const updates: string[] = [];
    const values: unknown[] = [];

    if (isVacant) {
      updates.push(`is_vacant = true`);
      updates.push(`vacancy_start_date = CURRENT_DATE`);
      updates.push(`vacancy_alert_sent = false`);
    } else {
      updates.push(`is_vacant = false`);
      updates.push(`vacancy_start_date = NULL`);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id, tenantId);

    const result: QueryResult<RealEstateAsset> = await db.query<RealEstateAsset>(
      `UPDATE real_estate_assets 
       SET ${updates.join(', ')}
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Real estate asset');
    }

    return mapRow(result.rows[0]);
  }
}
