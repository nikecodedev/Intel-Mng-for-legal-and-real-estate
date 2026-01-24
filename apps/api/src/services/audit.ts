import { db } from '../models/database';
import { logger } from '../utils/logger';
import { Request } from 'express';

/**
 * Audit log event types
 */
export enum AuditEventType {
  // Authentication
  USER_LOGIN = 'user.login',
  USER_LOGOUT = 'user.logout',
  USER_REGISTER = 'user.register',
  PASSWORD_CHANGE = 'user.password_change',
  PASSWORD_RESET = 'user.password_reset',
  
  // Authorization
  PERMISSION_GRANT = 'permission.grant',
  PERMISSION_REVOKE = 'permission.revoke',
  ROLE_ASSIGN = 'role.assign',
  ROLE_REVOKE = 'role.revoke',
  
  // Data operations
  CREATE = 'data.create',
  READ = 'data.read',
  UPDATE = 'data.update',
  DELETE = 'data.delete',
  EXPORT = 'data.export',
  IMPORT = 'data.import',
  
  // System
  SYSTEM_CONFIG_CHANGE = 'system.config_change',
  SYSTEM_BACKUP = 'system.backup',
  SYSTEM_RESTORE = 'system.restore',
}

/**
 * Audit log event categories
 */
export enum AuditEventCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  DATA_ACCESS = 'data_access',
  DATA_MODIFICATION = 'data_modification',
  SYSTEM = 'system',
  COMPLIANCE = 'compliance',
}

/**
 * Audit log action types
 */
export enum AuditAction {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  LOGIN = 'login',
  LOGOUT = 'logout',
  GRANT = 'grant',
  REVOKE = 'revoke',
  EXPORT = 'export',
  IMPORT = 'import',
  APPROVE = 'approve',
  REJECT = 'reject',
}

/**
 * Audit log entry interface
 */
export interface AuditLogEntry {
  tenant_id?: string;
  event_type: string;
  event_category: AuditEventCategory;
  action: AuditAction;
  user_id?: string;
  user_email?: string;
  user_role?: string;
  resource_type?: string;
  resource_id?: string;
  target_resource_id?: string;
  resource_identifier?: string;
  description?: string;
  payload_evento?: Record<string, unknown>;
  details?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  request_id?: string;
  session_id?: string;
  success?: boolean;
  error_code?: string;
  error_message?: string;
  compliance_flags?: string[];
  retention_category?: string;
}

/**
 * Audit Service
 * Handles all audit logging operations
 * Server-side only - no client trust
 */
export class AuditService {
  private static readonly DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000000';

  private static getTenantIdFromRequest(request?: Request): string | undefined {
    if (!request) return undefined;
    const headerValue = request.headers['x-tenant-id'];
    if (Array.isArray(headerValue)) return headerValue[0];
    return headerValue as string | undefined;
  }

  /**
   * Log an audit event
   * This is the only way to create audit logs - ensures immutability
   */
  static async log(entry: AuditLogEntry): Promise<void> {
    try {
      // Validate required fields
      if (!entry.event_type || !entry.event_category || !entry.action) {
        logger.error('Invalid audit log entry - missing required fields', { entry });
        return;
      }

      const tenantId = entry.tenant_id || AuditService.DEFAULT_TENANT_ID;
      const detailsPayload = entry.details || {};
      const payloadEvento = entry.payload_evento || detailsPayload;

      // Insert audit log (append-only)
      await db.query(
        `INSERT INTO audit_logs (
          tenant_id,
          event_type, event_category, action,
          user_id, user_email, user_role,
          resource_type, resource_id, target_resource_id, resource_identifier,
          description, payload_evento, details,
          ip_address, user_agent, request_id, session_id,
          success, error_code, error_message,
          compliance_flags, retention_category
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
        )`,
        [
          tenantId,
          entry.event_type,
          entry.event_category,
          entry.action,
          entry.user_id || null,
          entry.user_email || null,
          entry.user_role || null,
          entry.resource_type || null,
          entry.resource_id || null,
          entry.target_resource_id || entry.resource_id || null,
          entry.resource_identifier || null,
          entry.description || null,
          JSON.stringify(payloadEvento),
          JSON.stringify(detailsPayload),
          entry.ip_address || null,
          entry.user_agent || null,
          entry.request_id || null,
          entry.session_id || null,
          entry.success !== undefined ? entry.success : true,
          entry.error_code || null,
          entry.error_message || null,
          entry.compliance_flags || null,
          entry.retention_category || null,
        ]
      );

      logger.debug('Audit log created', {
        event_type: entry.event_type,
        resource_type: entry.resource_type,
        resource_id: entry.resource_id,
      });
    } catch (error) {
      // Never throw - audit logging should never break the application
      // But log the error for monitoring
      logger.error('Failed to create audit log', {
        error,
        entry: {
          event_type: entry.event_type,
          resource_type: entry.resource_type,
          resource_id: entry.resource_id,
        },
      });
    }
  }

  /**
   * Log data modification (create, update, delete)
   */
  static async logDataModification(
    action: AuditAction.CREATE | AuditAction.UPDATE | AuditAction.DELETE,
    resourceType: string,
    resourceId: string,
    userId: string,
    userEmail: string,
    userRole: string | undefined,
    request: Request,
    details?: Record<string, unknown>,
    resourceIdentifier?: string
  ): Promise<void> {
    const tenantId = this.getTenantIdFromRequest(request);
    const eventType = `data.${action}`;
    const eventCategory =
      action === AuditAction.DELETE
        ? AuditEventCategory.DATA_MODIFICATION
        : AuditEventCategory.DATA_MODIFICATION;

    await this.log({
      tenant_id: tenantId,
      event_type: eventType,
      event_category: eventCategory,
      action,
      user_id: userId,
      user_email: userEmail,
      user_role: userRole,
      resource_type: resourceType,
      resource_id: resourceId,
      resource_identifier: resourceIdentifier,
      description: `${action} ${resourceType} ${resourceId}`,
      details: {
        ...details,
        method: request.method,
        path: request.path,
        body: this.sanitizeRequestBody(request.body),
      },
      ip_address: request.ip || request.socket.remoteAddress,
      user_agent: request.get('user-agent'),
      request_id: request.headers['x-request-id'] as string,
      session_id: request.headers['x-session-id'] as string,
      success: true,
      compliance_flags: this.getComplianceFlags(resourceType),
      retention_category: this.getRetentionCategory(resourceType),
    });
  }

  /**
   * Log data access (read)
   */
  static async logDataAccess(
    resourceType: string,
    resourceId: string | null,
    userId: string,
    userEmail: string,
    userRole: string | undefined,
    request: Request,
    details?: Record<string, unknown>
  ): Promise<void> {
    const tenantId = this.getTenantIdFromRequest(request);
    await this.log({
      tenant_id: tenantId,
      event_type: AuditEventType.READ,
      event_category: AuditEventCategory.DATA_ACCESS,
      action: AuditAction.READ,
      user_id: userId,
      user_email: userEmail,
      user_role: userRole,
      resource_type: resourceType,
      resource_id: resourceId || undefined,
      description: `read ${resourceType}${resourceId ? ` ${resourceId}` : ''}`,
      details: {
        ...details,
        method: request.method,
        path: request.path,
        query: request.query,
      },
      ip_address: request.ip || request.socket.remoteAddress,
      user_agent: request.get('user-agent'),
      request_id: request.headers['x-request-id'] as string,
      session_id: request.headers['x-session-id'] as string,
      success: true,
      compliance_flags: this.getComplianceFlags(resourceType),
      retention_category: this.getRetentionCategory(resourceType),
    });
  }

  /**
   * Log authentication event
   */
  static async logAuthentication(
    eventType: AuditEventType.USER_LOGIN | AuditEventType.USER_LOGOUT | AuditEventType.USER_REGISTER,
    userId: string | undefined,
    userEmail: string,
    request: Request,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    const tenantId = this.getTenantIdFromRequest(request);
    await this.log({
      tenant_id: tenantId,
      event_type: eventType,
      event_category: AuditEventCategory.AUTHENTICATION,
      action:
        eventType === AuditEventType.USER_LOGIN
          ? AuditAction.LOGIN
          : eventType === AuditEventType.USER_LOGOUT
          ? AuditAction.LOGOUT
          : AuditAction.CREATE,
      user_id: userId,
      user_email: userEmail,
      description: `${eventType} ${success ? 'succeeded' : 'failed'}`,
      details: {
        email: userEmail,
        success,
      },
      ip_address: request.ip || request.socket.remoteAddress,
      user_agent: request.get('user-agent'),
      request_id: request.headers['x-request-id'] as string,
      session_id: request.headers['x-session-id'] as string,
      success,
      error_message: errorMessage,
      compliance_flags: ['gdpr', 'authentication'],
      retention_category: 'authentication',
    });
  }

  /**
   * Log authorization event (permission/role changes)
   */
  static async logAuthorization(
    action: AuditAction.GRANT | AuditAction.REVOKE,
    resourceType: 'permission' | 'role',
    resourceId: string,
    targetUserId: string,
    targetUserEmail: string,
    userId: string,
    userEmail: string,
    request: Request,
    details?: Record<string, unknown>
  ): Promise<void> {
    const tenantId = this.getTenantIdFromRequest(request);
    await this.log({
      tenant_id: tenantId,
      event_type: action === AuditAction.GRANT ? AuditEventType.PERMISSION_GRANT : AuditEventType.PERMISSION_REVOKE,
      event_category: AuditEventCategory.AUTHORIZATION,
      action,
      user_id: userId,
      user_email: userEmail,
      resource_type: resourceType,
      resource_id: resourceId,
      description: `${action} ${resourceType} ${resourceId} for user ${targetUserEmail}`,
      details: {
        ...details,
        target_user_id: targetUserId,
        target_user_email: targetUserEmail,
      },
      ip_address: request.ip || request.socket.remoteAddress,
      user_agent: request.get('user-agent'),
      request_id: request.headers['x-request-id'] as string,
      success: true,
      compliance_flags: ['gdpr', 'authorization'],
      retention_category: 'authorization',
    });
  }

  /**
   * Sanitize request body for audit logging
   * Removes sensitive information like passwords
   */
  private static sanitizeRequestBody(body: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...body };
    const sensitiveFields = ['password', 'password_hash', 'token', 'secret', 'api_key', 'credit_card', 'ssn'];

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Get compliance flags based on resource type
   */
  private static getComplianceFlags(resourceType: string): string[] {
    const flags: string[] = [];

    // GDPR applies to user data
    if (resourceType === 'user' || resourceType === 'users') {
      flags.push('gdpr');
    }

    // HIPAA applies to health/medical data
    if (resourceType.includes('medical') || resourceType.includes('health')) {
      flags.push('hipaa');
    }

    // SOX applies to financial data
    if (resourceType.includes('financial') || resourceType.includes('transaction')) {
      flags.push('sox');
    }

    return flags.length > 0 ? flags : ['general'];
  }

  /**
   * Get retention category based on resource type
   */
  private static getRetentionCategory(resourceType: string): string {
    const categories: Record<string, string> = {
      user: 'user_data',
      users: 'user_data',
      audit: 'audit_log',
      audit_logs: 'audit_log',
      financial: 'financial',
      transaction: 'financial',
      medical: 'medical',
      health: 'medical',
    };

    return categories[resourceType.toLowerCase()] || 'general';
  }
}


