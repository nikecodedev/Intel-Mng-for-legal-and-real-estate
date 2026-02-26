import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../utils/errors.js';

type RequestSchemas =
  | { body?: ZodSchema; query?: ZodSchema; params?: ZodSchema }
  | z.ZodObject<{ body?: ZodSchema; query?: ZodSchema; params?: ZodSchema }>;

function getBodySchema(schemas: RequestSchemas): ZodSchema | undefined {
  return 'shape' in schemas && schemas.shape?.body ? (schemas.shape as { body?: ZodSchema }).body : (schemas as { body?: ZodSchema }).body;
}
function getQuerySchema(schemas: RequestSchemas): ZodSchema | undefined {
  return 'shape' in schemas && schemas.shape?.query ? (schemas.shape as { query?: ZodSchema }).query : (schemas as { query?: ZodSchema }).query;
}
function getParamsSchema(schemas: RequestSchemas): ZodSchema | undefined {
  return 'shape' in schemas && schemas.shape?.params ? (schemas.shape as { params?: ZodSchema }).params : (schemas as { params?: ZodSchema }).params;
}

/**
 * Request validation middleware factory
 * Validates request data (body, query, params) against Zod schemas.
 * Accepts either { body, query, params } or a single ZodObject with shape { body?, query?, params? }.
 */
export function validateRequest(schemas: RequestSchemas) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const bodySchema = getBodySchema(schemas);
      const querySchema = getQuerySchema(schemas);
      const paramsSchema = getParamsSchema(schemas);

      if (bodySchema) {
        req.body = await bodySchema.parseAsync(req.body);
      }
      if (querySchema) {
        req.query = await querySchema.parseAsync(req.query);
      }
      if (paramsSchema) {
        req.params = await paramsSchema.parseAsync(req.params);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        next(
          new ValidationError('Validation failed', {
            errors: details,
            field: error.errors[0]?.path.join('.'),
          })
        );
      } else {
        next(error);
      }
    }
  };
}

/**
 * Async handler wrapper
 * Automatically catches async errors and passes them to error handler
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}


