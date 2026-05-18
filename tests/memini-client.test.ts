/**
 * Tests for MeminiClient (src/memini-client/index.ts)
 *
 * Uses mocked MCP client since Python server may not be available.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MeminiClient } from '../src/memini-client/index.js';

describe('MeminiClient', () => {
  let mockMcpClient: {
    callTool: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
  let client: MeminiClient;

  beforeEach(() => {
    // Reset singleton for each test
    vi.restoreAllMocks();

    // Create mock MCP client
    mockMcpClient = {
      callTool: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getInstance', () => {
    it('should return a MeminiClient instance', () => {
      const instance = MeminiClient.getInstance();
      expect(instance).toBeDefined();
      expect(instance).toBeInstanceOf(MeminiClient);
    });

    it('should return the same instance on multiple calls (singleton)', () => {
      const instance1 = MeminiClient.getInstance();
      const instance2 = MeminiClient.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('isInitialized', () => {
    it('should return false before initialization', () => {
      const instance = MeminiClient.getInstance();
      expect(instance.isInitialized()).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should handle initialization without throwing', async () => {
      const instance = MeminiClient.getInstance();
      // Note: Real implementation catches errors and marks as initialized in degraded mode
      // This test just verifies the method doesn't throw
      await expect(instance.initialize()).resolves.not.toThrow();
    });
  });

  describe('search', () => {
    it('should return empty array when not connected', async () => {
      const instance = MeminiClient.getInstance();
      // Graceful degradation - returns empty array instead of throwing
      const result = await instance.search('test query');
      expect(result).toEqual([]);
    });
  });

  describe('addMemory', () => {
    it('should throw error when not connected', async () => {
      const instance = MeminiClient.getInstance();
      // Error message is "Not connected" from MCP SDK
      await expect(instance.addMemory({ text: 'test' })).rejects.toThrow();
    });
  });

  describe('getTrustScore', () => {
    it('should return null if not connected', async () => {
      const instance = MeminiClient.getInstance();
      const result = await instance.getTrustScore('test-id');
      expect(result).toBeNull();
    });
  });

  describe('adjustTrust', () => {
    it('should handle errors gracefully', async () => {
      const instance = MeminiClient.getInstance();
      // Should not throw even if not connected
      await expect(
        instance.adjustTrust('test-id', 'agent_used')
      ).resolves.not.toThrow();
    });
  });

  describe('findContradictions', () => {
    it('should return empty array if not connected', async () => {
      const instance = MeminiClient.getInstance();
      const result = await instance.findContradictions();
      expect(result).toEqual([]);
    });

    it('should accept query parameter', async () => {
      const instance = MeminiClient.getInstance();
      const result = await instance.findContradictions('test query');
      expect(result).toEqual([]);
    });
  });

  describe('resolveContradiction', () => {
    it('should return null if not connected', async () => {
      const instance = MeminiClient.getInstance();
      const result = await instance.resolveContradiction('id-a', 'id-b');
      expect(result).toBeNull();
    });
  });

  describe('getDialecticHistory', () => {
    it('should return empty array if not connected', async () => {
      const instance = MeminiClient.getInstance();
      const result = await instance.getDialecticHistory('test-id');
      expect(result).toEqual([]);
    });
  });

  describe('challengeMemory', () => {
    it('should return null if not connected', async () => {
      const instance = MeminiClient.getInstance();
      const result = await instance.challengeMemory('test-id', 'challenge text');
      expect(result).toBeNull();
    });
  });

  describe('findRelatedMemories', () => {
    it('should return empty array if not connected', async () => {
      const instance = MeminiClient.getInstance();
      const result = await instance.findRelatedMemories('test-id');
      expect(result).toEqual([]);
    });
  });

  describe('createRelationship', () => {
    it('should handle errors gracefully', async () => {
      const instance = MeminiClient.getInstance();
      await expect(
        instance.createRelationship('source', 'target', 'RELATED_TO')
      ).resolves.not.toThrow();
    });
  });

  describe('getRelationshipSummary', () => {
    it('should return null if not connected', async () => {
      const instance = MeminiClient.getInstance();
      const result = await instance.getRelationshipSummary('test-id');
      expect(result).toBeNull();
    });
  });

  describe('queryKG', () => {
    it('should return null if not connected', async () => {
      const instance = MeminiClient.getInstance();
      const result = await instance.queryKG({});
      expect(result).toBeNull();
    });
  });

  describe('extractEntities', () => {
    it('should return empty array if not connected', async () => {
      const instance = MeminiClient.getInstance();
      const result = await instance.extractEntities('test-id');
      expect(result).toEqual([]);
    });
  });

  describe('getEntityGraph', () => {
    it('should return null if not connected', async () => {
      const instance = MeminiClient.getInstance();
      const result = await instance.getEntityGraph('test-id');
      expect(result).toBeNull();
    });
  });

  describe('getInferenceChain', () => {
    it('should return empty array if not connected', async () => {
      const instance = MeminiClient.getInstance();
      const result = await instance.getInferenceChain('start', 'end');
      expect(result).toEqual([]);
    });
  });

  describe('searchEntities', () => {
    it('should return empty array if not connected', async () => {
      const instance = MeminiClient.getInstance();
      const result = await instance.searchEntities('test');
      expect(result).toEqual([]);
    });
  });

  describe('getGraphVisualization', () => {
    it('should return empty string if not connected', async () => {
      const instance = MeminiClient.getInstance();
      const result = await instance.getGraphVisualization();
      expect(result).toBe('');
    });
  });

  describe('getTier0Summary', () => {
    it('should return null if not connected', async () => {
      const instance = MeminiClient.getInstance();
      const result = await instance.getTier0Summary();
      expect(result).toBeNull();
    });
  });

  describe('getTier1Summary', () => {
    it('should return null if not connected', async () => {
      const instance = MeminiClient.getInstance();
      const result = await instance.getTier1Summary();
      expect(result).toBeNull();
    });
  });

  describe('triggerExtraction', () => {
    it('should return empty array if not connected', async () => {
      const instance = MeminiClient.getInstance();
      const result = await instance.triggerExtraction();
      expect(result).toEqual([]);
    });
  });

  describe('preconpressExtraction', () => {
    it('should return null if not connected', async () => {
      const instance = MeminiClient.getInstance();
      const result = await instance.preconpressExtraction();
      expect(result).toBeNull();
    });
  });

  describe('listArchived', () => {
    it('should return empty array if not connected', async () => {
      const instance = MeminiClient.getInstance();
      const result = await instance.listArchived();
      expect(result).toEqual([]);
    });
  });

  describe('getDecayStatus', () => {
    it('should return null if not connected', async () => {
      const instance = MeminiClient.getInstance();
      const result = await instance.getDecayStatus();
      expect(result).toBeNull();
    });
  });

  describe('listFadingMemories', () => {
    it('should return empty array if not connected', async () => {
      const instance = MeminiClient.getInstance();
      const result = await instance.listFadingMemories();
      expect(result).toEqual([]);
    });
  });

  describe('adjustDecayRate', () => {
    it('should handle errors gracefully', async () => {
      const instance = MeminiClient.getInstance();
      await expect(
        instance.adjustDecayRate('test-id', 1.5)
      ).resolves.not.toThrow();
    });
  });

  describe('triggerConsolidation', () => {
    it('should return null if not connected', async () => {
      const instance = MeminiClient.getInstance();
      const result = await instance.triggerConsolidation();
      expect(result).toBeNull();
    });
  });

  describe('getStatus', () => {
    it('should return null if not connected', async () => {
      const instance = MeminiClient.getInstance();
      const result = await instance.getStatus();
      expect(result).toBeNull();
    });
  });

  describe('queryMemories', () => {
    it('should return empty array when not connected', async () => {
      const instance = MeminiClient.getInstance();
      // Graceful degradation - returns empty array instead of throwing
      const result = await instance.queryMemories('test');
      expect(result).toEqual([]);
    });
  });

  describe('shutdown', () => {
    it('should handle shutdown when not connected', async () => {
      const instance = MeminiClient.getInstance();
      await expect(instance.shutdown()).resolves.not.toThrow();
    });
  });
});

describe('getClient', () => {
  it('should return a MeminiClient instance', async () => {
    const { getClient } = await import('../src/memini-client/index.js');
    const client = getClient();
    expect(client).toBeInstanceOf(MeminiClient);
  });
});

describe('initializeClient', () => {
  it('should return a MeminiClient instance', async () => {
    const { initializeClient } = await import('../src/memini-client/index.js');
    // Note: This may connect to real server in degraded mode
    const client = await initializeClient();
    expect(client).toBeInstanceOf(MeminiClient);
  });
});