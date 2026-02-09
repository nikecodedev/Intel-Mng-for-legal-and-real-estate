import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Environment variable schema validation
 * Ensures all required environment variables are present and valid
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().regex(/^\d+$/).transform(Number).default('3000'),
  API_VERSION: z.string().default('v1'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  
  // Security
  CORS_ORIGIN: z.string().default('*'),
  RATE_LIMIT_WINDOW_MS: z.string().regex(/^\d+$/).transform(Number).default('900000'), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.string().regex(/^\d+$/).transform(Number).default('100'),
  
  // Database
  DATABASE_URL: z.string().url(),
  
  // JWT Authentication
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  
  // RBAC
  RBAC_ENABLED: z.string().transform((val) => val === 'true').default('true'),
  
  // Audit Logging
  AUDIT_LOG_LEVEL: z.enum(['minimal', 'standard', 'verbose']).default('standard'),
  
  // Redis
  REDIS_URL: z.string().url().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().regex(/^\d+$/).transform(Number).default('6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.string().regex(/^\d+$/).transform(Number).default('0'),
  REDIS_ENABLED: z.string().transform((val) => val === 'true').default('true'),

  // Tenant (Fonte 5 - Motor Payton) – default tenant when user has no association
  DEFAULT_TENANT_ID: z.string().uuid().optional(),

  // Gemini (Fase 2 – document processor: OCR Vision fallback + FPDN)
  GEMINI_API_KEY: z.string().min(1).optional(),
});

type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validates and returns environment configuration
 * Throws error if validation fails
 */
function validateEnv(): EnvConfig {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map((err) => `${err.path.join('.')}: ${err.message}`);
      throw new Error(
        `Invalid environment configuration:\n${missingVars.join('\n')}`
      );
    }
    throw error;
  }
}

export const env = validateEnv();

/**
 * Type-safe environment configuration
 */
export const config = {
  app: {
    env: env.NODE_ENV,
    port: env.PORT,
    apiVersion: env.API_VERSION,
    isDevelopment: env.NODE_ENV === 'development',
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
  },
  security: {
    corsOrigin: env.CORS_ORIGIN,
    rateLimit: {
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    },
  },
  logging: {
    level: env.LOG_LEVEL,
  },
  database: {
    url: env.DATABASE_URL,
  },
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },
  rbac: {
    enabled: env.RBAC_ENABLED,
  },
  audit: {
    logLevel: env.AUDIT_LOG_LEVEL,
  },
  redis: {
    enabled: env.REDIS_ENABLED,
    url: env.REDIS_URL,
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    db: env.REDIS_DB,
  },
  tenant: {
    defaultTenantId: env.DEFAULT_TENANT_ID,
  },
  gemini: {
    apiKey: env.GEMINI_API_KEY,
  },
} as const;

