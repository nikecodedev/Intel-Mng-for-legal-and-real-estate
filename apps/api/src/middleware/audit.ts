import { Request, Response, NextFunction } from 'express';
import { AuditService, AuditAction } from '../services/audit.js';
import { asyncHandler } from './validator.js';
import { logger } from '../utils/logger.js';
import { getTenantContext } from '../utils/tenant-context.js';

/**
 * Audit middleware factory
 * Automatically logs HTTP requests based on method
 * 
 * IMPORTANT: tenant_id is extracted from req.context (set by TenantMiddleware)
 * This middleware MUST run AFTER TenantMiddleware
 */
export function auditMiddleware(options?: {
  logReads?: boolean; // Log GET requests (default: false for performance)
  resourceType?: string; // Override resource type detection
  skipPaths?: string[]; // Paths to skip audit logging
}) {
  const { logReads = false, resourceType, skipPaths = [] } = options || {};

  return asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      // Skip audit logging for excluded paths
      if (skipPaths.some((path) => req.path.startsWith(path))) {
        return next();
      }

      // Skip if no user (unauthenticated requests)
      if (!req.user) {
        return next();
      }

      // Skip if no tenant context (should not happen after TenantMiddleware)
      if (!req.context?.tenant_id) {
        logger.warn('Audit middleware: missing tenant context', { path: req.path });
        return next();
      }

      // Determine resource type from route
      const detectedResourceType = resourceType || detectResourceType(req.path, req.method);

      // Determine action from HTTP method
      const action = getActionFromMethod(req.method);

      // Skip read operations if not configured to log them
      if (action === AuditAction.READ && !logReads) {
        return next();
      }

      // Capture response for audit logging
      const originalSend = res.send;
      const originalJson = res.json;

      // Override res.send to capture response
      res.send = function (body: unknown) {
        logAuditEvent(req, res, action, detectedResourceType, body);
        return originalSend.call(this, body);
      };

      res.json = function (body: unknown) {
        logAuditEvent(req, res, action, detectedResourceType, body);
        return originalJson.call(this, body);
      };

      next();
    }
  );
}

/**
 * Log audit event after response
 * Uses tenant_id from req.context (NEVER from headers)
 */
async function logAuditEvent(
  req: Request,
  res: Response,
  action: AuditAction,
  resourceType: string,
  responseBody: unknown
): Promise<void> {
  try {
    // Get tenant context - REQUIRED
    const tenantId = req.context?.tenant_id;
    if (!tenantId) {
      logger.warn('Audit event skipped: no tenant context', { path: req.path });
      return;
    }

    const userId = req.user!.id;
    const userEmail = req.user!.email;
    const userRole = req.context?.role;

    // Extract resource ID from response or params
    const resourceId = extractResourceId(req, res, responseBody);

    if (action === AuditAction.READ) {
      await AuditService.logAccess(
        tenantId,
        resourceType,
        resourceId,
        userId,
        userEmail,
        userRole,
        req,
        {
          status_code: res.statusCode,
        }
      );
    } else {
      await AuditService.logDataChange(
        tenantId,
        action as AuditAction.CREATE | AuditAction.UPDATE | AuditAction.DELETE,
        resourceType,
        resourceId || 'unknown',
        userId,
        userEmail,
        userRole,
        req,
        {
          status_code: res.statusCode,
          response_size: JSON.stringify(responseBody).length,
        },
        extractResourceIdentifier(req, responseBody)
      );
    }
  } catch (error) {
    // Never break the request flow due to audit logging errors
    logger.error('Failed to log audit event in middleware', { error });
  }
}

/**
 * Detect resource type from request path
 */
function detectResourceType(path: string, method: string): string {
  // Remove API version prefix
  const cleanPath = path.replace(/^\/api\/v\d+\//, '');

  // Extract resource from path (e.g., /users/123 -> users)
  const parts = cleanPath.split('/').filter((p) => p && !p.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i));

  if (parts.length > 0) {
    return parts[0].replace(/s$/, ''); // Remove plural 's'
  }

  return 'unknown';
}

/**
 * Get audit action from HTTP method
 */
function getActionFromMethod(method: string): AuditAction {
  const methodMap: Record<string, AuditAction> = {
    GET: AuditAction.READ,
    POST: AuditAction.CREATE,
    PUT: AuditAction.UPDATE,
    PATCH: AuditAction.UPDATE,
    DELETE: AuditAction.DELETE,
  };

  return methodMap[method.toUpperCase()] || AuditAction.READ;
}

/**
 * Extract resource ID from request or response
 */
function extractResourceId(req: Request, res: Response, responseBody: unknown): string | null {
  // Try params first
  if (req.params.id) {
    return req.params.id;
  }

  // Try response body
  if (responseBody && typeof responseBody === 'object') {
    const body = responseBody as Record<string, unknown>;
    if (body.data && typeof body.data === 'object') {
      const data = body.data as Record<string, unknown>;
      if (data.id) {
        return String(data.id);
      }
    }
    if (body.id) {
      return String(body.id);
    }
  }

  return null;
}

/**
 * Extract human-readable resource identifier
 */
function extractResourceIdentifier(req: Request, responseBody: unknown): string | undefined {
  if (responseBody && typeof responseBody === 'object') {
    const body = responseBody as Record<string, unknown>;
    if (body.data && typeof body.data === 'object') {
      const data = body.data as Record<string, unknown>;
      // Try common identifier fields
      if (data.email) return String(data.email);
      if (data.name) return String(data.name);
      if (data.title) return String(data.title);
      if (data.process_number) return String(data.process_number);
    }
  }

  return undefined;
}

/**
 * Manual audit logging helper
 * Use this in controllers for custom audit events
 * 
 * IMPORTANT: All methods extract tenant_id from req.context
 * TenantMiddleware MUST run before using these helpers
 */
export const audit = {
  /**
   * Log a create operation
   */
  logCreate: async (
    req: Request,
    resourceType: string,
    resourceId: string,
    details?: Record<string, unknown>,
    resourceIdentifier?: string
  ): Promise<void> => {
    if (!req.user) return;

    // Get tenant context - REQUIRED
    const { tenantId } = getTenantContext(req);

    // Fetch user role from database
    const { RoleModel } = await import('../models/role');
    const roles = await RoleModel.findByUserId(req.user.id, tenantId);
    const userRole = roles[0]?.name;

    await AuditService.logDataChange(
      tenantId,
      AuditAction.CREATE,
      resourceType,
      resourceId,
      req.user.id,
      req.user.email,
      userRole,
      req,
      details,
      resourceIdentifier
    );
  },

  /**
   * Log an update operation
   */
  logUpdate: async (
    req: Request,
    resourceType: string,
    resourceId: string,
    details?: Record<string, unknown>,
    resourceIdentifier?: string
  ): Promise<void> => {
    if (!req.user) return;

    const { tenantId } = getTenantContext(req);

    const { RoleModel } = await import('../models/role');
    const roles = await RoleModel.findByUserId(req.user.id, tenantId);
    const userRole = roles[0]?.name;

    await AuditService.logDataChange(
      tenantId,
      AuditAction.UPDATE,
      resourceType,
      resourceId,
      req.user.id,
      req.user.email,
      userRole,
      req,
      details,
      resourceIdentifier
    );
  },

  /**
   * Log a delete operation
   */
  logDelete: async (
    req: Request,
    resourceType: string,
    resourceId: string,
    details?: Record<string, unknown>,
    resourceIdentifier?: string
  ): Promise<void> => {
    if (!req.user) return;

    const { tenantId } = getTenantContext(req);

    const { RoleModel } = await import('../models/role');
    const roles = await RoleModel.findByUserId(req.user.id, tenantId);
    const userRole = roles[0]?.name;

    await AuditService.logDataChange(
      tenantId,
      AuditAction.DELETE,
      resourceType,
      resourceId,
      req.user.id,
      req.user.email,
      userRole,
      req,
      details,
      resourceIdentifier
    );
  },

  /**
   * Log a read operation
   */
  logRead: async (
    req: Request,
    resourceType: string,
    resourceId: string | null,
    details?: Record<string, unknown>
  ): Promise<void> => {
    if (!req.user) return;

    const { tenantId } = getTenantContext(req);

    const { RoleModel } = await import('../models/role');
    const roles = await RoleModel.findByUserId(req.user.id, tenantId);
    const userRole = roles[0]?.name;

    await AuditService.logAccess(
      tenantId,
      resourceType,
      resourceId,
      req.user.id,
      req.user.email,
      userRole,
      req,
      details
    );
  },
};
