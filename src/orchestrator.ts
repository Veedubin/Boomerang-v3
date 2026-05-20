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

function _validateAgentRouting(taskType: string, agentName: string): boolean {
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
 * Integrates TaskLimiter, RetryExecutor, TimeoutEnforcer, and
 * ContextBufferMiddleware before dispatching to sub-agents.
 *
 * The ContextBufferMiddleware is OPTIONAL — if not configured, the
 * orchestrator operates identically to before this integration
 * (backward compatible).
 */

import type {
  ConcurrencyConfig,
  ContextBufferConfig,
  SlotUsage,
  TaskResult,
} from './types.js';
import { TimeoutError } from './types.js';
import {
  TaskLimiter,
  executeWithRetry,
  executeWithTimeout,
} from './concurrency/index.js';
import type { RetryResult } from './types.js';
import { ContextBufferMiddleware } from './context-buffer.js';
import type { TaskResultOrError } from './context-buffer.js';

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
  /** Injected context from the context buffer middleware. */
  injectedContext?: string;
  /** Memory IDs saved during this invocation (for queue context restore). */
  contextMemoryIds?: string[];
}

export type DispatchResult<T> = RetryResult<T>;

export class BoomerangOrchestrator {
  private taskLimiter: TaskLimiter;
  private config: ConcurrencyConfig;
  private contextBuffer: ContextBufferMiddleware | null;

  constructor(
    config?: Partial<ConcurrencyConfig>,
    contextBufferConfig?: ContextBufferConfig
  ) {
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
    this.contextBuffer = null;

    if (contextBufferConfig?.meminiClient) {
      const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      this.contextBuffer = new ContextBufferMiddleware(sessionId, contextBufferConfig);
    }
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
   * Get the context buffer middleware, if configured.
   */
  getContextBuffer(): ContextBufferMiddleware | null {
    return this.contextBuffer;
  }

  /**
   * Dispatch a task with concurrency check, retry, timeout enforcement,
   * and optional context buffer middleware integration.
   *
   * When the context buffer is configured, it wraps the task execution
   * with beforeInvocation/afterInvocation hooks for context capture.
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

    const startTime = Date.now();
    let _injectedContext = '';
    let _contextMemoryIds: string[] = [];

    // Context buffer: before invocation
    if (this.contextBuffer) {
      try {
        _injectedContext = await this.contextBuffer.beforeInvocation(
          agentName,
          task.toString().slice(0, 200) // Brief description
        );
      } catch (err) {
        console.warn('[Orchestrator] Context buffer beforeInvocation failed:', err);
      }
    }

    try {
      const retryResult = await executeWithRetry(
        () => executeWithTimeout(task, agentName, timeoutMs),
        {
          maxRetries: this.config.maxRetries,
          baseDelayMs: this.config.retryBaseDelayMs,
          maxDelayMs: this.config.retryMaxDelayMs,
          isRetryable: (err) => !(err instanceof TimeoutError),
        }
      );

      // Context buffer: after successful invocation
      if (this.contextBuffer) {
        try {
          const taskResult = this.extractTaskResult(retryResult.result);
          _contextMemoryIds = await this.contextBuffer.afterInvocation(
            agentName,
            taskResult,
            Date.now() - startTime
          );
        } catch (err) {
          console.warn('[Orchestrator] Context buffer afterInvocation failed:', err);
        }
      }

      return retryResult;
    } catch (err) {
      // Context buffer: after failed invocation
      if (this.contextBuffer) {
        try {
          const errorMessage = err instanceof Error ? err.message : String(err);
          _contextMemoryIds = await this.contextBuffer.afterInvocation(
            agentName,
            { success: false, error: errorMessage },
            Date.now() - startTime
          );
        } catch (ctxErr) {
          console.warn('[Orchestrator] Context buffer afterInvocation (error) failed:', ctxErr);
        }
      }
      throw err;
    } finally {
      this.taskLimiter.releaseAgent(agentName);
    }
  }

  /**
   * Extract a TaskResult from a dispatch result value.
   * Handles the case where T may or may not be a TaskResult-shaped object.
   */
  private extractTaskResult(result: unknown): TaskResultOrError {
    if (typeof result === 'object' && result !== null) {
      const obj = result as Record<string, unknown>;
      if ('output' in obj || 'filesModified' in obj || 'decisions' in obj || 'errors' in obj) {
        return obj as unknown as TaskResult;
      }
    }
    // Wrap raw results
    return {
      output: typeof result === 'string' ? result : JSON.stringify(result),
      toolCalls: [],
      filesModified: [],
      decisions: [],
      errors: [],
    };
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
export function createOrchestrator(
  config?: Partial<ConcurrencyConfig>,
  contextBufferConfig?: ContextBufferConfig
): BoomerangOrchestrator {
  return new BoomerangOrchestrator(config, contextBufferConfig);
}