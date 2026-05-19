/**
 * Task Runner — Retry decorator for execution layer
 */

import { executeWithRetry, executeWithTimeout } from '../concurrency/index.js';
import type { RetryOptions, RetryResult } from '../types.js';

export type TaskFunction<T> = () => Promise<T>;

export interface RunTaskOptions extends RetryOptions {
  agentName: string;
  timeoutMs?: number;
}

/**
 * Run a task with both timeout and retry policies applied.
 */
export async function runTask<T>(
  task: TaskFunction<T>,
  options: RunTaskOptions
): Promise<RetryResult<T>> {
  const { agentName, timeoutMs, ...retryOptions } = options;

  return executeWithRetry(() => executeWithTimeout(task, agentName, timeoutMs), retryOptions);
}
