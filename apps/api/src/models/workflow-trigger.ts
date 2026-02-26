import { db } from './database.js';
import { QueryResult } from 'pg';
import { TenantRequiredError, NotFoundError } from '../utils/errors.js';

export type WorkflowActionType = 'create_task' | 'send_notification' | 'block_transition';

export interface WorkflowTrigger {
  id: string;
  tenant_id: string;
  name: string | null;
  event_type: string;
  condition: Record<string, unknown>;
  action_type: WorkflowActionType;
  action_config: Record<string, unknown>;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateWorkflowTriggerInput {
  tenant_id: string;
  name?: string;
  event_type: string;
  condition: Record<string, unknown>;
  action_type: WorkflowActionType;
  action_config: Record<string, unknown>;
}

function requireTenantId(tenantId: string | undefined | null, operation: string): asserts tenantId is string {
  if (!tenantId) throw new TenantRequiredError(operation);
}

function mapRow(row: any): WorkflowTrigger {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    name: (row.name as string) ?? null,
    event_type: row.event_type as string,
    condition: (row.condition as Record<string, unknown>) ?? {},
    action_type: row.action_type as WorkflowActionType,
    action_config: (row.action_config as Record<string, unknown>) ?? {},
    is_active: row.is_active === true,
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
  };
}

export class WorkflowTriggerModel {
  static async listByEventType(tenantId: string, eventType: string): Promise<WorkflowTrigger[]> {
    requireTenantId(tenantId, 'WorkflowTriggerModel.listByEventType');
    const result: QueryResult<Record<string, unknown>> = await db.query(
      `SELECT * FROM workflow_triggers WHERE tenant_id = $1 AND event_type = $2 AND is_active = true ORDER BY created_at`,
      [tenantId, eventType]
    );
    return result.rows.map(mapRow);
  }

  static async findById(id: string, tenantId: string): Promise<WorkflowTrigger | null> {
    requireTenantId(tenantId, 'WorkflowTriggerModel.findById');
    const result: QueryResult<Record<string, unknown>> = await db.query(
      `SELECT * FROM workflow_triggers WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  static async listByTenant(
    tenantId: string,
    options: { event_type?: string; limit?: number; offset?: number } = {}
  ): Promise<WorkflowTrigger[]> {
    requireTenantId(tenantId, 'WorkflowTriggerModel.listByTenant');
    let query = `SELECT * FROM workflow_triggers WHERE tenant_id = $1`;
    const params: unknown[] = [tenantId];
    let idx = 2;
    if (options.event_type) {
      query += ` AND event_type = $${idx++}`;
      params.push(options.event_type);
    }
    query += ` ORDER BY created_at DESC`;
    const limit = Math.min(options.limit ?? 50, 100);
    const offset = options.offset ?? 0;
    query += ` LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(limit, offset);
    const result: QueryResult<Record<string, unknown>> = await db.query(query, params);
    return result.rows.map(mapRow);
  }

  static async create(input: CreateWorkflowTriggerInput): Promise<WorkflowTrigger> {
    requireTenantId(input.tenant_id, 'WorkflowTriggerModel.create');
    const result: QueryResult<Record<string, unknown>> = await db.query(
      `INSERT INTO workflow_triggers (tenant_id, name, event_type, condition, action_type, action_config)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        input.tenant_id,
        input.name ?? null,
        input.event_type,
        JSON.stringify(input.condition),
        input.action_type,
        JSON.stringify(input.action_config ?? {}),
      ]
    );
    return mapRow(result.rows[0]);
  }

  static async updateActive(id: string, tenantId: string, isActive: boolean): Promise<WorkflowTrigger | null> {
    requireTenantId(tenantId, 'WorkflowTriggerModel.updateActive');
    const result: QueryResult<Record<string, unknown>> = await db.query(
      `UPDATE workflow_triggers SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [isActive, id, tenantId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }
}

export class WorkflowTaskModel {
  static async create(
    tenantId: string,
    taskType: string,
    title: string,
    options: {
      description?: string;
      related_entity_type?: string;
      related_entity_id?: string;
      trigger_id?: string;
    } = {}
  ): Promise<{ id: string }> {
    requireTenantId(tenantId, 'WorkflowTaskModel.create');
    const result: QueryResult<Record<string, unknown>> = await db.query(
      `INSERT INTO workflow_tasks (tenant_id, task_type, title, description, related_entity_type, related_entity_id, trigger_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        tenantId,
        taskType,
        title,
        options.description ?? null,
        options.related_entity_type ?? null,
        options.related_entity_id ?? null,
        options.trigger_id ?? null,
      ]
    );
    return { id: result.rows[0].id as string };
  }
}

export class WorkflowNotificationModel {
  static async create(
    tenantId: string,
    message: string,
    options: { channel?: string; recipient_user_id?: string; trigger_id?: string } = {}
  ): Promise<{ id: string }> {
    requireTenantId(tenantId, 'WorkflowNotificationModel.create');
    const result: QueryResult<Record<string, unknown>> = await db.query(
      `INSERT INTO workflow_notifications (tenant_id, channel, message, recipient_user_id, trigger_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        tenantId,
        options.channel ?? 'alert',
        message,
        options.recipient_user_id ?? null,
        options.trigger_id ?? null,
      ]
    );
    return { id: result.rows[0].id as string };
  }
}
