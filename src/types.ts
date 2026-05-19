/**
 * Boomerang v3 — Concurrency Type Definitions
 */

export interface AgentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  skills: string[];
}

export interface ConcurrencyConfig {
  maxConcurrentSubAgents: number;
  defaultTimeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  agentTimeouts: Record<string, number>;
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  isRetryable?: (error: Error) => boolean;
}

export interface RetryResult<T> {
  result: T;
  attempts: number;
  totalDelayMs: number;
  lastError?: Error;
}

export interface SlotUsage {
  active: number;
  max: number;
  available: number;
  agents: Array<{name: string; startTime: number; elapsedMs: number}>;
}

export class TimeoutError extends Error {
  agentName: string;
  timeoutMs: number;
  elapsedMs: number;

  constructor(agentName: string, timeoutMs: number, elapsedMs: number) {
    super(
      `TimeoutError: Agent "${agentName}" exceeded ${timeoutMs}ms (elapsed: ${elapsedMs}ms)`
    );
    this.name = 'TimeoutError';
    this.agentName = agentName;
    this.timeoutMs = timeoutMs;
    this.elapsedMs = elapsedMs;
  }
}
