import { db } from './database';
import { QueryResult } from 'pg';
import { TenantRequiredError } from '../utils/errors';

/**
 * Permission model types
 * 
 * Permissions are GLOBAL by design - they define capabilities shared across all tenants.
 * Tenant isolation is enforced at the role/user assignment level, not permission definition.
 */
export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface CreatePermissionInput {
  name: string;
  resource: string;
  action: string;
  description?: string;
}

/**
 * User permission result (from tenant-aware view)
 */
export interface UserPermission {
  tenant_id: string;
  user_id: string;
  email: string;
  permission_id: string;
  permission_name: string;
  resource: string;
  action: string;
  source: 'role' | 'direct';
}

/**
 * Validate tenant ID is provided
 * @throws TenantRequiredError if tenantId is missing
 */
function requireTenantId(tenantId: string | undefined | null, operation: string): asserts tenantId is string {
  if (!tenantId) {
    throw new TenantRequiredError(operation);
  }
}

/**
 * Permission model - Database operations
 * 
 * DESIGN:
 * - Permission definitions are GLOBAL (no tenant_id)
 * - Permission assignments are TENANT-SCOPED (via user_roles, user_permissions)
 * - Permission checks require tenantId to scope the lookup
 */
export class PermissionModel {
  /**
   * Find permission by ID (global - no tenant required)
   * Permissions are shared definitions across all tenants
   */
  static async findById(id: string): Promise<Permission | null> {
    const result: QueryResult<Permission> = await db.query<Permission>(
      `SELECT * FROM permissions 
       WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Find permission by name (global - no tenant required)
   * Permissions are shared definitions across all tenants
   */
  static async findByName(name: string): Promise<Permission | null> {
    const result: QueryResult<Permission> = await db.query<Permission>(
      `SELECT * FROM permissions 
       WHERE name = $1 AND deleted_at IS NULL`,
      [name]
    );
    return result.rows[0] || null;
  }

  /**
   * List all permissions (global - no tenant required)
   * Returns all permission definitions available system-wide
   */
  static async findAll(): Promise<Permission[]> {
    const result: QueryResult<Permission> = await db.query<Permission>(
      `SELECT * FROM permissions 
       WHERE deleted_at IS NULL
       ORDER BY resource, action`
    );
    return result.rows;
  }

  /**
   * Find permissions granted to a user within a specific tenant
   * Includes permissions from roles and direct assignments
   * @param userId - User ID
   * @param tenantId - Tenant ID (required)
   * @throws TenantRequiredError if tenantId is missing
   */
  static async findByUserId(userId: string, tenantId: string): Promise<Permission[]> {
    requireTenantId(tenantId, 'PermissionModel.findByUserId');
    
    const result: QueryResult<Permission> = await db.query<Permission>(
      `SELECT DISTINCT p.* FROM permissions p
       WHERE p.deleted_at IS NULL
       AND (
         -- Permissions from roles (tenant-scoped)
         p.id IN (
           SELECT rp.permission_id FROM role_permissions rp
           INNER JOIN user_roles ur ON rp.role_id = ur.role_id
           WHERE ur.user_id = $1 AND ur.tenant_id = $2
         )
         OR
         -- Direct permissions (tenant-scoped)
         p.id IN (
           SELECT up.permission_id FROM user_permissions up
           WHERE up.user_id = $1 AND up.tenant_id = $2
           AND (up.expires_at IS NULL OR up.expires_at > CURRENT_TIMESTAMP)
         )
       )
       ORDER BY p.resource, p.action`,
      [userId, tenantId]
    );
    return result.rows;
  }

  /**
   * Check if user has specific permission within a specific tenant
   * Uses the tenant-aware user_all_permissions view
   * @param userId - User ID
   * @param tenantId - Tenant ID (required)
   * @param permissionName - Permission name (e.g., 'users:read')
   * @throws TenantRequiredError if tenantId is missing
   */
  static async userHasPermission(
    userId: string,
    tenantId: string,
    permissionName: string
  ): Promise<boolean> {
    requireTenantId(tenantId, 'PermissionModel.userHasPermission');
    
    const result = await db.query(
      `SELECT 1 FROM user_all_permissions
       WHERE user_id = $1 AND tenant_id = $2 AND permission_name = $3
       LIMIT 1`,
      [userId, tenantId, permissionName]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get user permissions as array of permission names within a specific tenant
   * @param userId - User ID
   * @param tenantId - Tenant ID (required)
   * @throws TenantRequiredError if tenantId is missing
   */
  static async getUserPermissionNames(userId: string, tenantId: string): Promise<string[]> {
    requireTenantId(tenantId, 'PermissionModel.getUserPermissionNames');
    
    const result = await db.query<{ permission_name: string }>(
      `SELECT DISTINCT permission_name FROM user_all_permissions
       WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
    return result.rows.map((row) => row.permission_name);
  }

  /**
   * Get detailed user permissions within a specific tenant
   * Includes source (role vs direct) information
   * @param userId - User ID
   * @param tenantId - Tenant ID (required)
   * @throws TenantRequiredError if tenantId is missing
   */
  static async getUserPermissionsDetailed(
    userId: string,
    tenantId: string
  ): Promise<UserPermission[]> {
    requireTenantId(tenantId, 'PermissionModel.getUserPermissionsDetailed');
    
    const result: QueryResult<UserPermission> = await db.query<UserPermission>(
      `SELECT * FROM user_all_permissions
       WHERE user_id = $1 AND tenant_id = $2
       ORDER BY permission_name`,
      [userId, tenantId]
    );
    return result.rows;
  }

  /**
   * Grant a permission directly to a user within a specific tenant
   * @param userId - User ID
   * @param permissionId - Permission ID
   * @param tenantId - Tenant ID (required)
   * @param grantedBy - ID of user granting the permission
   * @param expiresAt - Optional expiration date
   * @throws TenantRequiredError if tenantId is missing
   */
  static async grantToUser(
    userId: string,
    permissionId: string,
    tenantId: string,
    grantedBy?: string,
    expiresAt?: Date
  ): Promise<void> {
    requireTenantId(tenantId, 'PermissionModel.grantToUser');
    
    await db.query(
      `INSERT INTO user_permissions (user_id, permission_id, tenant_id, granted_by, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, permission_id) DO UPDATE SET
         expires_at = EXCLUDED.expires_at,
         granted_by = EXCLUDED.granted_by,
         granted_at = CURRENT_TIMESTAMP`,
      [userId, permissionId, tenantId, grantedBy || null, expiresAt || null]
    );
  }

  /**
   * Revoke a permission from a user within a specific tenant
   * @param userId - User ID
   * @param permissionId - Permission ID
   * @param tenantId - Tenant ID (required)
   * @throws TenantRequiredError if tenantId is missing
   */
  static async revokeFromUser(
    userId: string,
    permissionId: string,
    tenantId: string
  ): Promise<boolean> {
    requireTenantId(tenantId, 'PermissionModel.revokeFromUser');
    
    const result = await db.query(
      `DELETE FROM user_permissions 
       WHERE user_id = $1 AND permission_id = $2 AND tenant_id = $3
       RETURNING user_id`,
      [userId, permissionId, tenantId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Grant a permission to a role
   * Role permissions inherit tenant scope from the role
   * @param roleId - Role ID
   * @param permissionId - Permission ID
   * @param tenantId - Tenant ID (required for non-system roles)
   * @param grantedBy - ID of user granting the permission
   */
  static async grantToRole(
    roleId: string,
    permissionId: string,
    tenantId: string | null,
    grantedBy?: string
  ): Promise<void> {
    await db.query(
      `INSERT INTO role_permissions (role_id, permission_id, tenant_id, granted_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
      [roleId, permissionId, tenantId, grantedBy || null]
    );
  }

  /**
   * Revoke a permission from a role
   * @param roleId - Role ID
   * @param permissionId - Permission ID
   * @param tenantId - Tenant ID (required for non-system roles, NULL for system roles)
   */
  static async revokeFromRole(
    roleId: string,
    permissionId: string,
    tenantId: string | null
  ): Promise<boolean> {
    let query: string;
    let params: (string | null)[];
    
    if (tenantId) {
      query = `DELETE FROM role_permissions 
               WHERE role_id = $1 AND permission_id = $2 AND tenant_id = $3
               RETURNING role_id`;
      params = [roleId, permissionId, tenantId];
    } else {
      // For system roles (tenant_id IS NULL)
      query = `DELETE FROM role_permissions 
               WHERE role_id = $1 AND permission_id = $2 AND tenant_id IS NULL
               RETURNING role_id`;
      params = [roleId, permissionId];
    }
    
    const result = await db.query(query, params);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get permissions assigned to a role
   * @param roleId - Role ID
   * @param tenantId - Tenant ID (required for tenant-scoped roles, NULL for system roles)
   */
  static async getByRoleId(roleId: string, tenantId: string | null): Promise<Permission[]> {
    let query: string;
    let params: (string | null)[];
    
    if (tenantId) {
      query = `SELECT p.* FROM permissions p
               INNER JOIN role_permissions rp ON p.id = rp.permission_id
               WHERE rp.role_id = $1 AND rp.tenant_id = $2 AND p.deleted_at IS NULL
               ORDER BY p.resource, p.action`;
      params = [roleId, tenantId];
    } else {
      // For system roles (tenant_id IS NULL)
      query = `SELECT p.* FROM permissions p
               INNER JOIN role_permissions rp ON p.id = rp.permission_id
               WHERE rp.role_id = $1 AND rp.tenant_id IS NULL AND p.deleted_at IS NULL
               ORDER BY p.resource, p.action`;
      params = [roleId];
    }
    
    const result: QueryResult<Permission> = await db.query<Permission>(query, params);
    return result.rows;
  }
}
