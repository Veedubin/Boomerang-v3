/**
 * Retry Executor — Exponential backoff with jitter for transient failures
 */

import type { RetryOptions, RetryResult } from '../types.js';
import { TimeoutError } from '../types.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const capped = Math.min(exponential, maxDelayMs);
  const jitter = Math.random() * (capped / 2);
  return Math.floor(capped + jitter);
}

const DEFAULT_IS_RETRYABLE = (error: Error): boolean => {
  return !(error instanceof TimeoutError);
};

export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 30000;
  const isRetryable = options.isRetryable ?? DEFAULT_IS_RETRYABLE;

  let lastError: Error | undefined;
  let totalDelayMs = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return {
        result,
        attempts: attempt + 1,
        totalDelayMs,
        lastError,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt >= maxRetries || !isRetryable(lastError)) {
        throw lastError;
      }
      const delay = calculateDelay(attempt, baseDelayMs, maxDelayMs);
      totalDelayMs += delay;
      await sleep(delay);
    }
  }

  throw lastError ?? new Error('Retry exhausted with no error');
}
