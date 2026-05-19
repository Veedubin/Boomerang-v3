/**
 * Task Limiter — Logical concurrency semaphore for sub-agents
 *
 * Enforces maxConcurrentSubAgents = 2 (3 Ollama Cloud slots minus 1 orchestrator).
 */

import type { SlotUsage } from '../types.js';

interface ActiveAgent {
  agentName: string;
  startTime: number;
  timeoutMs: number;
}

export class TaskLimiter {
  private maxConcurrent: number;
  private activeAgents: Map<string, ActiveAgent>;

  constructor(maxConcurrent = 2) {
    this.maxConcurrent = maxConcurrent;
    this.activeAgents = new Map();
  }

  canDispatch(agentName: string): boolean {
    return this.activeAgents.size < this.maxConcurrent || this.activeAgents.has(agentName);
  }

  registerAgent(agentName: string, timeoutMs = 60000): void {
    if (this.activeAgents.has(agentName)) {
      throw new Error(`Agent "${agentName}" is already registered`);
    }
    if (this.activeAgents.size >= this.maxConcurrent) {
      throw new Error(
        `Cannot register agent "${agentName}": all ${this.maxConcurrent} slots are occupied`
      );
    }
    this.activeAgents.set(agentName, {
      agentName,
      startTime: Date.now(),
      timeoutMs,
    });
  }

  releaseAgent(agentName: string): void {
    this.activeAgents.delete(agentName);
  }

  getSlotUsage(): SlotUsage {
    const now = Date.now();
    const agents = Array.from(this.activeAgents.values()).map((a) => ({
      name: a.agentName,
      startTime: a.startTime,
      elapsedMs: now - a.startTime,
    }));

    return {
      active: this.activeAgents.size,
      max: this.maxConcurrent,
      available: Math.max(0, this.maxConcurrent - this.activeAgents.size),
      agents,
    };
  }

  reset(): void {
    this.activeAgents.clear();
  }
}
