import { db } from '../models/database.js';
import { logger } from '../utils/logger.js';
import { Request } from 'express';
import { TenantRequiredError } from '../utils/errors.js';

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
 * tenant_id is REQUIRED - no defaults allowed
 */
export interface AuditLogEntry {
  tenant_id: string; // REQUIRED - no optional
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
 * Audit context extracted from request
 * Contains all tenant-related information needed for audit logging
 */
export interface AuditRequestContext {
  tenantId: string;
  userId?: string;
  userEmail?: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  sessionId?: string;
}

/**
 * Audit Service
 * Handles all audit logging operations with STRICT tenant isolation.
 * 
 * SECURITY PRINCIPLES:
 * 1. tenant_id is ALWAYS required - no defaults, no fallbacks
 * 2. tenant_id MUST come from req.context (set by TenantMiddleware)
 * 3. NEVER trust client headers (x-tenant-id) - they can be spoofed
 * 4. Each tenant has its own hash chain (enforced by DB trigger)
 * 
 * HASH CHAIN ISOLATION:
 * The database trigger `set_audit_log_hash()` maintains a per-tenant hash chain:
 * - Each INSERT selects previous_hash WHERE tenant_id = NEW.tenant_id
 * - This ensures each tenant's audit trail is cryptographically independent
 * - Tampering with one tenant's logs does not affect other tenants
 */
export class AuditService {
  /**
   * Validate tenant_id is present and valid
   * @throws TenantRequiredError if tenantId is missing or invalid
   */
  private static validateTenantId(tenantId: string | undefined | null, operation: string): asserts tenantId is string {
    if (!tenantId) {
      throw new TenantRequiredError(`AuditService.${operation}`);
    }
    // Basic UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(tenantId)) {
      throw new TenantRequiredError(`AuditService.${operation} (invalid UUID format)`);
    }
  }

  /**
   * Extract audit context from Express request
   * ONLY uses req.context (set by TenantMiddleware) - NEVER headers
   * 
   * @param req - Express request with context set by TenantMiddleware
   * @throws TenantRequiredError if tenant context is missing
   */
  static extractAuditContext(req: Request): AuditRequestContext {
    if (!req.context?.tenant_id) {
      throw new TenantRequiredError('AuditService.extractAuditContext (req.context.tenant_id missing)');
    }

    return {
      tenantId: req.context.tenant_id,
      userId: req.context.user_id,
      userEmail: req.user?.email,
      userRole: req.context.role,
      ipAddress: req.ip || req.socket?.remoteAddress,
      userAgent: req.get('user-agent'),
      requestId: req.headers['x-request-id'] as string | undefined,
      sessionId: req.headers['x-session-id'] as string | undefined,
    };
  }

  /**
   * Log an audit event (internal method)
   * This is the ONLY way to create audit logs - ensures immutability
   * 
   * @param entry - Audit log entry with REQUIRED tenant_id
   * @throws TenantRequiredError if tenant_id is missing
   */
  static async log(entry: AuditLogEntry): Promise<void> {
    try {
      // STRICT validation - tenant_id is REQUIRED
      this.validateTenantId(entry.tenant_id, 'log');

      // Validate other required fields
      if (!entry.event_type || !entry.event_category || !entry.action) {
        logger.error('Invalid audit log entry - missing required fields', { 
          entry,
          missing: {
            event_type: !entry.event_type,
            event_category: !entry.event_category,
            action: !entry.action,
          }
        });
        return;
      }

      const detailsPayload = entry.details || {};
      const payloadEvento = entry.payload_evento || detailsPayload;

      // Insert audit log (append-only)
      // The DB trigger will:
      // 1. Calculate previous_hash from last record WHERE tenant_id = entry.tenant_id
      // 2. Calculate current_hash including previous_hash (forming the chain)
      // 3. Ensure immutability (no UPDATE/DELETE allowed)
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
          entry.tenant_id, // REQUIRED - validated above
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
        tenant_id: entry.tenant_id,
        event_type: entry.event_type,
        resource_type: entry.resource_type,
        resource_id: entry.resource_id,
      });
    } catch (error) {
      // Re-throw TenantRequiredError - this is a programming error
      if (error instanceof TenantRequiredError) {
        throw error;
      }
      // For other errors, log but don't break the application
      logger.error('Failed to create audit log', {
        error,
        entry: {
          tenant_id: entry.tenant_id,
          event_type: entry.event_type,
          resource_type: entry.resource_type,
          resource_id: entry.resource_id,
        },
      });
    }
  }

  /**
   * Log data modification (create, update, delete)
   * 
   * @param tenantId - Tenant ID (REQUIRED - from req.context.tenant_id)
   * @param action - The action being performed
   * @param resourceType - Type of resource being modified
   * @param resourceId - ID of the resource
   * @param userId - ID of the user performing the action
   * @param userEmail - Email of the user
   * @param userRole - Role of the user
   * @param request - Express request (for metadata only, NOT for tenant_id)
   * @param details - Additional details
   * @param resourceIdentifier - Human-readable identifier
   */
  static async logDataChange(
    tenantId: string,
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
    // Validate tenant_id is provided
    this.validateTenantId(tenantId, 'logDataChange');

    const eventType = `data.${action}`;

    await this.log({
      tenant_id: tenantId,
      event_type: eventType,
      event_category: AuditEventCategory.DATA_MODIFICATION,
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
      ip_address: request.ip || request.socket?.remoteAddress,
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
   * 
   * @param tenantId - Tenant ID (REQUIRED - from req.context.tenant_id)
   * @param resourceType - Type of resource being accessed
   * @param resourceId - ID of the resource (null for list operations)
   * @param userId - ID of the user performing the action
   * @param userEmail - Email of the user
   * @param userRole - Role of the user
   * @param request - Express request (for metadata only, NOT for tenant_id)
   * @param details - Additional details
   */
  static async logAccess(
    tenantId: string,
    resourceType: string,
    resourceId: string | null,
    userId: string,
    userEmail: string,
    userRole: string | undefined,
    request: Request,
    details?: Record<string, unknown>
  ): Promise<void> {
    // Validate tenant_id is provided
    this.validateTenantId(tenantId, 'logAccess');

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
      ip_address: request.ip || request.socket?.remoteAddress,
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
   * 
   * @param tenantId - Tenant ID (REQUIRED - user's tenant from DB)
   * @param eventType - Type of auth event
   * @param userId - ID of the user
   * @param userEmail - Email of the user
   * @param request - Express request (for metadata only)
   * @param success - Whether the auth attempt succeeded
   * @param errorMessage - Error message if failed
   */
  static async logAuthEvent(
    tenantId: string,
    eventType: AuditEventType.USER_LOGIN | AuditEventType.USER_LOGOUT | AuditEventType.USER_REGISTER,
    userId: string | undefined,
    userEmail: string,
    request: Request,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    // Validate tenant_id is provided
    this.validateTenantId(tenantId, 'logAuthEvent');

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
      ip_address: request.ip || request.socket?.remoteAddress,
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
   * 
   * @param tenantId - Tenant ID (REQUIRED - from req.context.tenant_id)
   * @param action - Grant or revoke
   * @param resourceType - 'permission' or 'role'
   * @param resourceId - ID of the permission/role
   * @param targetUserId - User receiving/losing the permission
   * @param targetUserEmail - Email of target user
   * @param userId - User performing the action
   * @param userEmail - Email of the acting user
   * @param request - Express request (for metadata only)
   * @param details - Additional details
   */
  static async logAuthorizationChange(
    tenantId: string,
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
    // Validate tenant_id is provided
    this.validateTenantId(tenantId, 'logAuthorizationChange');

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
      ip_address: request.ip || request.socket?.remoteAddress,
      user_agent: request.get('user-agent'),
      request_id: request.headers['x-request-id'] as string,
      success: true,
      compliance_flags: ['gdpr', 'authorization'],
      retention_category: 'authorization',
    });
  }

  // ============================================
  // DEPRECATED METHODS - Will be removed
  // ============================================

  /**
   * @deprecated Use logDataChange instead. This method will be removed.
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
    // Extract tenant_id from request context (ONLY source)
    const tenantId = request.context?.tenant_id;
    if (!tenantId) {
      logger.warn('logDataModification called without tenant context - use logDataChange instead', {
        resourceType,
        resourceId,
        path: request.path,
      });
      throw new TenantRequiredError('AuditService.logDataModification (use logDataChange with explicit tenantId)');
    }
    
    await this.logDataChange(tenantId, action, resourceType, resourceId, userId, userEmail, userRole, request, details, resourceIdentifier);
  }

  /**
   * @deprecated Use logAccess instead. This method will be removed.
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
    const tenantId = request.context?.tenant_id;
    if (!tenantId) {
      throw new TenantRequiredError('AuditService.logDataAccess (use logAccess with explicit tenantId)');
    }
    
    await this.logAccess(tenantId, resourceType, resourceId, userId, userEmail, userRole, request, details);
  }

  /**
   * @deprecated Use logAuthEvent instead. This method will be removed.
   */
  static async logAuthentication(
    eventType: AuditEventType.USER_LOGIN | AuditEventType.USER_LOGOUT | AuditEventType.USER_REGISTER,
    userId: string | undefined,
    userEmail: string,
    request: Request,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    const tenantId = request.context?.tenant_id;
    if (!tenantId) {
      throw new TenantRequiredError('AuditService.logAuthentication (use logAuthEvent with explicit tenantId)');
    }
    
    await this.logAuthEvent(tenantId, eventType, userId, userEmail, request, success, errorMessage);
  }

  /**
   * @deprecated Use logAuthorizationChange instead. This method will be removed.
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
    const tenantId = request.context?.tenant_id;
    if (!tenantId) {
      throw new TenantRequiredError('AuditService.logAuthorization (use logAuthorizationChange with explicit tenantId)');
    }
    
    await this.logAuthorizationChange(tenantId, action, resourceType, resourceId, targetUserId, targetUserEmail, userId, userEmail, request, details);
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /**
   * Sanitize request body for audit logging
   * Removes sensitive information like passwords
   */
  private static sanitizeRequestBody(body: Record<string, unknown>): Record<string, unknown> {
    if (!body || typeof body !== 'object') return {};
    
    const sanitized = { ...body };
    const sensitiveFields = ['password', 'password_hash', 'token', 'secret', 'api_key', 'credit_card', 'ssn', 'refresh_token'];

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

    // Legal documents have specific compliance
    if (resourceType.includes('document') || resourceType.includes('contract')) {
      flags.push('legal');
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
      document: 'legal',
      contract: 'legal',
    };

    return categories[resourceType.toLowerCase()] || 'general';
  }

  // ============================================
  // HASH CHAIN VERIFICATION
  // ============================================

  /**
   * Verify audit hash chain integrity for a tenant
   * 
   * The hash chain provides tamper-evidence:
   * - Each record's current_hash = SHA256(previous_hash | payload | timestamp)
   * - If any record is modified, all subsequent hashes become invalid
   * - Each tenant has an independent chain (isolated by tenant_id)
   * 
   * @param tenantId - Tenant ID to verify
   * @returns Verification result with invalid records if any
   */
  static async verifyHashChain(tenantId: string): Promise<{
    valid: boolean;
    totalRecords: number;
    invalidRecords: Array<{ id: string; reason: string }>;
  }> {
    this.validateTenantId(tenantId, 'verifyHashChain');

    interface HashChainValidationRow {
      hash_chain_index: number;
      current_hash: string;
      previous_hash: string;
      calculated_hash: string;
      is_valid: boolean;
    }    const result = await db.query<HashChainValidationRow>(
      `SELECT * FROM validate_audit_hash_chain($1)`,
      [tenantId]
    );    const rows: HashChainValidationRow[] = result.rows;
    const invalidRecords = rows
      .filter(row => !row.is_valid)
      .map(row => ({
        id: row.hash_chain_index.toString(),
        reason: `Hash mismatch: stored=${row.current_hash.substring(0, 8)}..., calculated=${row.calculated_hash.substring(0, 8)}...`,
      }));    return {
      valid: invalidRecords.length === 0,
      totalRecords: result.rows.length,
      invalidRecords,
    };
  }
}
