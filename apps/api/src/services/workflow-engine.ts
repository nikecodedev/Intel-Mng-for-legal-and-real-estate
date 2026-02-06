/**
 * Event-driven workflow engine. Deterministic rules only; no AI-generated actions.
 * All actions are audited.
 */

import { AuditService, AuditAction, AuditEventCategory } from './audit';
import { WorkflowTriggerModel, WorkflowTaskModel, WorkflowNotificationModel, type WorkflowTrigger } from '../models/workflow-trigger';
import type { Request } from 'express';

export type WorkflowActionResult =
  | { allowed: true }
  | { allowed: false; blockedBy: string; message: string };

/** Deterministic condition: op + field + optional value. Evaluated against event payload. */
export function evaluateCondition(condition: Record<string, unknown>, payload: Record<string, unknown>): boolean {
  const op = condition.op as string | undefined;
  const field = condition.field as string | undefined;
  if (!op || !field) return false;

  const raw = payload[field];
  const value = condition.value;

  switch (op) {
    case 'eq':
      return raw === value;
    case 'not_eq':
      return raw !== value;
    case 'present':
      return raw != null && raw !== '';
    case 'not_present':
      return raw == null || raw === '';
    case 'days_until_lte': {
      if (raw == null) return false;
      const dateStr = typeof raw === 'string' ? raw : String(raw);
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;
      const days = Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      const maxDays = typeof value === 'number' ? value : parseInt(String(value), 10);
      return !isNaN(maxDays) && days <= maxDays;
    }
    case 'days_until_lt': {
      if (raw == null) return false;
      const dateStr = typeof raw === 'string' ? raw : String(raw);
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;
      const days = Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      const maxDays = typeof value === 'number' ? value : parseInt(String(value), 10);
      return !isNaN(maxDays) && days < maxDays;
    }
    default:
      return false;
  }
}

export interface WorkflowEventContext {
  tenantId: string;
  eventType: string;
  payload: Record<string, unknown>;
  userId?: string;
  userEmail?: string;
  userRole?: string;
  request?: Request;
}

export interface WorkflowRunResult {
  allowed: boolean;
  blockMessage?: string;
  triggered: Array<{ triggerId: string; actionType: string; result: string }>;
}

/**
 * Run workflow for an event. Evaluates all active triggers for event_type,
 * executes actions (create_task, send_notification, block_transition).
 * block_transition blocks the whole run and is audited; other actions are executed and audited.
 * Returns whether the transition/action is allowed (false if any trigger blocked).
 */
export async function runWorkflow(ctx: WorkflowEventContext): Promise<WorkflowRunResult> {
  const triggers = await WorkflowTriggerModel.listByEventType(ctx.tenantId, ctx.eventType);
  const triggered: WorkflowRunResult['triggered'] = [];
  let blockMessage: string | undefined;

  for (const trigger of triggers) {
    if (!evaluateCondition(trigger.condition, ctx.payload)) continue;

    const actionResult = await executeAction(trigger, ctx);
    triggered.push({
      triggerId: trigger.id,
      actionType: trigger.action_type,
      result: actionResult.summary,
    });

    await auditAction(ctx, trigger, actionResult);

    if (trigger.action_type === 'block_transition' && actionResult.success) {
      blockMessage =
        (trigger.action_config?.message as string) ||
        'Action blocked by workflow rule.';
    }
  }

  return {
    allowed: blockMessage == null,
    blockMessage,
    triggered,
  };
}

async function executeAction(
  trigger: WorkflowTrigger,
  ctx: WorkflowEventContext
): Promise<{ success: boolean; summary: string; taskId?: string; notificationId?: string }> {
  try {
    switch (trigger.action_type) {
      case 'create_task': {
        const taskType = (trigger.action_config?.task_type as string) ?? 'legal';
        const title = (trigger.action_config?.title as string) ?? `Workflow task (${trigger.event_type})`;
        const description = (trigger.action_config?.description as string) ?? undefined;
        const relatedType = (ctx.payload?.related_entity_type as string) ?? undefined;
        const relatedId = (ctx.payload?.related_entity_id as string) ?? undefined;
        const created = await WorkflowTaskModel.create(ctx.tenantId, taskType, title, {
          description,
          related_entity_type: relatedType,
          related_entity_id: relatedId,
          trigger_id: trigger.id,
        });
        return {
          success: true,
          summary: `task_created:${created.id}`,
          taskId: created.id,
        };
      }
      case 'send_notification': {
        const message = (trigger.action_config?.message as string) ?? `Notification: ${trigger.event_type}`;
        const channel = (trigger.action_config?.channel as string) ?? 'alert';
        const recipientId = (trigger.action_config?.recipient_user_id as string) ?? (ctx.payload?.recipient_user_id as string) ?? undefined;
        const created = await WorkflowNotificationModel.create(ctx.tenantId, message, {
          channel,
          recipient_user_id: recipientId,
          trigger_id: trigger.id,
        });
        return {
          success: true,
          summary: `notification_created:${created.id}`,
          notificationId: created.id,
        };
      }
      case 'block_transition':
        return {
          success: true,
          summary: 'block_applied',
        };
      default:
        return { success: false, summary: 'unknown_action' };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, summary: `error:${message}` };
  }
}

async function auditAction(
  ctx: WorkflowEventContext,
  trigger: WorkflowTrigger,
  actionResult: { success: boolean; summary: string; taskId?: string; notificationId?: string }
): Promise<void> {
  await AuditService.log({
    tenant_id: ctx.tenantId,
    event_type: 'workflow.action_executed',
    event_category: AuditEventCategory.DATA_MODIFICATION,
    action: AuditAction.CREATE,
    user_id: ctx.userId,
    user_email: ctx.userEmail,
    user_role: ctx.userRole,
    resource_type: 'workflow_trigger',
    resource_id: trigger.id,
    description: `Workflow action: ${trigger.action_type}`,
    details: {
      event_type: ctx.eventType,
      trigger_name: trigger.name,
      action_type: trigger.action_type,
      action_result: actionResult.summary,
      task_id: actionResult.taskId,
      notification_id: actionResult.notificationId,
      payload_keys: Object.keys(ctx.payload),
    },
    ip_address: ctx.request?.ip ?? ctx.request?.socket?.remoteAddress,
    user_agent: ctx.request?.get('user-agent'),
    request_id: ctx.request?.headers?.['x-request-id'] as string | undefined,
    session_id: ctx.request?.headers?.['x-session-id'] as string | undefined,
    success: actionResult.success,
    compliance_flags: ['workflow'],
    retention_category: 'workflow',
  });
}
