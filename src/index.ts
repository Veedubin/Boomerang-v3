/**
 * Boomerang v3 — Multi-agent orchestration plugin for OpenCode
 *
 * Exports:
 *   - orchestrator: Concurrency-aware orchestrator with context buffer
 *   - plugin: Plugin metadata
 *   - concurrency: TaskLimiter, RetryExecutor, TimeoutEnforcer
 *   - context-buffer: ContextBufferMiddleware
 *   - telemetry: TelemetryClient
 *   - types: Core type definitions
 */

export { BoomerangOrchestrator, createOrchestrator } from './orchestrator.js';
export {
  TaskLimiter,
  executeWithRetry,
  executeWithTimeout,
} from './concurrency/index.js';
export { ContextBufferMiddleware } from './context-buffer.js';
export type { TaskResultOrError } from './context-buffer.js';
export { TelemetryClient } from './telemetry-client.js';
export {
  TimeoutError,
  type ConcurrencyConfig,
  type RetryOptions,
  type RetryResult,
  type SlotUsage,
  type ContextBufferConfig,
  type ContextSegment,
  type AgentContextPayload,
  type ToolCall,
  type TaskResult,
  type TelemetryEvent,
  type SessionUpdate,
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