/**
 * Tests for TaskLimiter
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TaskLimiter } from '../../src/concurrency/task-limiter.js';

describe('TaskLimiter', () => {
  let limiter: TaskLimiter;

  beforeEach(() => {
    limiter = new TaskLimiter(2);
  });

  it('should allow dispatch when slots are available', () => {
    expect(limiter.canDispatch('agent-a')).toBe(true);
  });

  it('should register an agent and occupy a slot', () => {
    limiter.registerAgent('agent-a', 60000);
    const usage = limiter.getSlotUsage();
    expect(usage.active).toBe(1);
    expect(usage.available).toBe(1);
    expect(usage.agents).toHaveLength(1);
    expect(usage.agents[0].name).toBe('agent-a');
  });

  it('should allow up to maxConcurrent agents', () => {
    limiter.registerAgent('agent-a', 60000);
    limiter.registerAgent('agent-b', 60000);
    expect(limiter.getSlotUsage().active).toBe(2);
    expect(limiter.getSlotUsage().available).toBe(0);
  });

  it('should block dispatch beyond maxConcurrent', () => {
    limiter.registerAgent('agent-a', 60000);
    limiter.registerAgent('agent-b', 60000);
    expect(limiter.canDispatch('agent-c')).toBe(false);
  });

  it('should throw when registering beyond capacity', () => {
    limiter.registerAgent('agent-a', 60000);
    limiter.registerAgent('agent-b', 60000);
    expect(() => limiter.registerAgent('agent-c', 60000)).toThrow(
      'Cannot register agent "agent-c"'
    );
  });

  it('should release a slot and allow new agents', () => {
    limiter.registerAgent('agent-a', 60000);
    limiter.releaseAgent('agent-a');
    expect(limiter.getSlotUsage().active).toBe(0);
    expect(limiter.getSlotUsage().available).toBe(2);
    limiter.registerAgent('agent-c', 60000);
    expect(limiter.getSlotUsage().active).toBe(1);
  });

  it('should throw when registering the same agent twice', () => {
    limiter.registerAgent('agent-a', 60000);
    expect(() => limiter.registerAgent('agent-a', 60000)).toThrow(
      'already registered'
    );
  });

  it('should report elapsed time for active agents', () => {
    limiter.registerAgent('agent-a', 60000);
    const usage = limiter.getSlotUsage();
    expect(usage.agents[0].elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('should reset all state', () => {
    limiter.registerAgent('agent-a', 60000);
    limiter.registerAgent('agent-b', 60000);
    limiter.reset();
    expect(limiter.getSlotUsage().active).toBe(0);
    expect(limiter.getSlotUsage().available).toBe(2);
  });
});
