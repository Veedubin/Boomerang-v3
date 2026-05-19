/**
 * Tests for RetryExecutor
 */

import { describe, it, expect, vi } from 'vitest';
import { executeWithRetry } from '../../src/concurrency/retry-executor.js';

describe('executeWithRetry', () => {
  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValue(42);
    const result = await executeWithRetry(fn);

    expect(result.result).toBe(42);
    expect(result.attempts).toBe(1);
    expect(result.totalDelayMs).toBe(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on transient failure and eventually succeed', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue(42);

    const result = await executeWithRetry(fn, { maxRetries: 3, baseDelayMs: 10 });

    expect(result.result).toBe(42);
    expect(result.attempts).toBe(3);
    expect(result.totalDelayMs).toBeGreaterThanOrEqual(0);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max retries exceeded', async () => {
    const error = new Error('persistent failure');
    const fn = vi.fn().mockRejectedValue(error);

    await expect(executeWithRetry(fn, { maxRetries: 2, baseDelayMs: 10 })).rejects.toThrow(
      'persistent failure'
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should not retry non-retryable errors when predicate is set', async () => {
    const fatalError = new Error('fatal');
    const fn = vi.fn().mockRejectedValue(fatalError);

    await expect(
      executeWithRetry(fn, {
        maxRetries: 3,
        baseDelayMs: 10,
        isRetryable: (err) => err.message !== 'fatal',
      })
    ).rejects.toThrow('fatal');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should accumulate delay across retries', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    const result = await executeWithRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 10,
      maxDelayMs: 100,
    });

    expect(result.attempts).toBe(3);
    expect(result.totalDelayMs).toBeGreaterThan(0);
  });

  it('should default to 3 retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    await expect(executeWithRetry(fn, { baseDelayMs: 5 })).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(4);
  });
});
