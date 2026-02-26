import { db } from './database.js';
import { QueryResult } from 'pg';
import { TenantRequiredError, NotFoundError } from '../utils/errors.js';

export type GateType = 'DOCUMENT' | 'APPROVAL' | 'RISK_SCORE' | 'CUSTOM' | 'DATA_COMPLETENESS' | 'VALIDATION';
export type FailureAction = 'BLOCK' | 'WARN' | 'REQUIRE_OVERRIDE';

export interface QualityGate {
  id: string;
  tenant_id: string;
  gate_code: string;
  gate_name: string;
  description: string | null;
  gate_type: GateType;
  gate_category: string | null;
  gate_rules: Record<string, unknown>;
  is_blocking: boolean;
  is_mandatory: boolean;
  failure_action: FailureAction;
  is_active: boolean;
  priority: number;
  applies_to_process_types: string[];
  applies_to_stages: string[];
  created_by: string | null;
  updated_by: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  deleted_by: string | null;
}

export interface CreateQualityGateInput {
  tenant_id: string;
  gate_code: string; // 'QG1', 'QG2', etc.
  gate_name: string;
  description?: string;
  gate_type: GateType;
  gate_category?: string;
  gate_rules: Record<string, unknown>;
  is_blocking?: boolean;
  is_mandatory?: boolean;
  failure_action?: FailureAction;
  priority?: number;
  applies_to_process_types?: string[];
  applies_to_stages?: string[];
  metadata?: Record<string, unknown>;
}

function requireTenantId(tenantId: string | undefined | null, operation: string): asserts tenantId is string {
  if (!tenantId) {
    throw new TenantRequiredError(operation);
  }
}

function mapRow(row: any): QualityGate {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    gate_code: row.gate_code as string,
    gate_name: row.gate_name as string,
    description: (row.description as string) ?? null,
    gate_type: row.gate_type as GateType,
    gate_category: (row.gate_category as string) ?? null,
    gate_rules: (row.gate_rules as Record<string, unknown>) || {},
    is_blocking: Boolean(row.is_blocking),
    is_mandatory: Boolean(row.is_mandatory),
    failure_action: (row.failure_action as FailureAction) || 'BLOCK',
    is_active: Boolean(row.is_active),
    priority: Number(row.priority) || 50,
    applies_to_process_types: Array.isArray(row.applies_to_process_types) 
      ? (row.applies_to_process_types as string[]) : [],
    applies_to_stages: Array.isArray(row.applies_to_stages) 
      ? (row.applies_to_stages as string[]) : [],
    created_by: (row.created_by as string) ?? null,
    updated_by: (row.updated_by as string) ?? null,
    metadata: (row.metadata as Record<string, unknown>) || {},
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
    deleted_at: row.deleted_at ? new Date(row.deleted_at as string) : null,
    deleted_by: (row.deleted_by as string) ?? null,
  };
}

/**
 * Quality Gate Model
 * Manages quality gates (QG1-QG4 and custom gates)
 */
export class QualityGateModel {
  /**
   * Find gate by ID within tenant
   */
  static async findById(id: string, tenantId: string): Promise<QualityGate | null> {
    requireTenantId(tenantId, 'QualityGateModel.findById');
    
    const result: QueryResult<QualityGate> = await db.query<QualityGate>(
      `SELECT * FROM quality_gates 
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /**
   * Find gate by code within tenant
   */
  static async findByCode(gateCode: string, tenantId: string): Promise<QualityGate | null> {
    requireTenantId(tenantId, 'QualityGateModel.findByCode');
    
    const result: QueryResult<QualityGate> = await db.query<QualityGate>(
      `SELECT * FROM quality_gates 
       WHERE gate_code = $1 AND tenant_id = $2 AND deleted_at IS NULL AND is_active = true`,
      [gateCode, tenantId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /**
   * List gates with filters
   */
  static async list(
    tenantId: string,
    filters?: {
      gate_type?: GateType;
      gate_category?: string;
      is_active?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ gates: QualityGate[]; total: number }> {
    requireTenantId(tenantId, 'QualityGateModel.list');
    
    const conditions: string[] = ['tenant_id = $1', 'deleted_at IS NULL'];
    const values: unknown[] = [tenantId];
    let paramCount = 2;

    if (filters?.gate_type) {
      conditions.push(`gate_type = $${paramCount++}`);
      values.push(filters.gate_type);
    }
    if (filters?.gate_category) {
      conditions.push(`gate_category = $${paramCount++}`);
      values.push(filters.gate_category);
    }
    if (filters?.is_active !== undefined) {
      conditions.push(`is_active = $${paramCount++}`);
      values.push(filters.is_active);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM quality_gates WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated results
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;
    values.push(limit, offset);

    const result: QueryResult<QualityGate> = await db.query<QualityGate>(
      `SELECT * FROM quality_gates 
       WHERE ${whereClause}
       ORDER BY priority ASC, gate_code ASC
       LIMIT $${paramCount++} OFFSET $${paramCount++}`,
      values
    );

    return {
      gates: result.rows.map(mapRow),
      total,
    };
  }

  /**
   * Get gates applicable to a resource
   */
  static async getApplicableGates(
    tenantId: string,
    processType?: string,
    stage?: string
  ): Promise<QualityGate[]> {
    requireTenantId(tenantId, 'QualityGateModel.getApplicableGates');
    
    const conditions: string[] = [
      'tenant_id = $1',
      'deleted_at IS NULL',
      'is_active = true',
    ];
    const values: unknown[] = [tenantId];
    let paramCount = 2;

    // Check if gate applies to process type
    if (processType) {
      conditions.push(
        `(applies_to_process_types = '{}' OR $${paramCount++} = ANY(applies_to_process_types))`
      );
      values.push(processType);
    }

    // Check if gate applies to stage
    if (stage) {
      conditions.push(
        `(applies_to_stages = '{}' OR $${paramCount++} = ANY(applies_to_stages))`
      );
      values.push(stage);
    }

    const whereClause = conditions.join(' AND ');

    const result: QueryResult<QualityGate> = await db.query<QualityGate>(
      `SELECT * FROM quality_gates 
       WHERE ${whereClause}
       ORDER BY priority ASC, gate_code ASC`,
      values
    );

    return result.rows.map(mapRow);
  }

  /**
   * Create new quality gate
   */
  static async create(input: CreateQualityGateInput, userId: string): Promise<QualityGate> {
    requireTenantId(input.tenant_id, 'QualityGateModel.create');
    
    const result: QueryResult<QualityGate> = await db.query<QualityGate>(
      `INSERT INTO quality_gates 
       (tenant_id, gate_code, gate_name, description, gate_type, gate_category,
        gate_rules, is_blocking, is_mandatory, failure_action, priority,
        applies_to_process_types, applies_to_stages, created_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        input.tenant_id,
        input.gate_code,
        input.gate_name,
        input.description || null,
        input.gate_type,
        input.gate_category || null,
        JSON.stringify(input.gate_rules),
        input.is_blocking !== false,
        input.is_mandatory !== false,
        input.failure_action || 'BLOCK',
        input.priority || 50,
        input.applies_to_process_types || [],
        input.applies_to_stages || [],
        userId,
        JSON.stringify(input.metadata || {}),
      ]
    );
    return mapRow(result.rows[0]);
  }
}
