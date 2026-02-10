import { db } from './database.js';
import { QueryResult } from 'pg';
import { TenantRequiredError } from '../utils/errors.js';

/**
 * Role model types
 * 
 * Roles can be:
 * - System roles (is_system_role=true, tenant_id=NULL): Global, shared across all tenants
 * - Tenant roles (is_system_role=false, tenant_id NOT NULL): Scoped to specific tenant
 */
export interface Role {
  id: string;
  tenant_id: string | null;
  name: string;
  description: string | null;
  is_system_role: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface CreateRoleInput {
  tenant_id: string;
  name: string;
  description?: string;
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
 * Role model - Database operations with tenant isolation
 * 
 * IMPORTANT: 
 * - Tenant-scoped methods require explicit tenantId parameter
 * - System roles (is_system_role=true) are global and available to all tenants
 * - Queries that include system roles use UNION or OR conditions
 */
export class RoleModel {
  /**
   * Find role by ID within a specific tenant (includes system roles)
   * @param id - Role ID
   * @param tenantId - Tenant ID (required)
   * @throws TenantRequiredError if tenantId is missing
   */
  static async findById(id: string, tenantId: string): Promise<Role | null> {
    requireTenantId(tenantId, 'RoleModel.findById');
    
    const result: QueryResult<Role> = await db.query<Role>(
      `SELECT * FROM roles 
       WHERE id = $1 
         AND (tenant_id = $2 OR is_system_role = true)
         AND deleted_at IS NULL`,
      [id, tenantId]
    );
    return result.rows[0] || null;
  }

  /**
   * Find role by name within a specific tenant (includes system roles)
   * @param name - Role name
   * @param tenantId - Tenant ID (required)
   * @throws TenantRequiredError if tenantId is missing
   */
  static async findByName(name: string, tenantId: string): Promise<Role | null> {
    requireTenantId(tenantId, 'RoleModel.findByName');
    
    const result: QueryResult<Role> = await db.query<Role>(
      `SELECT * FROM roles 
       WHERE name = $1 
         AND (tenant_id = $2 OR is_system_role = true)
         AND deleted_at IS NULL`,
      [name, tenantId]
    );
    return result.rows[0] || null;
  }

  /**
   * List all roles available to a specific tenant
   * Includes both tenant-specific roles and global system roles
   * @param tenantId - Tenant ID (required)
   * @throws TenantRequiredError if tenantId is missing
   */
  static async findAllByTenant(tenantId: string): Promise<Role[]> {
    requireTenantId(tenantId, 'RoleModel.findAllByTenant');
    
    const result: QueryResult<Role> = await db.query<Role>(
      `SELECT * FROM roles 
       WHERE (tenant_id = $1 OR is_system_role = true)
         AND deleted_at IS NULL
       ORDER BY is_system_role DESC, name`,
      [tenantId]
    );
    return result.rows;
  }

  /**
   * Find roles for a user within a specific tenant
   * Includes system roles assigned to the user
   * @param userId - User ID
   * @param tenantId - Tenant ID (required)
   * @throws TenantRequiredError if tenantId is missing
   */
  static async findByUserId(userId: string, tenantId: string): Promise<Role[]> {
    requireTenantId(tenantId, 'RoleModel.findByUserId');
    
    const result: QueryResult<Role> = await db.query<Role>(
      `SELECT r.* FROM roles r
       INNER JOIN user_roles ur ON r.id = ur.role_id
       WHERE ur.user_id = $1 
         AND ur.tenant_id = $2
         AND r.deleted_at IS NULL
       ORDER BY r.is_system_role DESC, r.name`,
      [userId, tenantId]
    );
    return result.rows;
  }

  /**
   * List only tenant-specific roles (excludes system roles)
   * @param tenantId - Tenant ID (required)
   * @throws TenantRequiredError if tenantId is missing
   */
  static async findTenantRolesOnly(tenantId: string): Promise<Role[]> {
    requireTenantId(tenantId, 'RoleModel.findTenantRolesOnly');
    
    const result: QueryResult<Role> = await db.query<Role>(
      `SELECT * FROM roles 
       WHERE tenant_id = $1 
         AND is_system_role = false
         AND deleted_at IS NULL
       ORDER BY name`,
      [tenantId]
    );
    return result.rows;
  }

  /**
   * List only system roles (global, available to all tenants)
   * This is the ONLY query that doesn't require tenantId
   */
  static async findSystemRoles(): Promise<Role[]> {
    const result: QueryResult<Role> = await db.query<Role>(
      `SELECT * FROM roles 
       WHERE is_system_role = true
         AND deleted_at IS NULL
       ORDER BY name`
    );
    return result.rows;
  }

  /**
   * Create a new tenant-specific role
   * @param input - Role creation data (must include tenant_id)
   * @throws TenantRequiredError if tenant_id is missing
   */
  static async create(input: CreateRoleInput): Promise<Role> {
    requireTenantId(input.tenant_id, 'RoleModel.create');
    
    const result: QueryResult<Role> = await db.query<Role>(
      `INSERT INTO roles (tenant_id, name, description, is_system_role)
       VALUES ($1, $2, $3, false)
       RETURNING *`,
      [input.tenant_id, input.name, input.description || null]
    );
    return result.rows[0];
  }

  /**
   * Update a role within a specific tenant
   * Cannot update system roles via this method
   * @param id - Role ID
   * @param tenantId - Tenant ID (required)
   * @param updates - Fields to update
   * @throws TenantRequiredError if tenantId is missing
   */
  static async update(
    id: string,
    tenantId: string,
    updates: { name?: string; description?: string }
  ): Promise<Role | null> {
    requireTenantId(tenantId, 'RoleModel.update');
    
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }

    if (fields.length === 0) {
      return this.findById(id, tenantId);
    }

    values.push(id);
    values.push(tenantId);
    const result: QueryResult<Role> = await db.query<Role>(
      `UPDATE roles 
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex} 
         AND tenant_id = $${paramIndex + 1} 
         AND is_system_role = false
         AND deleted_at IS NULL
       RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  /**
   * Soft delete a tenant-specific role
   * Cannot delete system roles
   * @param id - Role ID
   * @param tenantId - Tenant ID (required)
   * @throws TenantRequiredError if tenantId is missing
   */
  static async delete(id: string, tenantId: string): Promise<boolean> {
    requireTenantId(tenantId, 'RoleModel.delete');
    
    const result = await db.query(
      `UPDATE roles 
       SET deleted_at = CURRENT_TIMESTAMP
       WHERE id = $1 
         AND tenant_id = $2 
         AND is_system_role = false
         AND deleted_at IS NULL
       RETURNING id`,
      [id, tenantId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Assign a role to a user within a tenant
   * @param userId - User ID
   * @param roleId - Role ID
   * @param tenantId - Tenant ID (required)
   * @param assignedBy - ID of user making the assignment
   * @throws TenantRequiredError if tenantId is missing
   */
  static async assignToUser(
    userId: string,
    roleId: string,
    tenantId: string,
    assignedBy?: string
  ): Promise<void> {
    requireTenantId(tenantId, 'RoleModel.assignToUser');
    
    await db.query(
      `INSERT INTO user_roles (user_id, role_id, tenant_id, assigned_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [userId, roleId, tenantId, assignedBy || null]
    );
  }

  /**
   * Remove a role from a user within a tenant
   * @param userId - User ID
   * @param roleId - Role ID
   * @param tenantId - Tenant ID (required)
   * @throws TenantRequiredError if tenantId is missing
   */
  static async removeFromUser(userId: string, roleId: string, tenantId: string): Promise<boolean> {
    requireTenantId(tenantId, 'RoleModel.removeFromUser');
    
    const result = await db.query(
      `DELETE FROM user_roles 
       WHERE user_id = $1 AND role_id = $2 AND tenant_id = $3
       RETURNING user_id`,
      [userId, roleId, tenantId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Check if user has a specific role within a tenant
   * @param userId - User ID
   * @param roleName - Role name
   * @param tenantId - Tenant ID (required)
   * @throws TenantRequiredError if tenantId is missing
   */
  static async userHasRole(userId: string, roleName: string, tenantId: string): Promise<boolean> {
    requireTenantId(tenantId, 'RoleModel.userHasRole');
    
    const result = await db.query(
      `SELECT 1 FROM user_roles ur
       INNER JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = $1 
         AND ur.tenant_id = $2
         AND r.name = $3
         AND r.deleted_at IS NULL
       LIMIT 1`,
      [userId, tenantId, roleName]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
