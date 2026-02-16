/**
 * Log Sanitization Utility
 * Removes sensitive data from logs to prevent exposure in production
 */

const SENSITIVE_FIELDS = [
  'password',
  'password_hash',
  'passwordHash',
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'apiKey',
  'apikey',
  'secret',
  'jwt_secret',
  'jwtSecret',
  'authorization',
  'auth',
  'credit_card',
  'creditCard',
  'card_number',
  'cardNumber',
  'cvv',
  'ssn',
  'social_security',
  'private_key',
  'privateKey',
  'secret_key',
  'secretKey',
];

const SENSITIVE_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /key/i,
  /auth/i,
  /credential/i,
];

/**
 * Recursively sanitize an object by removing sensitive fields
 */
export function sanitizeLogData(data: unknown, depth = 0, maxDepth = 10): unknown {
  // Prevent infinite recursion
  if (depth > maxDepth) {
    return '[Max Depth Reached]';
  }

  // Handle null/undefined
  if (data === null || data === undefined) {
    return data;
  }

  // Handle primitives
  if (typeof data !== 'object') {
    return data;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogData(item, depth + 1, maxDepth));
  }

  // Handle objects
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();

    // Check if field name matches sensitive patterns
    const isSensitive = SENSITIVE_FIELDS.some((field) => lowerKey.includes(field.toLowerCase())) ||
      SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeLogData(value, depth + 1, maxDepth);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitize request body for logging
 */
export function sanitizeRequestBody(body: unknown): unknown {
  return sanitizeLogData(body);
}

/**
 * Sanitize query parameters for logging
 */
export function sanitizeQueryParams(query: unknown): unknown {
  return sanitizeLogData(query);
}

/**
 * Sanitize error object for logging
 */
export function sanitizeError(error: Error | unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      // Stack traces are safe to log (they don't contain sensitive data)
      stack: error.stack,
    };
  }
  return sanitizeLogData(error) as Record<string, unknown>;
}
