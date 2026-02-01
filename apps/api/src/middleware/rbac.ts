import { Request, Response, NextFunction } from 'express';
import { RBACService } from '../services/rbac';
import { AuthorizationError, AuthenticationError, TenantRequiredError } from '../utils/errors';
import { asyncHandler } from './validator';

/**
 * RBAC Middleware Factory with Tenant Isolation
 * 
 * IMPORTANT: All permission checks require tenant context.
 * TenantMiddleware must run BEFORE any RBAC middleware.
 * 
 * Flow: TenantMiddleware -> authenticate -> RBAC middleware
 */

/**
 * Extract tenant_id from request context
 * @throws TenantRequiredError if context or tenant_id is missing
 */
function getTenantId(req: Request): string {
  if (!req.context?.tenant_id) {
    throw new TenantRequiredError('RBAC middleware (tenant context missing)');
  }
  return req.context.tenant_id;
}

/**
 * Require a specific permission within the tenant context
 * @param permissionName - Permission name (e.g., 'users:read')
 */
export function requirePermission(permissionName: string) {
  return asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const tenantId = getTenantId(req);
      await RBACService.requirePermission(req.user.id, tenantId, permissionName);
      next();
    }
  );
}

/**
 * Require any of the specified permissions within the tenant context
 * @param permissionNames - Array of permission names
 */
export function requireAnyPermission(...permissionNames: string[]) {
  return asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const tenantId = getTenantId(req);
      await RBACService.requireAnyPermission(req.user.id, tenantId, permissionNames);
      next();
    }
  );
}

/**
 * Require all of the specified permissions within the tenant context
 * @param permissionNames - Array of permission names
 */
export function requireAllPermissions(...permissionNames: string[]) {
  return asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const tenantId = getTenantId(req);
      await RBACService.requireAllPermissions(req.user.id, tenantId, permissionNames);
      next();
    }
  );
}

/**
 * Require permission for a resource and action within the tenant context
 * @param resource - Resource name (e.g., 'users', 'documents')
 * @param action - Action name (e.g., 'create', 'read', 'update', 'delete')
 * 
 * @example
 * router.get('/users', authenticate, requireResourcePermission('users', 'read'), handler);
 */
export function requireResourcePermission(resource: string, action: string) {
  return asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const tenantId = getTenantId(req);
      await RBACService.requireResourcePermission(req.user.id, tenantId, resource, action);
      next();
    }
  );
}

/**
 * Require a specific role within the tenant context
 * @param roleName - Role name (e.g., 'admin', 'super_admin')
 */
export function requireRole(roleName: string) {
  return asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const tenantId = getTenantId(req);
      await RBACService.requireRole(req.user.id, tenantId, roleName);
      next();
    }
  );
}

/**
 * Require super admin role (bypasses all permission checks)
 */
export function requireSuperAdmin() {
  return asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const tenantId = getTenantId(req);
      const isSuperAdmin = await RBACService.isSuperAdmin(req.user.id, tenantId);
      
      if (!isSuperAdmin) {
        throw new AuthorizationError('Super admin access required');
      }
      
      next();
    }
  );
}

/**
 * Dynamic permission checker
 * Allows checking permissions based on request parameters
 * 
 * @example
 * requireDynamicPermission((req) => `documents:${req.params.action}`)
 */
export function requireDynamicPermission(
  getPermission: (req: Request) => string | string[]
) {
  return asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const tenantId = getTenantId(req);
      const permission = getPermission(req);
      
      if (Array.isArray(permission)) {
        await RBACService.requireAnyPermission(req.user.id, tenantId, permission);
      } else {
        await RBACService.requirePermission(req.user.id, tenantId, permission);
      }

      next();
    }
  );
}
