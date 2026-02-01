import { PermissionModel } from '../models/permission';
import { RoleModel } from '../models/role';
import { AuthorizationError, TenantRequiredError } from '../utils/errors';
import { logger } from '../utils/logger';

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
 * RBAC Service with Tenant Isolation
 * 
 * IMPORTANT: All permission checks are scoped to a specific tenant.
 * Every method requires explicit tenantId parameter - no defaults or fallbacks.
 * 
 * System roles (is_system_role=true) are available across all tenants,
 * but permission checks still require tenantId for proper scoping.
 */
export class RBACService {
  /**
   * Check if user has a specific permission within a tenant
   * @param userId - User ID
   * @param tenantId - Tenant ID (required)
   * @param permissionName - Permission name (e.g., 'users:read')
   * @throws TenantRequiredError if tenantId is missing
   */
  static async hasPermission(
    userId: string,
    tenantId: string,
    permissionName: string
  ): Promise<boolean> {
    requireTenantId(tenantId, 'RBACService.hasPermission');
    return PermissionModel.userHasPermission(userId, tenantId, permissionName);
  }

  /**
   * Check if user has any of the specified permissions within a tenant
   * @param userId - User ID
   * @param tenantId - Tenant ID (required)
   * @param permissionNames - Array of permission names
   * @throws TenantRequiredError if tenantId is missing
   */
  static async hasAnyPermission(
    userId: string,
    tenantId: string,
    permissionNames: string[]
  ): Promise<boolean> {
    requireTenantId(tenantId, 'RBACService.hasAnyPermission');
    
    const userPermissions = await PermissionModel.getUserPermissionNames(userId, tenantId);
    return permissionNames.some((perm) => userPermissions.includes(perm));
  }

  /**
   * Check if user has all of the specified permissions within a tenant
   * @param userId - User ID
   * @param tenantId - Tenant ID (required)
   * @param permissionNames - Array of permission names
   * @throws TenantRequiredError if tenantId is missing
   */
  static async hasAllPermissions(
    userId: string,
    tenantId: string,
    permissionNames: string[]
  ): Promise<boolean> {
    requireTenantId(tenantId, 'RBACService.hasAllPermissions');
    
    const userPermissions = await PermissionModel.getUserPermissionNames(userId, tenantId);
    return permissionNames.every((perm) => userPermissions.includes(perm));
  }

  /**
   * Check if user has permission for a specific resource and action within a tenant
   * @param userId - User ID
   * @param tenantId - Tenant ID (required)
   * @param resource - Resource name (e.g., 'users', 'documents')
   * @param action - Action name (e.g., 'read', 'create', 'delete')
   * @throws TenantRequiredError if tenantId is missing
   */
  static async hasResourcePermission(
    userId: string,
    tenantId: string,
    resource: string,
    action: string
  ): Promise<boolean> {
    requireTenantId(tenantId, 'RBACService.hasResourcePermission');
    
    const permissionName = `${resource}:${action}`;
    return this.hasPermission(userId, tenantId, permissionName);
  }

  /**
   * Get all permission names for a user within a tenant
   * @param userId - User ID
   * @param tenantId - Tenant ID (required)
   * @throws TenantRequiredError if tenantId is missing
   */
  static async getUserPermissions(userId: string, tenantId: string): Promise<string[]> {
    requireTenantId(tenantId, 'RBACService.getUserPermissions');
    return PermissionModel.getUserPermissionNames(userId, tenantId);
  }

  /**
   * Get all roles for a user within a tenant
   * @param userId - User ID
   * @param tenantId - Tenant ID (required)
   * @throws TenantRequiredError if tenantId is missing
   */
  static async getUserRoles(userId: string, tenantId: string): Promise<string[]> {
    requireTenantId(tenantId, 'RBACService.getUserRoles');
    
    const roles = await RoleModel.findByUserId(userId, tenantId);
    return roles.map((r) => r.name);
  }

  /**
   * Check if user has a specific role within a tenant
   * @param userId - User ID
   * @param tenantId - Tenant ID (required)
   * @param roleName - Role name
   * @throws TenantRequiredError if tenantId is missing
   */
  static async hasRole(userId: string, tenantId: string, roleName: string): Promise<boolean> {
    requireTenantId(tenantId, 'RBACService.hasRole');
    return RoleModel.userHasRole(userId, roleName, tenantId);
  }

  /**
   * Check if user is a super admin (has super_admin system role)
   * Super admin role grants all permissions within a tenant
   * @param userId - User ID
   * @param tenantId - Tenant ID (required)
   * @throws TenantRequiredError if tenantId is missing
   */
  static async isSuperAdmin(userId: string, tenantId: string): Promise<boolean> {
    requireTenantId(tenantId, 'RBACService.isSuperAdmin');
    return this.hasRole(userId, tenantId, 'super_admin');
  }

  /**
   * Require permission - throws error if user doesn't have permission
   * @param userId - User ID
   * @param tenantId - Tenant ID (required)
   * @param permissionName - Permission name
   * @throws TenantRequiredError if tenantId is missing
   * @throws AuthorizationError if user doesn't have permission
   */
  static async requirePermission(
    userId: string,
    tenantId: string,
    permissionName: string
  ): Promise<void> {
    requireTenantId(tenantId, 'RBACService.requirePermission');
    
    // Check if user is super_admin first (bypass permission check)
    const isSuperAdmin = await this.isSuperAdmin(userId, tenantId);
    if (isSuperAdmin) {
      return;
    }
    
    const hasPermission = await this.hasPermission(userId, tenantId, permissionName);

    if (!hasPermission) {
      logger.warn('Permission denied', { userId, tenantId, permissionName });
      throw new AuthorizationError(
        `Insufficient permissions. Required: ${permissionName}`
      );
    }
  }

  /**
   * Require any of the specified permissions
   * @param userId - User ID
   * @param tenantId - Tenant ID (required)
   * @param permissionNames - Array of permission names
   * @throws TenantRequiredError if tenantId is missing
   * @throws AuthorizationError if user doesn't have any of the permissions
   */
  static async requireAnyPermission(
    userId: string,
    tenantId: string,
    permissionNames: string[]
  ): Promise<void> {
    requireTenantId(tenantId, 'RBACService.requireAnyPermission');
    
    // Check if user is super_admin first (bypass permission check)
    const isSuperAdmin = await this.isSuperAdmin(userId, tenantId);
    if (isSuperAdmin) {
      return;
    }
    
    const hasAny = await this.hasAnyPermission(userId, tenantId, permissionNames);

    if (!hasAny) {
      logger.warn('Permission denied', { userId, tenantId, requiredPermissions: permissionNames });
      throw new AuthorizationError(
        `Insufficient permissions. Required one of: ${permissionNames.join(', ')}`
      );
    }
  }

  /**
   * Require all of the specified permissions
   * @param userId - User ID
   * @param tenantId - Tenant ID (required)
   * @param permissionNames - Array of permission names
   * @throws TenantRequiredError if tenantId is missing
   * @throws AuthorizationError if user doesn't have all permissions
   */
  static async requireAllPermissions(
    userId: string,
    tenantId: string,
    permissionNames: string[]
  ): Promise<void> {
    requireTenantId(tenantId, 'RBACService.requireAllPermissions');
    
    // Check if user is super_admin first (bypass permission check)
    const isSuperAdmin = await this.isSuperAdmin(userId, tenantId);
    if (isSuperAdmin) {
      return;
    }
    
    const hasAll = await this.hasAllPermissions(userId, tenantId, permissionNames);

    if (!hasAll) {
      logger.warn('Permission denied', { userId, tenantId, requiredPermissions: permissionNames });
      throw new AuthorizationError(
        `Insufficient permissions. Required all of: ${permissionNames.join(', ')}`
      );
    }
  }

  /**
   * Require resource permission
   * @param userId - User ID
   * @param tenantId - Tenant ID (required)
   * @param resource - Resource name
   * @param action - Action name
   * @throws TenantRequiredError if tenantId is missing
   * @throws AuthorizationError if user doesn't have permission
   */
  static async requireResourcePermission(
    userId: string,
    tenantId: string,
    resource: string,
    action: string
  ): Promise<void> {
    requireTenantId(tenantId, 'RBACService.requireResourcePermission');
    
    const permissionName = `${resource}:${action}`;
    await this.requirePermission(userId, tenantId, permissionName);
  }

  /**
   * Require a specific role
   * @param userId - User ID
   * @param tenantId - Tenant ID (required)
   * @param roleName - Role name
   * @throws TenantRequiredError if tenantId is missing
   * @throws AuthorizationError if user doesn't have role
   */
  static async requireRole(userId: string, tenantId: string, roleName: string): Promise<void> {
    requireTenantId(tenantId, 'RBACService.requireRole');
    
    const hasRole = await this.hasRole(userId, tenantId, roleName);

    if (!hasRole) {
      logger.warn('Role required', { userId, tenantId, roleName });
      throw new AuthorizationError(
        `Insufficient permissions. Required role: ${roleName}`
      );
    }
  }
}
