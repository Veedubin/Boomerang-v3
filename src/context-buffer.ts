/**
 * Context Buffer Middleware — Transparent orchestrator integration
 * for capturing and restoring agent invocation context via memini-ai.
 *
 * This middleware wraps around agent dispatch in the orchestrator,
 * saving invocation context (output, tool calls, decisions, errors)
 * as segmented memories in memini-ai. It also provides before/after
 * hooks for telemetry and context injection.
 *
 * Design:
 * - Segmenting: ~4 chars per token. Split at ~50K tokens = ~200K chars.
 * - Memory metadata includes session_id, agent_name, segment_index.
 * - All segments of an invocation are linked via DERIVED_FROM relationships.
 * - The middleware is OPTIONAL — if not configured, the orchestrator
 *   operates identically to before this integration.
 */

import type {
  ContextBufferConfig,
  AgentContextPayload,
  TaskResult,
  TelemetryEvent,
} from './types.js';
import type { MeminiClient } from './memini-client/index.js';
import { TelemetryClient } from './telemetry-client.js';

/** Estimated ratio: 1 token ≈ 4 characters. */
const CHARS_PER_TOKEN = 4;

export type TaskResultOrError =
  | TaskResult
  | { success: false; error: string };

/**
 * Context buffer middleware that works transparently with the existing
 * orchestrator to capture, segment, and restore agent invocation context.
 */
export class ContextBufferMiddleware {
  private sessionId: string;
  private config: ContextBufferConfig;
  private memini: MeminiClient;
  private telemetry: TelemetryClient;
  private segmentIds: string[] = [];

  constructor(sessionId: string, config: ContextBufferConfig) {
    this.sessionId = sessionId;
    this.config = config;
    this.memini = config.meminiClient;
    this.telemetry = new TelemetryClient(config.telemetryEndpoint);
  }

  /**
   * Called BEFORE an agent runs.
   *
   * Queries memini-ai for relevant context based on the task description,
   * injects it into the agent's context package, and emits a start event
   * to telemetry.
   *
   * @returns A context string to inject into the agent invocation, or
   *          an empty string if no relevant context is found.
   */
  async beforeInvocation(
    agentName: string,
    task: string,
    context?: Record<string, unknown>
  ): Promise<string> {
    const _startTime = Date.now();

    await this.ensureSessionRow(task);
    await this.emitTelemetry({
      event_type: 'invocation_start',
      session_id: this.sessionId,
      agent_name: agentName,
      metadata: { task, contextProvided: context !== undefined },
    });

    let injectedContext = '';
    try {
      const results = await this.memini.search(task, {
        topK: 5,
        strategy: 'TIERED',
      });

      if (results.length > 0) {
        const contextParts = results
          .slice(0, 5)
          .map((r) => `[trust=${r.entry.trustScore?.toFixed(2) ?? '0.50'}] ${r.entry.text}`)
          .join('\n\n---\n\n');

        injectedContext = `\n## Relevant Context from Previous Sessions\n\n${contextParts}\n`;
      }
    } catch (err) {
      console.warn('[ContextBuffer] beforeInvocation search failed:', err);
    }

    return injectedContext;
  }

  /**
   * Called AFTER an agent completes (or fails).
   *
   * Captures the full invocation payload, segments if needed, saves
   * each segment to memini-ai, links them via relationships, and emits
   * an end event to telemetry.
   *
   * @returns Array of memory IDs for the saved segments.
   */
  async afterInvocation(
    agentName: string,
    result: TaskResultOrError,
    durationMs: number
  ): Promise<string[]> {
    const success = 'success' in result ? result.success : true;
    const error = 'success' in result && !result.success ? result.error : undefined;

    await this.emitTelemetry({
      event_type: success ? 'invocation_end' : 'invocation_error',
      session_id: this.sessionId,
      agent_name: agentName,
      duration_ms: durationMs,
      success,
      error_message: error,
    });

    const payload = this.buildPayload(agentName, result, durationMs);
    const memoryIds = await this.saveContextSegments(agentName, payload);
    this.segmentIds = memoryIds;

    // Link segments to each other via DERIVED_FROM relationships
    await this.linkSegments(memoryIds);

    return memoryIds;
  }

  /**
   * Get the memory IDs saved during the current session.
   */
  getSegmentIds(): string[] {
    return [...this.segmentIds];
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Build an AgentContextPayload from a task result.
   */
  private buildPayload(
    agentName: string,
    result: TaskResultOrError,
    durationMs: number
  ): AgentContextPayload {
    const now = Date.now();

    if ('success' in result && !result.success) {
      return {
        output: '',
        toolCalls: [],
        filesModified: [],
        decisions: [],
        errors: [result.error],
        startTime: now - durationMs,
        endTime: now,
        durationMs,
      };
    }

    const taskResult = result as TaskResult;
    return {
      output: taskResult.output ?? '',
      toolCalls: taskResult.toolCalls ?? [],
      filesModified: taskResult.filesModified ?? [],
      decisions: taskResult.decisions ?? [],
      errors: taskResult.errors ?? [],
      startTime: now - durationMs,
      endTime: now,
      durationMs,
    };
  }

  /**
   * Save context segments to memini-ai.
   * If the summary exceeds the segment threshold, it is split into
   * multiple segments, each saved separately.
   */
  private async saveContextSegments(
    agentName: string,
    payload: AgentContextPayload
  ): Promise<string[]> {
    const summary = this.generateContextSummary(agentName, payload);
    const thresholdChars = this.config.segmentThreshold * CHARS_PER_TOKEN;
    const segments = this.splitIfNeeded(summary, thresholdChars);

    const memoryIds: string[] = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      try {
        const entry = await this.memini.addMemory({
          text: segment,
          sourceType: 'boomerang',
          sourcePath: `context-buffer://${this.sessionId}/${agentName}`,
          metadataJson: JSON.stringify({
            type: 'context_segment',
            session_id: this.sessionId,
            agent_name: agentName,
            segment_index: i,
            total_segments: segments.length,
            files_modified: payload.filesModified,
            decisions: payload.decisions,
            errors: payload.errors,
            duration_ms: payload.durationMs,
            success: payload.errors.length === 0,
          }),
          sessionId: this.sessionId,
        });
        memoryIds.push(entry.id);
      } catch (err) {
        console.warn(
          `[ContextBuffer] Failed to save segment ${i}/${segments.length}:`,
          err
        );
      }
    }

    return memoryIds;
  }

  /**
   * Link segments via DERIVED_FROM relationships in memini-ai.
   * Each segment (except the first) derives from the previous one.
   */
  private async linkSegments(memoryIds: string[]): Promise<void> {
    if (memoryIds.length < 2) {
      return;
    }

    for (let i = 1; i < memoryIds.length; i++) {
      try {
        await this.memini.createRelationship(
          memoryIds[i],
          memoryIds[i - 1],
          'DERIVED_FROM',
          0.9
        );
      } catch (err) {
        console.warn(
          `[ContextBuffer] Failed to link segments ${i - 1} → ${i}:`,
          err
        );
      }
    }
  }

  /**
   * Split content into segments if it exceeds the threshold.
   * Tries to split on paragraph boundaries (double newlines).
   */
  private splitIfNeeded(content: string, thresholdChars: number): string[] {
    if (content.length <= thresholdChars) {
      return [content];
    }

    const segments: string[] = [];
    let remaining = content;

    while (remaining.length > 0) {
      if (remaining.length <= thresholdChars) {
        segments.push(remaining);
        break;
      }

      // Find a paragraph boundary near the threshold
      const searchStart = Math.max(0, thresholdChars - 1000);
      const searchEnd = Math.min(remaining.length, thresholdChars + 1000);
      const searchRegion = remaining.slice(searchStart, searchEnd);
      const newlinePos = searchRegion.indexOf('\n\n');

      if (newlinePos !== -1) {
        const splitPos = searchStart + newlinePos + 2;
        segments.push(remaining.slice(0, splitPos));
        remaining = remaining.slice(splitPos);
      } else {
        // No good boundary; hard split at threshold
        segments.push(remaining.slice(0, thresholdChars));
        remaining = remaining.slice(thresholdChars);
      }
    }

    return segments;
  }

  /**
   * Generate a human-readable context summary from the agent payload.
   */
  private generateContextSummary(
    agentName: string,
    payload: AgentContextPayload
  ): string {
    const lines: string[] = [
      `# Agent Invocation: ${agentName}`,
      `Duration: ${payload.durationMs}ms`,
      `Status: ${payload.errors.length === 0 ? 'SUCCESS' : 'FAILED'}`,
      '',
    ];

    if (payload.output) {
      lines.push('## Output');
      lines.push(payload.output);
      lines.push('');
    }

    if (payload.filesModified.length > 0) {
      lines.push('## Files Modified');
      for (const f of payload.filesModified) {
        lines.push(`- ${f}`);
      }
      lines.push('');
    }

    if (payload.decisions.length > 0) {
      lines.push('## Decisions');
      for (const d of payload.decisions) {
        lines.push(`- ${d}`);
      }
      lines.push('');
    }

    if (payload.toolCalls.length > 0) {
      lines.push('## Tool Calls');
      for (const tc of payload.toolCalls) {
        lines.push(`- ${tc.name}(${JSON.stringify(tc.arguments).slice(0, 200)})`);
      }
      lines.push('');
    }

    if (payload.errors.length > 0) {
      lines.push('## Errors');
      for (const e of payload.errors) {
        lines.push(`- ${e}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Ensure a session row exists in telemetry.
   */
  private async ensureSessionRow(task: string): Promise<void> {
    try {
      await this.telemetry.createSession(this.sessionId, 'default', task);
    } catch {
      // Session may already exist; ignore errors
    }
  }

  /**
   * Emit a telemetry event. Fire-and-forget — errors are logged only.
   */
  private async emitTelemetry(event: TelemetryEvent): Promise<void> {
    await this.telemetry.emit(event);
  }
}