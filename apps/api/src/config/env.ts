import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Environment variable schema validation
 * Ensures all required environment variables are present and valid
 * Production mode enforces stricter validation
 */
const isProduction = process.env.NODE_ENV === 'production';

const baseEnvSchema = z.object({
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

// Production-specific validations
const productionEnvSchema = baseEnvSchema.extend({
  // In production, CORS_ORIGIN cannot be wildcard
  CORS_ORIGIN: z.string().refine(
    (val) => val !== '*',
    { message: 'CORS_ORIGIN cannot be "*" in production. Specify allowed origins.' }
  ),
  // In production, JWT_SECRET must be at least 64 characters
  JWT_SECRET: z.string().min(64, 'JWT_SECRET must be at least 64 characters in production'),
  // In production, require Redis password if Redis is enabled
  REDIS_PASSWORD: z.string().min(1, 'REDIS_PASSWORD is required in production when Redis is enabled').optional(),
});

// Use production schema if in production, otherwise base schema
const envSchema = isProduction ? productionEnvSchema : baseEnvSchema;

type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validates and returns environment configuration
 * Throws error if validation fails
 * Production mode enforces stricter validation
 */
function validateEnv(): EnvConfig {
  try {
    const result = envSchema.parse(process.env);
    
    // Additional production checks
    if (isProduction) {
      // Ensure no development fallbacks are used
      if (result.CORS_ORIGIN === '*') {
        throw new Error('CORS_ORIGIN cannot be "*" in production');
      }
      if (result.JWT_SECRET.length < 64) {
        throw new Error('JWT_SECRET must be at least 64 characters in production');
      }
      if (result.REDIS_ENABLED && !result.REDIS_PASSWORD) {
        throw new Error('REDIS_PASSWORD is required in production when Redis is enabled');
      }
    }
    
    return result;
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

