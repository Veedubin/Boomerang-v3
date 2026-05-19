/**
 * Tests for TimeoutEnforcer
 */

import { describe, it, expect, vi } from 'vitest';
import { executeWithTimeout, resolveTimeout } from '../../src/concurrency/timeout-enforcer.js';
import { TimeoutError } from '../../src/types.js';

describe('executeWithTimeout', () => {
  it('should return result when task completes within timeout', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await executeWithTimeout(fn, 'coder', 1000);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throw TimeoutError when task exceeds timeout', async () => {
    const fn = vi.fn(
      () => new Promise<string>((resolve) => setTimeout(() => resolve('late'), 2000))
    );

    await expect(executeWithTimeout(fn, 'linter', 50)).rejects.toThrow(TimeoutError);
    await expect(executeWithTimeout(fn, 'linter', 50)).rejects.toThrow(
      /exceeded 50ms/
    );
  });

  it('should set correct agent name and timeout on TimeoutError', async () => {
    const fn = vi.fn(
      () => new Promise<string>((resolve) => setTimeout(() => resolve('late'), 500))
    );

    try {
      await executeWithTimeout(fn, 'tester', 50);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(TimeoutError);
      const timeoutError = error as TimeoutError;
      expect(timeoutError.agentName).toBe('tester');
      expect(timeoutError.timeoutMs).toBe(50);
      expect(timeoutError.elapsedMs).toBeGreaterThanOrEqual(40);
    }
  });

  it('should resolve per-agent default timeouts', () => {
    expect(resolveTimeout('scraper')).toBe(45000);
    expect(resolveTimeout('coder')).toBe(120000);
    expect(resolveTimeout('linter')).toBe(60000);
    expect(resolveTimeout('tester')).toBe(120000);
    expect(resolveTimeout('unknown-agent')).toBe(60000);
  });

  it('should use default 60s timeout for unknown agents', async () => {
    const fastFn = vi.fn().mockResolvedValue('ok');
    const result = await executeWithTimeout(fastFn, 'unknown-agent');
    expect(result).toBe('ok');
  });

  it('should propagate non-timeout errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('task error'));
    await expect(executeWithTimeout(fn, 'coder', 1000)).rejects.toThrow('task error');
  });

  it('should allow underlying promise to resolve even after timeout', async () => {
    let resolved = false;
    const fn = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          setTimeout(() => {
            resolved = true;
            resolve('late');
          }, 200);
        })
    );

    await expect(executeWithTimeout(fn, 'coder', 50)).rejects.toThrow(TimeoutError);
    await new Promise((r) => setTimeout(r, 300));
    expect(resolved).toBe(true);
  });
});
