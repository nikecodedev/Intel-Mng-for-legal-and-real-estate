import { logger } from '../utils/logger.js';

export interface RetryOptions {
  maxAttempts?: number; // Maximum number of retry attempts
  initialDelayMs?: number; // Initial delay before first retry
  maxDelayMs?: number; // Maximum delay between retries
  backoffMultiplier?: number; // Exponential backoff multiplier
  retryableErrors?: string[]; // Error messages that should trigger retry
  onRetry?: (attempt: number, error: Error) => void; // Callback on retry
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: [],
  onRetry: () => {},
};

/**
 * Retry Logic Service
 * Provides retry functionality with exponential backoff
 */
export class RetryService {
  /**
   * Execute function with retry logic
   */
  static async execute<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        if (opts.retryableErrors.length > 0) {
          const errorMessage = lastError.message.toLowerCase();
          const isRetryable = opts.retryableErrors.some(retryable =>
            errorMessage.includes(retryable.toLowerCase())
          );
          if (!isRetryable) {
            throw lastError;
          }
        }

        // Don't retry on last attempt
        if (attempt >= opts.maxAttempts) {
          throw lastError;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
          opts.maxDelayMs
        );

        logger.warn('Retrying operation', {
          attempt,
          maxAttempts: opts.maxAttempts,
          delay,
          error: lastError.message,
        });

        opts.onRetry(attempt, lastError);

        // Wait before retry
        await this.delay(delay);
      }
    }

    throw lastError || new Error('Retry failed');
  }

  /**
   * Execute with circuit breaker pattern
   */
  static createCircuitBreaker(
    options: {
      failureThreshold?: number; // Number of failures before opening circuit
      resetTimeoutMs?: number; // Time before attempting to close circuit
      halfOpenMaxAttempts?: number; // Max attempts in half-open state
    } = {}
  ) {
    const {
      failureThreshold = 5,
      resetTimeoutMs = 60000,
      halfOpenMaxAttempts = 3,
    } = options;

    let state: 'closed' | 'open' | 'half-open' = 'closed';
    let failureCount = 0;
    let lastFailureTime = 0;
    let halfOpenAttempts = 0;

    return async <T>(fn: () => Promise<T>): Promise<T> => {
      // Check circuit state
      if (state === 'open') {
        if (Date.now() - lastFailureTime > resetTimeoutMs) {
          state = 'half-open';
          halfOpenAttempts = 0;
          logger.info('Circuit breaker: transitioning to half-open');
        } else {
          throw new Error('Circuit breaker is OPEN. Service unavailable.');
        }
      }

      try {
        const result = await fn();

        // Success: reset failure count
        if (state === 'half-open') {
          halfOpenAttempts++;
          if (halfOpenAttempts >= halfOpenMaxAttempts) {
            state = 'closed';
            failureCount = 0;
            logger.info('Circuit breaker: closed (service recovered)');
          }
        } else {
          failureCount = 0;
        }

        return result;
      } catch (error) {
        failureCount++;
        lastFailureTime = Date.now();

        if (state === 'half-open') {
          state = 'open';
          logger.warn('Circuit breaker: opened (half-open attempt failed)');
        } else if (failureCount >= failureThreshold) {
          state = 'open';
          logger.error('Circuit breaker: opened (threshold exceeded)', {
            failureCount,
            threshold: failureThreshold,
          });
        }

        throw error;
      }
    };
  }

  /**
   * Delay helper
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
