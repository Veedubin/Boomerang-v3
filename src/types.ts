/**
 * Boomerang v3 — Core Type Definitions
 *
 * Includes concurrency types, context buffer types, telemetry types,
 * and shared interfaces used across the orchestrator and middleware layers.
 */

// ============================================================================
// Concurrency Types
// ============================================================================

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
  agents: Array<{ name: string; startTime: number; elapsedMs: number }>;
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

// ============================================================================
// Context Buffer Types
// ============================================================================

/** Configuration for the context buffer middleware. */
export interface ContextBufferConfig {
  /** Maximum context size in tokens (default: 100000). */
  maxContextSizeTokens: number;
  /** Token threshold for splitting context into segments (default: 50000). */
  segmentThreshold: number;
  /** Telemetry endpoint URL (e.g., 'http://localhost:8123/api/v1'). */
  telemetryEndpoint: string;
  /** MeminiClient instance for memory operations. */
  meminiClient: import('./memini-client/index.js').MeminiClient;
}

/** A segment of context stored in memory. */
export interface ContextSegment {
  /** Zero-based index of this segment. */
  segmentIndex: number;
  /** Total number of segments. */
  totalSegments: number;
  /** Memory ID of this segment. */
  memoryId: string;
  /** Content of this segment. */
  content: string;
}

/** A tool call recorded during agent invocation. */
export interface ToolCall {
  /** Name of the tool invoked. */
  name: string;
  /** Arguments passed to the tool. */
  arguments: Record<string, unknown>;
  /** Timestamp when the tool was called. */
  timestamp: number;
  /** Result returned by the tool (if available). */
  result?: unknown;
}

/** Payload captured after an agent invocation completes. */
export interface AgentContextPayload {
  /** Agent output text. */
  output: string;
  /** Tool calls made during the invocation. */
  toolCalls: ToolCall[];
  /** Files modified during the invocation. */
  filesModified: string[];
  /** Key decisions made during the invocation. */
  decisions: string[];
  /** Errors encountered during the invocation. */
  errors: string[];
  /** Epoch timestamp when invocation started. */
  startTime: number;
  /** Epoch timestamp when invocation ended. */
  endTime: number;
  /** Duration of invocation in milliseconds. */
  durationMs: number;
}

/** Result returned by a dispatched agent task. */
export interface TaskResult {
  /** Agent output text. */
  output?: string;
  /** Tool calls made during the task. */
  toolCalls?: ToolCall[];
  /** Files modified during the task. */
  filesModified?: string[];
  /** Key decisions made during the task. */
  decisions?: string[];
  /** Errors encountered during the task. */
  errors?: string[];
}

// ============================================================================
// Telemetry Types
// ============================================================================

/** Telemetry event emitted by the context buffer middleware. */
export interface TelemetryEvent {
  /** Event type (e.g., 'invocation_start', 'invocation_end', 'invocation_error'). */
  event_type: string;
  /** Session ID for correlation. */
  session_id: string;
  /** Agent name associated with the event. */
  agent_name?: string;
  /** Model name used for the invocation. */
  model_name?: string;
  /** Duration in milliseconds. */
  duration_ms?: number;
  /** Whether the invocation succeeded. */
  success?: boolean;
  /** Error message if the invocation failed. */
  error_message?: string;
  /** Additional metadata. */
  metadata?: Record<string, unknown>;
}

/** Session update payload for telemetry. */
export interface SessionUpdate {
  /** Current status of the session. */
  status?: string;
  /** Task description. */
  task_description?: string;
  /** Agent name. */
  agent_name?: string;
  /** Duration in milliseconds. */
  duration_ms?: number;
  /** Whether the session succeeded. */
  success?: boolean;
  /** Error message if the session failed. */
  error_message?: string;
  /** Additional metadata. */
  metadata?: Record<string, unknown>;
}