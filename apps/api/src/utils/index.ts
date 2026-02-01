/**
 * Utilities Index
 * 
 * Central export point for utility functions
 */

// Tenant Context Helpers
export { 
  getTenantContext, 
  getOptionalTenantContext,
  getUserContext,
  requireUserContext,
  type TenantContext 
} from './tenant-context';

// Error Classes
export {
  AppError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  ExternalServiceError,
  PaymentRequiredError,
  TenantAccountSuspendedError,
  TenantRequiredError,
} from './errors';

// Logger
export { logger } from './logger';
