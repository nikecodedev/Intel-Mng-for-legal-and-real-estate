import { Request } from 'express';
import { TenantRequiredError } from './errors.js';
import type { UserContext } from '../types/user-context.js';

/**
 * Tenant context extracted from request
 * Set by TenantMiddleware (req.context)
 */
export interface TenantContext {
  tenantId: string;
  userId: string;
  role: 'OWNER' | 'REVISOR' | 'OPERATIONAL' | 'INVESTOR';
}

/**
 * Extract tenant context from request
 * 
 * IMPORTANT: TenantMiddleware must run BEFORE calling this helper.
 * This helper is the ONLY source of tenant context in route handlers.
 * 
 * @param req - Express request with context set by TenantMiddleware
 * @throws TenantRequiredError if tenant context is missing
 * @returns TenantContext with tenantId, userId, and role
 * 
 * @example
 * router.get('/', authenticate, async (req, res) => {
 *   const { tenantId, userId, role } = getTenantContext(req);
 *   const user = await UserModel.findById(id, tenantId);
 * });
 */
export function getTenantContext(req: Request): TenantContext {
  if (!req.context) {
    throw new TenantRequiredError('getTenantContext (req.context missing - TenantMiddleware not applied)');
  }
  
  if (!req.context.tenant_id) {
    throw new TenantRequiredError('getTenantContext (tenant_id missing from context)');
  }
  
  if (!req.context.user_id) {
    throw new TenantRequiredError('getTenantContext (user_id missing from context)');
  }
  
  return {
    tenantId: req.context.tenant_id,
    userId: req.context.user_id,
    role: req.context.role,
  };
}

/**
 * Get tenant context or return undefined (for optional tenant routes)
 * Use this only for routes that may or may not have tenant context
 * 
 * @param req - Express request
 * @returns TenantContext or undefined
 */
export function getOptionalTenantContext(req: Request): TenantContext | undefined {
  if (!req.context?.tenant_id || !req.context?.user_id) {
    return undefined;
  }
  
  return {
    tenantId: req.context.tenant_id,
    userId: req.context.user_id,
    role: req.context.role,
  };
}

/**
 * Get raw user context from request (full UserContext interface)
 * 
 * @param req - Express request
 * @returns UserContext or undefined
 */
export function getUserContext(req: Request): UserContext | undefined {
  return req.context;
}

/**
 * Require user context - throws if missing
 * 
 * @param req - Express request
 * @throws TenantRequiredError if context is missing
 * @returns UserContext
 */
export function requireUserContext(req: Request): UserContext {
  if (!req.context) {
    throw new TenantRequiredError('requireUserContext (context missing)');
  }
  return req.context;
}
