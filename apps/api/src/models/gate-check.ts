import { db } from './database';
import { QueryResult } from 'pg';
import { TenantRequiredError, NotFoundError } from '../utils/errors';

export type CheckStatus = 'PENDING' | 'PASSED' | 'FAILED' | 'OVERRIDDEN' | 'SKIPPED';
export type ResourceType = 'PROCESS' | 'AUCTION_ASSET' | 'REAL_ESTATE_ASSET' | 'DOCUMENT';

export interface GateCheck {
  id: string;
  tenant_id: string;
  quality_gate_id: string;
  resource_type: ResourceType;
  resource_id: string;
  check_status: CheckStatus;
  check_result: Record<string, unknown> | null;
  failure_reason: string | null;
  failure_details: Record<string, unknown> | null;
  is_overridden: boolean;
  overridden_by: string | null;
  overridden_at: Date | null;
  override_reason: string | null;
  override_approval_required: boolean;
  override_approved_by: string | null;
  checked_at: Date | null;
  checked_by: string | null;
  check_duration_ms: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateGateCheckInput {
  tenant_id: string;
  quality_gate_id: string;
  resource_type: ResourceType;
  resource_id: string;
}

export interface UpdateGateCheckInput {
  check_status: CheckStatus;
  check_result?: Record<string, unknown>;
  failure_reason?: string;
  failure_details?: Record<string, unknown>;
}

function requireTenantId(tenantId: string | undefined | null, operation: string): asserts tenantId is string {
  if (!tenantId) {
    throw new TenantRequiredError(operation);
  }
}

function mapRow(row: Record<string, unknown>): GateCheck {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    quality_gate_id: row.quality_gate_id as string,
    resource_type: row.resource_type as ResourceType,
    resource_id: row.resource_id as string,
    check_status: row.check_status as CheckStatus,
    check_result: row.check_result ? (row.check_result as Record<string, unknown>) : null,
    failure_reason: (row.failure_reason as string) ?? null,
    failure_details: row.failure_details ? (row.failure_details as Record<string, unknown>) : null,
    is_overridden: Boolean(row.is_overridden),
    overridden_by: (row.overridden_by as string) ?? null,
    overridden_at: row.overridden_at ? new Date(row.overridden_at as string) : null,
    override_reason: (row.override_reason as string) ?? null,
    override_approval_required: Boolean(row.override_approval_required),
    override_approved_by: (row.override_approved_by as string) ?? null,
    checked_at: row.checked_at ? new Date(row.checked_at as string) : null,
    checked_by: (row.checked_by as string) ?? null,
    check_duration_ms: row.check_duration_ms ? Number(row.check_duration_ms) : null,
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
  };
}

/**
 * Gate Check Model
 * Manages gate checks for resources
 */
export class GateCheckModel {
  /**
   * Find check by ID within tenant
   */
  static async findById(id: string, tenantId: string): Promise<GateCheck | null> {
    requireTenantId(tenantId, 'GateCheckModel.findById');
    
    const result: QueryResult<GateCheck> = await db.query<GateCheck>(
      `SELECT * FROM gate_checks 
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /**
   * Find checks for a resource
   */
  static async findByResource(
    resourceType: ResourceType,
    resourceId: string,
    tenantId: string
  ): Promise<GateCheck[]> {
    requireTenantId(tenantId, 'GateCheckModel.findByResource');
    
    const result: QueryResult<GateCheck> = await db.query<GateCheck>(
      `SELECT * FROM gate_checks 
       WHERE resource_type = $1 AND resource_id = $2 AND tenant_id = $3
       ORDER BY created_at DESC`,
      [resourceType, resourceId, tenantId]
    );
    return result.rows.map(mapRow);
  }

  /**
   * Create new gate check
   */
  static async create(input: CreateGateCheckInput): Promise<GateCheck> {
    requireTenantId(input.tenant_id, 'GateCheckModel.create');
    
    const result: QueryResult<GateCheck> = await db.query<GateCheck>(
      `INSERT INTO gate_checks 
       (tenant_id, quality_gate_id, resource_type, resource_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.tenant_id, input.quality_gate_id, input.resource_type, input.resource_id]
    );
    return mapRow(result.rows[0]);
  }

  /**
   * Update gate check result
   */
  static async updateResult(
    id: string,
    tenantId: string,
    userId: string,
    input: UpdateGateCheckInput
  ): Promise<GateCheck> {
    requireTenantId(tenantId, 'GateCheckModel.updateResult');
    
    // Validate failure_reason is provided if status is FAILED
    if (input.check_status === 'FAILED' && !input.failure_reason) {
      throw new Error('failure_reason is required when check_status is FAILED');
    }

    const updates: string[] = [
      'check_status = $1',
      'checked_by = $2',
      'checked_at = CURRENT_TIMESTAMP',
      'updated_at = CURRENT_TIMESTAMP',
    ];
    const values: unknown[] = [input.check_status, userId];

    if (input.check_result !== undefined) {
      updates.push(`check_result = $${values.length + 1}`);
      values.push(JSON.stringify(input.check_result));
    }
    if (input.failure_reason !== undefined) {
      updates.push(`failure_reason = $${values.length + 1}`);
      values.push(input.failure_reason);
    }
    if (input.failure_details !== undefined) {
      updates.push(`failure_details = $${values.length + 1}`);
      values.push(JSON.stringify(input.failure_details));
    }

    values.push(id, tenantId);

    const result: QueryResult<GateCheck> = await db.query<GateCheck>(
      `UPDATE gate_checks 
       SET ${updates.join(', ')}
       WHERE id = $${values.length - 1} AND tenant_id = $${values.length}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Gate check');
    }

    return mapRow(result.rows[0]);
  }
}
