/**
 * Tenant Isolation Utilities
 * Provides repository-level protection against cross-tenant data access
 * 
 * SECURITY: All database queries MUST include tenant_id filtering
 * This utility provides helper functions to enforce tenant isolation
 */

import { TenantRequiredError } from './errors.js';

/**
 * Validate tenant ID is present and valid
 * @throws TenantRequiredError if tenantId is missing or invalid
 */
export function requireTenantId(
  tenantId: string | undefined | null,
  operation: string
): asserts tenantId is string {
  if (!tenantId) {
    throw new TenantRequiredError(`Tenant ID required for ${operation}`);
  }
  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(tenantId)) {
    throw new TenantRequiredError(`Invalid tenant ID format for ${operation}`);
  }
}

/**
 * Ensure a WHERE clause includes tenant_id filtering.
 * HARD ENFORCEMENT: throws TenantRequiredError if query does not include tenant_id,
 * to prevent accidental cross-tenant data access.
 *
 * Detection uses a simple regex; parameterized queries use $1, $2, etc.
 *
 * @param query - SQL query string
 * @param tenantId - Tenant ID to enforce
 * @returns The same query string (validated)
 * @throws TenantRequiredError if query appears to lack tenant_id filter
 */
export function enforceTenantFilter(query: string, tenantId: string): string {
  requireTenantId(tenantId, 'enforceTenantFilter');

  const normalized = query.replace(/\s+/g, ' ').trim();
  const hasTenantFilter =
    /\btenant_id\s*=\s*\$?\d+/i.test(normalized) ||
    /\$?\d+\s*=\s*tenant_id\b/i.test(normalized) ||
    /\btenant_id\s*IN\s*\(/i.test(normalized);

  if (!hasTenantFilter) {
    throw new TenantRequiredError(
      `Query missing tenant_id filter (security: cross-tenant prevention). Query prefix: ${normalized.substring(0, 120)}...`
    );
  }

  return query;
}

/**
 * Validate that a result set belongs to the expected tenant
 * Use this after queries to ensure no cross-tenant data leakage
 * 
 * @param results - Query results
 * @param expectedTenantId - Expected tenant ID
 * @param resourceType - Type of resource (for error messages)
 */
export function validateTenantOwnership<T extends { tenant_id?: string }>(
  results: T[],
  expectedTenantId: string,
  resourceType = 'resource'
): void {
  requireTenantId(expectedTenantId, 'validateTenantOwnership');
  
  for (const result of results) {
    if (result.tenant_id && result.tenant_id !== expectedTenantId) {
      throw new TenantRequiredError(
        `Cross-tenant access detected: ${resourceType} belongs to different tenant`
      );
    }
  }
}

/**
 * Create a safe WHERE clause that includes tenant_id
 * Use this helper to build queries that are guaranteed to be tenant-isolated
 * 
 * @param baseWhere - Base WHERE clause (without tenant_id)
 * @param tenantId - Tenant ID
 * @param paramIndex - Starting parameter index (default: 1)
 * @returns Complete WHERE clause with tenant_id filter
 */
export function buildTenantWhereClause(
  baseWhere: string,
  tenantId: string,
  paramIndex = 1
): { clause: string; params: string[] } {
  requireTenantId(tenantId, 'buildTenantWhereClause');
  
  const tenantFilter = `tenant_id = $${paramIndex}`;
  const whereClause = baseWhere
    ? `${baseWhere} AND ${tenantFilter}`
    : `WHERE ${tenantFilter}`;
  
  return {
    clause: whereClause,
    params: [tenantId],
  };
}
