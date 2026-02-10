/**
 * TenantMiddleware - Middleware de Isolamento (Fonte 73, Fonte 5 - Motor Payton)
 * "Muro de Gelo": nenhuma requisição ultrapassa sem provar origem (Tenant) e intenção.
 * Nível 0: intercepta antes de Controllers/Services.
 */

import { Request, Response, NextFunction } from 'express';
import { AuthService, JWTPayload } from '../services/auth.js';
import { InvestorAuthService, InvestorJWTPayload } from '../services/investor-auth.js';
import { getTenantById } from '../services/tenant.js';
import type { UserContext } from '../types/user-context.js';
import {
  AuthenticationError,
  AuthorizationError,
  PaymentRequiredError,
  TenantAccountSuspendedError,
} from '../utils/errors.js';
import { asyncHandler } from './validator.js';
import { logger } from '../utils/logger.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Paths that bypass tenant isolation (no JWT required) */
const SKIP_PATHS = [
  '/health',
  '/', // Root API endpoint (when accessed as /api/v1/)
  '/api/v1', // API info/documentation endpoint - public access
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/investor/auth/login',
  '/investor/auth/refresh',
];

function normalizePath(path: string): string {
  return path.replace(/\/$/, '') || '/';
}

function shouldSkipTenantMiddleware(path: string): boolean {
  const p = normalizePath(path);
  // Check exact match or if path is root (/)
  if (p === '/' || p === '') {
    return SKIP_PATHS.includes('/') || SKIP_PATHS.includes('/api/v1');
  }
  return SKIP_PATHS.some((s) => p === s || p.startsWith(s + '/'));
}

declare global {
  namespace Express {
    interface Request {
      /** Injected by TenantMiddleware (Fonte 2 - UserContext) */
      context?: UserContext;
    }
  }
}

/**
 * Check if path is investor route
 */
function isInvestorRoute(path: string): boolean {
  return path.startsWith('/investor/');
}

/**
 * Extract tenant identity from JWT (Fonte 5 - Seção 2).
 * Primary source: Authorization Bearer token. tid, uid, role from payload.
 * Supports both regular users and investors.
 */
function extractTenantIdentity(req: Request): { tid: string; uid: string; role: 'OWNER' | 'REVISOR' | 'OPERATIONAL' | 'INVESTOR' } {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    throw new AuthenticationError('Token Ausente');
  }
  const token = auth.slice(7);
  
  // Check if this is an investor route
  if (isInvestorRoute(req.path)) {
    try {
      const payload: InvestorJWTPayload = InvestorAuthService.verifyToken(token);
      const tid = payload.tid;
      if (!tid || typeof tid !== 'string') {
        throw new AuthenticationError("FATAL: Token inválido - Claim 'tid' ausente");
      }
      const uid = payload.uid ?? payload.investorId;
      return { tid, uid: String(uid), role: 'INVESTOR' };
    } catch (error) {
      // If investor token fails, try regular token (for backwards compatibility)
      // But investor routes should use investor tokens
      if (isInvestorRoute(req.path)) {
        throw error;
      }
    }
  }
  
  // Regular user token
  const payload: JWTPayload = AuthService.verifyToken(token);
  const tid = payload.tid;
  if (!tid || typeof tid !== 'string') {
    throw new AuthenticationError("FATAL: Token inválido - Claim 'tid' ausente");
  }
  const uid = payload.uid ?? payload.userId;
  const role = payload.role ?? 'OPERATIONAL';
  const r: 'OWNER' | 'REVISOR' | 'OPERATIONAL' =
    role === 'OWNER' || role === 'REVISOR' || role === 'OPERATIONAL' ? role : 'OPERATIONAL';
  return { tid, uid: String(uid), role: r };
}

/**
 * TenantMiddleware - Hard Gate, Context Injection, Exception Mapping.
 */
export const tenantMiddleware = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const path = req.path;

    if (shouldSkipTenantMiddleware(path)) {
      return next();
    }

    let tid: string;
    let uid: string;
    let role: 'OWNER' | 'REVISOR' | 'OPERATIONAL' | 'INVESTOR';

    try {
      const identity = extractTenantIdentity(req);
      tid = identity.tid;
      uid = identity.uid;
      role = identity.role;
    } catch (e) {
      if (e instanceof AuthenticationError) {
        throw e;
      }
      throw new AuthenticationError('Token inválido ou expirado');
    }

    if (!UUID_REGEX.test(tid)) {
      throw new AuthorizationError('Acesso negado');
    }

    const tenant = await getTenantById(tid);
    if (!tenant) {
      throw new AuthorizationError('Acesso negado');
    }

    if (tenant.status === 'SUSPENDED') {
      throw new PaymentRequiredError('Account suspended');
    }
    if (tenant.status === 'BLOCKED') {
      throw new TenantAccountSuspendedError('Entre em contato com o financeiro.');
    }
    if (tenant.status !== 'ACTIVE') {
      throw new TenantAccountSuspendedError('Entre em contato com o financeiro.');
    }

    const ctx: UserContext = {
      user_id: uid,
      tenant_id: tid,
      role,
      ip_address: req.ip ?? req.socket?.remoteAddress,
    };
    req.context = ctx;

    logger.debug('Tenant context injected', {
      tenant_id: tid,
      user_id: uid,
      role,
      path,
    });

    next();
  }
);

export default tenantMiddleware;
