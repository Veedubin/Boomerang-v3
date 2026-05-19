/**
 * Boomerang v3 — Multi-agent orchestration plugin for OpenCode
 *
 * Exports:
 *   - orchestrator: Concurrency-aware orchestrator
 *   - plugin: Plugin metadata
 *   - concurrency: TaskLimiter, RetryExecutor, TimeoutEnforcer
 *   - types: Core type definitions
 */

export { BoomerangOrchestrator, createOrchestrator } from './orchestrator.js';
export {
  TaskLimiter,
  executeWithRetry,
  executeWithTimeout,
} from './concurrency/index.js';
export {
  TimeoutError,
  type ConcurrencyConfig,
  type RetryOptions,
  type RetryResult,
  type SlotUsage,
} from './types.js';

export const orchestrator = {
  name: 'boomerang-v3',
  version: '3.0.0',
};

export const plugin = {
  name: 'boomerang-v3-plugin',
  version: '3.0.0',
};

export default { orchestrator, plugin };
