/**
 * Telemetry Client — Simple HTTP client for emitting telemetry events
 * to the observability proxy.
 *
 * Uses native fetch (Node 20+) with fire-and-forget semantics.
 * Failures are logged but never throw, ensuring telemetry never blocks
 * the orchestrator pipeline.
 */

import type { TelemetryEvent, SessionUpdate } from './types.js';

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Simple HTTP telemetry client for the boomerang observability proxy.
 *
 * All methods are fire-and-forget: errors are logged but never propagated,
 * so telemetry failures never block the orchestrator.
 */
export class TelemetryClient {
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(endpoint: string, timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    this.endpoint = endpoint.replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
  }

  /**
   * Emit a telemetry event to the proxy.
   * Fire-and-forget: logs errors but never throws.
   */
  async emit(event: TelemetryEvent): Promise<void> {
    try {
      await this.post('/events', event);
    } catch (err) {
      console.warn('[TelemetryClient] emit failed:', err);
    }
  }

  /**
   * Create a new session record in the telemetry proxy.
   */
  async createSession(
    sessionId: string,
    tenantId: string,
    taskDescription: string
  ): Promise<void> {
    try {
      await this.post('/sessions', {
        session_id: sessionId,
        tenant_id: tenantId,
        task_description: taskDescription,
      });
    } catch (err) {
      console.warn('[TelemetryClient] createSession failed:', err);
    }
  }

  /**
   * Update an existing session in the telemetry proxy.
   */
  async updateSession(
    sessionId: string,
    updates: Partial<SessionUpdate>
  ): Promise<void> {
    try {
      await this.patch(`/sessions/${sessionId}`, updates);
    } catch (err) {
      console.warn('[TelemetryClient] updateSession failed:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async post(path: string, body: unknown): Promise<Response> {
    const url = `${this.endpoint}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  private async patch(path: string, body: unknown): Promise<Response> {
    const url = `${this.endpoint}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timer);
    }
  }
}