/**
 * Boomerang Plugin Memory v4.0.0 - Memini Client Integration
 * 
 * Uses memini-ai MCP client for memory operations.
 * Maintains the same API surface as Super-Memory-TS integration.
 */

import { getMeminiClient, MeminiClient } from '../../src/memini-client/index.js';
import type { MemoryEntry, SearchOptions } from './types.js';

const PROJECT_ID = process.env.BOOMERANG_PROJECT_ID || 'boomerang-plugin';

class PluginMemorySystem {
  private static instance: PluginMemorySystem | null = null;
  private _initialized: boolean = false;
  private _client: MeminiClient;

  private constructor() {
    this._client = getMeminiClient();
  }

  static getInstance(): PluginMemorySystem {
    if (!PluginMemorySystem.instance) {
      PluginMemorySystem.instance = new PluginMemorySystem();
    }
    return PluginMemorySystem.instance;
  }

  isInitialized(): boolean {
    return this._initialized || this._client.isInitialized();
  }

  async initialize(): Promise<void> {
    if (this._initialized) {
      return;
    }
    await this._client.initialize();
    this._initialized = true;
  }

  async search(query: string, options?: Partial<SearchOptions>): Promise<{ entry: MemoryEntry; score: number }[]> {
    this.ensureInitialized();
    
    const topK = options?.topK || 10;
    const results = await this._client.search(query, { topK });
    
    return results.map((result) => ({
      entry: {
        id: result.entry.id,
        text: result.entry.text,
        sourceType: result.entry.sourceType as MemoryEntry['sourceType'],
        sourcePath: result.entry.sourcePath || '',
        timestamp: result.entry.timestamp,
        metadataJson: result.entry.metadataJson || '{}',
      },
      score: result.score,
    }));
  }

  async addMemory(entry: Partial<MemoryEntry>): Promise<MemoryEntry> {
    this.ensureInitialized();
    
    const input = {
      text: entry.text || '',
      sourceType: entry.sourceType || 'boomerang',
      sourcePath: entry.sourcePath || '',
      metadataJson: entry.metadataJson || '{}',
      sessionId: entry.sessionId || '',
    };
    
    const result = await this._client.addMemory(input);
    return result;
  }

  async saveContext(sessionId: string, context: string): Promise<MemoryEntry> {
    return this.addMemory({
      text: context,
      sourceType: 'session',
      sourcePath: `session://${sessionId}`,
      metadataJson: JSON.stringify({ type: 'context' }),
      sessionId,
    });
  }

  async getTrustScore(memoryId: string): Promise<number | null> {
    return this._client.getTrustScore(memoryId);
  }

  async adjustTrust(memoryId: string, signal: 'agent_used' | 'agent_ignored' | 'user_corrected' | 'user_confirmed'): Promise<void> {
    return this._client.adjustTrust(memoryId, signal);
  }

  private ensureInitialized(): void {
    if (!this.isInitialized()) {
      throw new Error('PluginMemorySystem not initialized. Call initialize() first.');
    }
  }
}

let memoryInstance: PluginMemorySystem | null = null;

export function getMemorySystem(): PluginMemorySystem {
  if (!memoryInstance) {
    memoryInstance = PluginMemorySystem.getInstance();
  }
  return memoryInstance;
}

export { PluginMemorySystem };