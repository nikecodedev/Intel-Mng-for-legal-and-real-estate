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
} from './tenant-context.js';

// Error Classes
export {
  AppError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  PaymentRequiredError,
  TenantAccountSuspendedError,
  TenantRequiredError,
  InvalidTransitionError,
  InternalServerError,
  formatErrorResponse,
  type ErrorResponse,
} from './errors.js';

// Logger
export { logger } from './logger.js';

// Pagination
export { parsePagination, type PaginationParams } from './pagination.js';
