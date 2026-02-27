import { db } from './database.js';
import { AuditService, AuditAction } from '../services/audit.js';
import { Request } from 'express';

/**
 * Database operation hooks for automatic audit logging
 * These hooks intercept database operations and log them
 */

/**
 * Context for audit logging
 * Stores request information for database hooks
 */
export interface AuditContext {
  userId?: string;
  userEmail?: string;
  userRole?: string;
  request?: Request;
}

/**
 * Global audit context
 * Set this before database operations to enable automatic audit logging
 */
let auditContext: AuditContext | null = null;

/**
 * Set audit context for current operation
 * Call this before database operations to enable automatic audit logging
 */
export function setAuditContext(context: AuditContext | null): void {
  auditContext = context;
}

/**
 * Get current audit context
 */
export function getAuditContext(): AuditContext | null {
  return auditContext;
}

/**
 * Clear audit context
 */
export function clearAuditContext(): void {
  auditContext = null;
}

/**
 * Hook for CREATE operations
 * Call this after inserting a record
 */
export async function auditCreate(
  resourceType: string,
  resourceId: string,
  resourceIdentifier?: string,
  details?: Record<string, unknown>
): Promise<void> {
  if (!auditContext || !auditContext.userId || !auditContext.userEmail) {
    return; // No context, skip audit
  }

  if (!auditContext.request) {
    // Create a minimal request object for audit logging
    const minimalRequest = {
      method: 'POST',
      path: `/${resourceType}`,
      ip: 'system',
      socket: { remoteAddress: 'system' },
      get: () => undefined,
      headers: {},
      query: {},
      params: {},
      body: {},
    } as unknown as Request;

    await AuditService.logDataModification(
      AuditAction.CREATE,
      resourceType,
      resourceId,
      auditContext.userId,
      auditContext.userEmail,
      auditContext.userRole,
      minimalRequest,
      details,
      resourceIdentifier
    );
  } else {
    await AuditService.logDataModification(
      AuditAction.CREATE,
      resourceType,
      resourceId,
      auditContext.userId,
      auditContext.userEmail,
      auditContext.userRole,
      auditContext.request,
      details,
      resourceIdentifier
    );
  }
}

/**
 * Hook for UPDATE operations
 * Call this after updating a record
 */
export async function auditUpdate(
  resourceType: string,
  resourceId: string,
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>,
  resourceIdentifier?: string
): Promise<void> {
  if (!auditContext || !auditContext.userId || !auditContext.userEmail) {
    return; // No context, skip audit
  }

  // Calculate changed fields
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const key in newValues) {
    if (oldValues[key] !== newValues[key]) {
      changes[key] = {
        old: oldValues[key],
        new: newValues[key],
      };
    }
  }

  const details = {
    changes,
    changed_fields: Object.keys(changes),
  };

  if (!auditContext.request) {
    const minimalRequest = {
      method: 'PUT',
      path: `/${resourceType}/${resourceId}`,
      ip: 'system',
      socket: { remoteAddress: 'system' },
      get: () => undefined,
      headers: {},
      query: {},
      params: { id: resourceId },
      body: newValues,
    } as unknown as Request;

    await AuditService.logDataModification(
      AuditAction.UPDATE,
      resourceType,
      resourceId,
      auditContext.userId,
      auditContext.userEmail,
      auditContext.userRole,
      minimalRequest,
      details,
      resourceIdentifier
    );
  } else {
    await AuditService.logDataModification(
      AuditAction.UPDATE,
      resourceType,
      resourceId,
      auditContext.userId,
      auditContext.userEmail,
      auditContext.userRole,
      auditContext.request,
      details,
      resourceIdentifier
    );
  }
}

/**
 * Hook for DELETE operations
 * Call this before or after deleting a record
 */
export async function auditDelete(
  resourceType: string,
  resourceId: string,
  deletedData: Record<string, unknown>,
  resourceIdentifier?: string
): Promise<void> {
  if (!auditContext || !auditContext.userId || !auditContext.userEmail) {
    return; // No context, skip audit
  }

  const details = {
    deleted_data: deletedData,
  };

  if (!auditContext.request) {
    const minimalRequest = {
      method: 'DELETE',
      path: `/${resourceType}/${resourceId}`,
      ip: 'system',
      socket: { remoteAddress: 'system' },
      get: () => undefined,
      headers: {},
      query: {},
      params: { id: resourceId },
      body: {},
    } as unknown as Request;

    await AuditService.logDataModification(
      AuditAction.DELETE,
      resourceType,
      resourceId,
      auditContext.userId,
      auditContext.userEmail,
      auditContext.userRole,
      minimalRequest,
      details,
      resourceIdentifier
    );
  } else {
    await AuditService.logDataModification(
      AuditAction.DELETE,
      resourceType,
      resourceId,
      auditContext.userId,
      auditContext.userEmail,
      auditContext.userRole,
      auditContext.request,
      details,
      resourceIdentifier
    );
  }
}

/**
 * Enhanced User Model with automatic audit logging
 * Example of how to integrate audit hooks into models
 * 
 * IMPORTANT: All operations require tenant_id for SaaS isolation (Fonte 75)
 */
export class AuditableUserModel {
  /**
   * Create user with audit logging
   * @param data - User data including tenant_id (required)
   * @param auditContext - Audit context with user info
   */
  static async createWithAudit(
    data: { 
      tenant_id: string;
      email: string; 
      password_hash: string; 
      first_name?: string; 
      last_name?: string 
    },
    auditContext: AuditContext
  ): Promise<{ id: string; email: string; tenant_id: string }> {
    if (!data.tenant_id) {
      throw new Error('tenant_id is required for user creation');
    }

    // Set audit context
    setAuditContext(auditContext);

    try {
      // Create user with tenant_id
      const result = await db.query(
        `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, tenant_id, email, first_name, last_name`,
        [data.tenant_id, data.email, data.password_hash, data.first_name || null, data.last_name || null]
      );

      const user = result.rows[0] as Record<string, unknown>;

      // Log audit
      await auditCreate('user', user.id as string, user.email as string, {
        tenant_id: user.tenant_id as string,
        email: user.email as string,
        first_name: user.first_name as string | null,
        last_name: user.last_name as string | null,
      });

      return { id: user.id as string, email: user.email as string, tenant_id: user.tenant_id as string };
    } finally {
      clearAuditContext();
    }
  }

  /**
   * Update user with audit logging
   * @param userId - User ID
   * @param tenantId - Tenant ID (required for scoping)
   * @param updates - Fields to update
   * @param auditContext - Audit context with user info
   */
  static async updateWithAudit(
    userId: string,
    tenantId: string,
    updates: Record<string, unknown>,
    auditContext: AuditContext
  ): Promise<void> {
    if (!tenantId) {
      throw new Error('tenantId is required for user update');
    }

    setAuditContext(auditContext);

    try {
      // Get old values (tenant-scoped)
      const oldResult = await db.query(
        'SELECT * FROM users WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL', 
        [userId, tenantId]
      );
      const oldValues = oldResult.rows[0];

      if (!oldValues) {
        throw new Error('User not found');
      }

      // Build update query
      const fields: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(updates)) {
        // Prevent updating tenant_id
        if (key === 'tenant_id') continue;
        fields.push(`${key} = $${paramIndex++}`);
        values.push(value);
      }

      if (fields.length === 0) return;

      values.push(userId);
      values.push(tenantId);

      // Update user (tenant-scoped)
      await db.query(
        `UPDATE users SET ${fields.join(', ')} 
         WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1} AND deleted_at IS NULL`,
        values
      );

      // Get new values (tenant-scoped)
      const newResult = await db.query(
        'SELECT * FROM users WHERE id = $1 AND tenant_id = $2', 
        [userId, tenantId]
      );
      const newValues = newResult.rows[0];

      // Log audit
      await auditUpdate('user', userId, oldValues as Record<string, unknown>, newValues as Record<string, unknown>, (oldValues as Record<string, unknown>).email as string);
    } finally {
      clearAuditContext();
    }
  }

  /**
   * Delete user with audit logging
   * @param userId - User ID
   * @param tenantId - Tenant ID (required for scoping)
   * @param auditContext - Audit context with user info
   */
  static async deleteWithAudit(
    userId: string, 
    tenantId: string,
    auditContext: AuditContext
  ): Promise<void> {
    if (!tenantId) {
      throw new Error('tenantId is required for user deletion');
    }

    setAuditContext(auditContext);

    try {
      // Get data before deletion (tenant-scoped)
      const result = await db.query(
        'SELECT * FROM users WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL', 
        [userId, tenantId]
      );
      const deletedData = result.rows[0];

      if (!deletedData) {
        throw new Error('User not found');
      }

      // Soft delete (tenant-scoped)
      await db.query(
        'UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND tenant_id = $2', 
        [userId, tenantId]
      );

      // Log audit
      await auditDelete('user', userId, deletedData as Record<string, unknown>, (deletedData as Record<string, unknown>).email as string);
    } finally {
      clearAuditContext();
    }
  }
}


