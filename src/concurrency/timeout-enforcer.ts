/**
 * Timeout Enforcer — Hard timeout wrapper for task execution
 */

import { TimeoutError } from '../types.js';

const DEFAULT_TIMEOUT_MS = 60000;

const AGENT_TIMEOUTS: Record<string, number> = {
  scraper: 45000,
  linter: 60000,
  coder: 120000,
  tester: 120000,
};

export function resolveTimeout(agentName: string): number {
  for (const [key, value] of Object.entries(AGENT_TIMEOUTS)) {
    if (agentName.toLowerCase().includes(key)) {
      return value;
    }
  }
  return DEFAULT_TIMEOUT_MS;
}

export async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  agentName: string,
  timeoutMs?: number
): Promise<T> {
  const resolvedTimeout = timeoutMs ?? resolveTimeout(agentName);
  const startTime = Date.now();

  let resolved = false;

  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      if (!resolved) {
        const elapsedMs = Date.now() - startTime;
        reject(new TimeoutError(agentName, resolvedTimeout, elapsedMs));
      }
    }, resolvedTimeout);

    timer.unref?.();
  });

  try {
    const result = await Promise.race([fn(), timeoutPromise]);
    resolved = true;
    return result;
  } catch (error) {
    resolved = true;
    if (error instanceof TimeoutError) {
      throw error;
    }
    throw error;
  }
}
