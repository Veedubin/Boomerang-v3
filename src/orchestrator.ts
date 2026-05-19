const ROUTING_MATRIX: Record<string, string> = {
  'code-implementation': 'boomerang-coder',
  'architecture-design': 'boomerang-architect',
  'file-finding': 'boomerang-explorer',
  'testing': 'boomerang-tester',
  'linting': 'boomerang-linter',
  'git': 'boomerang-git',
  'documentation': 'boomerang-writer',
  'web-scraping': 'boomerang-scraper',
  'mcp-debug': 'mcp-specialist',
  'release': 'boomerang-release',
};

function validateAgentRouting(taskType: string, agentName: string): boolean {
  const expected = ROUTING_MATRIX[taskType];
  if (expected && expected !== agentName) {
    console.warn(
      `ROUTING VIOLATION: ${taskType} should use ${expected}, not ${agentName}`
    );
    return false;
  }
  return true;
}

/**
 * Boomerang Orchestrator v3 — Concurrency-aware pure decision layer
 *
 * Integrates TaskLimiter, RetryExecutor, and TimeoutEnforcer
 * before dispatching to sub-agents.
 */

import type {
  AgentDefinition,
  ConcurrencyConfig,
  SlotUsage,
} from './types.js';
import {
  TaskLimiter,
  executeWithRetry,
  executeWithTimeout,
} from './concurrency/index.js';
import type { RetryResult } from './types.js';

export interface OrchestrationResult {
  agent: string;
  systemPrompt: string;
  contextPackage: ContextPackage;
  suggestions: {
    useSequentialThinking: boolean;
    runQualityGates: boolean;
  };
}

export interface ContextPackage {
  originalUserRequest: string;
  taskBackground: string;
  relevantFiles: string[];
  codeSnippets: string[];
  previousDecisions: string[];
  expectedOutput: string;
  scopeBoundaries: {
    inScope: string[];
    outOfScope: string[];
  };
  errorHandling: string;
}

export type DispatchResult<T> = RetryResult<T>;

export class BoomerangOrchestrator {
  private taskLimiter: TaskLimiter;
  private config: ConcurrencyConfig;

  constructor(config?: Partial<ConcurrencyConfig>) {
    this.config = {
      maxConcurrentSubAgents: 2,
      defaultTimeoutMs: 60000,
      maxRetries: 3,
      retryBaseDelayMs: 1000,
      retryMaxDelayMs: 30000,
      agentTimeouts: {
        scraper: 45000,
        linter: 60000,
        coder: 120000,
        tester: 120000,
      },
      ...config,
    };
    this.taskLimiter = new TaskLimiter(this.config.maxConcurrentSubAgents);
  }

  /**
   * Check if an agent can be dispatched without exceeding slot limits.
   */
  canDispatch(agentName: string): boolean {
    return this.taskLimiter.canDispatch(agentName);
  }

  /**
   * Get current slot usage for observability.
   */
  getConcurrencyStatus(): SlotUsage {
    return this.taskLimiter.getSlotUsage();
  }

  /**
   * Dispatch a task with concurrency check, retry, and timeout enforcement.
   */
  async dispatchTask<T>(
    agentName: string,
    task: () => Promise<T>,
    timeoutMs?: number
  ): Promise<DispatchResult<T>> {
    if (!this.canDispatch(agentName)) {
      throw new Error(
        `Cannot dispatch "${agentName}": no available slots (max ${this.config.maxConcurrentSubAgents})`
      );
    }

    this.taskLimiter.registerAgent(agentName, timeoutMs ?? this.config.defaultTimeoutMs);

    try {
      const retryResult = await executeWithRetry(
        () => executeWithTimeout(task, agentName, timeoutMs),
        {
          maxRetries: this.config.maxRetries,
          baseDelayMs: this.config.retryBaseDelayMs,
          maxDelayMs: this.config.retryMaxDelayMs,
        }
      );
      return retryResult;
    } finally {
      this.taskLimiter.releaseAgent(agentName);
    }
  }

  /**
   * Reset all concurrency state (useful for testing and recovery).
   */
  reset(): void {
    this.taskLimiter.reset();
  }
}

/**
 * Factory function to create a concurrency-aware orchestrator.
 */
export function createOrchestrator(config?: Partial<ConcurrencyConfig>): BoomerangOrchestrator {
  return new BoomerangOrchestrator(config);
}
