/**
 * Pagination helpers for list endpoints.
 * Parses limit/offset from query with safe defaults and caps.
 */

export interface PaginationParams {
  limit: number;
  offset: number;
}

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

/**
 * Parse limit and offset from request query.
 * @param query - req.query (or subset)
 * @param defaultLimit - default page size (default 50)
 * @param maxLimit - cap for limit (default 100)
 */
export function parsePagination(
  query: Record<string, unknown>,
  defaultLimit: number = DEFAULT_LIMIT,
  maxLimit: number = 100
): PaginationParams {
  const rawLimit = query?.limit;
  const rawOffset = query?.offset;

  let limit = defaultLimit;
  if (rawLimit !== undefined && rawLimit !== null && rawLimit !== '') {
    const parsed = parseInt(String(rawLimit), 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, maxLimit);
    }
  }

  let offset = DEFAULT_OFFSET;
  if (rawOffset !== undefined && rawOffset !== null && rawOffset !== '') {
    const parsed = parseInt(String(rawOffset), 10);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      offset = parsed;
    }
  }

  return { limit, offset };
}
