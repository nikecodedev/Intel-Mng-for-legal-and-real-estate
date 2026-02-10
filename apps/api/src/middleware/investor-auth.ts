import { Request, Response, NextFunction } from 'express';
import { InvestorAuthService, InvestorJWTPayload } from '../services/investor-auth';
import { InvestorUserModel } from '../models/investor-user';
import { AuthenticationError } from '../utils/errors';
import { asyncHandler } from './validator';
import { getTenantContext } from '../utils/tenant-context';
import { AuditService, AuditAction, AuditEventCategory } from '../services/audit';
import { logger } from '../utils/logger';

/**
 * Extend Express Request to include investor
 */
declare global {
  namespace Express {
    interface Request {
      investor?: {
        id: string;
        email: string;
        tenant_id: string;
        investor: Awaited<ReturnType<typeof InvestorUserModel.findById>>;
      };
    }
  }
}

/**
 * Investor authentication middleware
 * Verifies investor JWT token and attaches investor to request
 * Enforces tenant isolation and updates last activity
 */
export const authenticateInvestor = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Authorization token required');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const payload: InvestorJWTPayload = InvestorAuthService.verifyToken(token);

    // Get investor from database
    if (!payload.tid) {
      throw new AuthenticationError('Token missing tenant ID');
    }

    const investor = await InvestorUserModel.findById(payload.investorId, payload.tid);

    if (!investor) {
      throw new AuthenticationError('Investor not found');
    }

    if (!investor.is_active) {
      throw new AuthenticationError('Investor account is inactive');
    }

    // Verify tenant context matches token
    const tenantContext = getTenantContext(req);
    if (tenantContext.tenantId !== investor.tenant_id) {
      logger.warn('Investor tenant mismatch', {
        investorId: investor.id,
        tokenTenantId: payload.tid,
        contextTenantId: tenantContext.tenantId,
      });
      throw new AuthenticationError('Tenant mismatch');
    }

    // Update last activity
    await InvestorUserModel.updateLastActivity(investor.id, investor.tenant_id);

    // Attach investor to request
    req.investor = {
      id: investor.id,
      email: investor.email,
      tenant_id: investor.tenant_id,
      investor,
    };

    // Audit investor access
    await AuditService.log({
      tenantId: investor.tenant_id,
      userId: investor.id,
      userEmail: investor.email,
      userRole: 'INVESTOR',
      action: AuditAction.READ,
      eventType: 'investor.access',
      eventCategory: AuditEventCategory.AUTHENTICATION,
      resourceType: 'investor_portal',
      description: 'Investor portal access',
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    });

    next();
  }
);

/**
 * Require investor authentication
 * Throws error if investor is not authenticated
 */
export const requireInvestor = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.investor) {
    throw new AuthenticationError('Investor authentication required');
  }
  next();
};
