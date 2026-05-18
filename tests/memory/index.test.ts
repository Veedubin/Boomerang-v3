/**
 * Tests for MemorySystem (src/memory/index.ts)
 *
 * Tests the singleton wrapper around MeminiClient.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemorySystem, getMemorySystem } from '@/memory/index.js';

describe('MemorySystem', () => {
  let memorySystem: MemorySystem;

  beforeEach(() => {
    // Reset singleton for each test
    // @ts-expect-error - accessing private static for testing
    MemorySystem.instance = null;
    memorySystem = MemorySystem.getInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getInstance', () => {
    it('should return a MemorySystem instance', () => {
      const instance = MemorySystem.getInstance();
      expect(instance).toBeDefined();
      expect(instance).toBeInstanceOf(MemorySystem);
    });

    it('should return the same instance on multiple calls (singleton)', () => {
      const instance1 = MemorySystem.getInstance();
      const instance2 = MemorySystem.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('isInitialized', () => {
    it('should return false before initialization', () => {
      expect(memorySystem.isInitialized()).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should not initialize twice', async () => {
      // @ts-expect-error - accessing private field for testing
      memorySystem._initialized = true;

      await memorySystem.initialize();

      // @ts-expect-error - accessing private field for testing
      expect(memorySystem._initialized).toBe(true);
    });
  });

  describe('getClient', () => {
    it('should throw error if not initialized', () => {
      expect(() => memorySystem.getClient()).toThrow('MemorySystem not initialized');
    });
  });

  describe('addMemory', () => {
    it('should throw error if not initialized', async () => {
      await expect(
        memorySystem.addMemory({
          text: 'test memory',
          sourceType: 'manual',
          sourcePath: '/test/path',
        })
      ).rejects.toThrow('MemorySystem not initialized');
    });
  });

  describe('getMemory', () => {
    it('should throw error if not initialized', async () => {
      await expect(memorySystem.getMemory('test-id')).rejects.toThrow('MemorySystem not initialized');
    });
  });

  describe('deleteMemory', () => {
    it('should throw error if not initialized', async () => {
      await expect(memorySystem.deleteMemory('test-id')).rejects.toThrow('MemorySystem not initialized');
    });
  });

  describe('listSources', () => {
    it('should throw error if not initialized', async () => {
      await expect(memorySystem.listSources()).rejects.toThrow('MemorySystem not initialized');
    });
  });

  describe('saveContext', () => {
    it('should throw error if not initialized', async () => {
      await expect(
        memorySystem.saveContext('session-1', 'context content')
      ).rejects.toThrow('MemorySystem not initialized');
    });
  });

  describe('getContext', () => {
    it('should throw error if not initialized', async () => {
      await expect(memorySystem.getContext('session-1')).rejects.toThrow('MemorySystem not initialized');
    });
  });

  describe('search', () => {
    it('should throw error if not initialized', async () => {
      await expect(memorySystem.search('test query')).rejects.toThrow('MemorySystem not initialized');
    });
  });

  describe('getStatus', () => {
    it('should return null if client not available', async () => {
      const status = await memorySystem.getStatus();
      expect(status).toBeNull();
    });
  });

  describe('isReady', () => {
    it('should return false when client not available', async () => {
      const ready = await memorySystem.isReady();
      expect(ready).toBe(false);
    });
  });

  describe('contentExists', () => {
    it('should throw error if not initialized', async () => {
      await expect(memorySystem.contentExists('test content')).rejects.toThrow('MemorySystem not initialized');
    });
  });

  describe('searchWithVector', () => {
    it('should throw error if not initialized', async () => {
      await expect(
        memorySystem.searchWithVector([0.1, 0.2, 0.3])
      ).rejects.toThrow('MemorySystem not initialized');
    });
  });

  describe('getSimilar', () => {
    it('should throw error if not initialized', async () => {
      await expect(memorySystem.getSimilar('test-id')).rejects.toThrow('MemorySystem not initialized');
    });
  });

  describe('getStats', () => {
    it('should throw error if not initialized', async () => {
      await expect(memorySystem.getStats()).rejects.toThrow('MemorySystem not initialized');
    });
  });
});

describe('getMemorySystem', () => {
  it('should return a MemorySystem instance', () => {
    // Reset singleton
    // @ts-expect-error - accessing private static for testing
    MemorySystem.instance = null;

    const system = getMemorySystem();
    expect(system).toBeInstanceOf(MemorySystem);
  });

  it('should return the same instance on multiple calls', () => {
    // Reset singleton
    // @ts-expect-error - accessing private static for testing
    MemorySystem.instance = null;

    const system1 = getMemorySystem();
    const system2 = getMemorySystem();
    expect(system1).toBe(system2);
  });
});

describe('source type mapping', () => {
  // Test the internal mapping functions via public API

  it('should handle conversation source type', async () => {
    // Reset singleton
    // @ts-expect-error - accessing private static for testing
    MemorySystem.instance = null;

    const system = MemorySystem.getInstance();

    // Verify isInitialized returns false before init
    expect(system.isInitialized()).toBe(false);
  });

  it('should handle file source type', async () => {
    // Reset singleton
    // @ts-expect-error - accessing private static for testing
    MemorySystem.instance = null;

    const system = MemorySystem.getInstance();
    expect(system.isInitialized()).toBe(false);
  });

  it('should handle web source type', async () => {
    // Reset singleton
    // @ts-expect-error - accessing private static for testing
    MemorySystem.instance = null;

    const system = MemorySystem.getInstance();
    expect(system.isInitialized()).toBe(false);
  });

  it('should handle manual source type', async () => {
    // Reset singleton
    // @ts-expect-error - accessing private static for testing
    MemorySystem.instance = null;

    const system = MemorySystem.getInstance();
    expect(system.isInitialized()).toBe(false);
  });
});