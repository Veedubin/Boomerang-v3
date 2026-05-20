/**
 * MemorySystem - Singleton wrapper for memini-ai MCP client
 *
 * Phase 1: Wraps memini-ai client while preserving the original API surface.
 */

import {
  MeminiMCPClient,
  initializeClient,
  type MeminiClient,
} from '../memini-client/index.js';
import type {
  MemoryEntry,
  SourceType,
  SearchResult,
  SearchOptions,
  ServerStatus,
} from './schema.js';
import { DEFAULT_SEARCH_OPTIONS } from './schema.js';

const _PROJECT_ID = process.env.BOOMERANG_PROJECT_ID || 'boomerang-default';

class MemorySystem {
  private static instance: MemorySystem | null = null;
  private _initialized = false;
  private _client: MeminiClient | null = null;
  private _status: ServerStatus | null = null;

  private constructor() {}

  /**
   * Get the MemorySystem singleton instance
   */
  static getInstance(): MemorySystem {
    if (!MemorySystem.instance) {
      MemorySystem.instance = new MemorySystem();
    }
    return MemorySystem.instance;
  }

  /**
   * Check if the system has been initialized
   */
  isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Initialize the memory system (lazy initialization)
   * Connects to memini-ai Python MCP server
   */
  async initialize(): Promise<void> {
    if (this._initialized) {
      return;
    }

    const pythonPath = process.env.PYTHON_PATH || 'python3';
    const serverModule = process.env.MEMINI_SERVER_MODULE || 'memini_ai.server';

    this._client = await initializeClient(pythonPath, serverModule);

    // Get initial status
    this._status = (await this._client.getStatus()) as ServerStatus;
    this._initialized = true;
  }

  /**
   * Get the underlying MCP client
   */
  getClient(): MeminiClient {
    if (!this._client) {
      throw new Error('MemorySystem not initialized. Call initialize() first.');
    }
    return this._client;
  }

  /**
   * Add a new memory entry
   */
  async addMemory(
    entry: Omit<MemoryEntry, 'id' | 'vector' | 'timestamp' | 'contentHash'>
  ): Promise<MemoryEntry> {
    this.ensureInitialized();

    // Map source type to memini-ai format
    const sourceType = mapSourceType(entry.sourceType);

    const result = await this._client!.addMemory({
      text: entry.text,
      sourceType,
      sourcePath: entry.sourcePath,
      metadataJson: entry.metadataJson,
    });

    // result is already a MemoryEntry from memini-client
    const meminiEntry = result as unknown as {
      id: string;
      text: string;
      sourceType: string;
      sourcePath?: string;
      timestamp: number;
      contentHash?: string;
      metadataJson?: string;
      sessionId?: string;
      projectId?: string;
      score?: number;
      trustScore?: number;
      vector?: Float32Array;
    };
    return adaptMemoryEntry(meminiEntry);
  }

  /**
   * Get a memory entry by ID
   */
  async getMemory(id: string): Promise<MemoryEntry | null> {
    this.ensureInitialized();

    // Search for the memory by ID
    const results = await this._client!.search(`id:${id}`, { topK: 1 });
    const match = results.find((m) => m.entry.id === id);

    if (match) {
      return adaptMemoryEntry(match.entry);
    }

    return null;
  }

  /**
   * Delete a memory entry by ID
   * Note: memini-ai doesn't have direct delete, use adjustTrust with archive
   */
  async deleteMemory(id: string): Promise<boolean> {
    this.ensureInitialized();

    try {
      // Archive the memory instead of deleting
      await this._client!.adjustTrust(id, 'agent_ignored');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List unique source paths, optionally filtered by source type
   */
  async listSources(sourceType?: SourceType): Promise<string[]> {
    this.ensureInitialized();

    // This is a simplified implementation
    // In production, you'd want a dedicated list_sources tool
    const results = await this._client!.search('', { topK: 100 });
    const pathSet = new Set<string>();

    for (const result of results) {
      const entry = result.entry;
      const entrySourceType = reverseMapSourceType(entry.sourceType);
      if (entry.sourcePath && (!sourceType || entrySourceType === sourceType)) {
        pathSet.add(entry.sourcePath);
      }
    }

    return Array.from(pathSet);
  }

  /**
   * Save a context entry for a session
   */
  async saveContext(sessionId: string, context: string): Promise<MemoryEntry> {
    this.ensureInitialized();

    return this.addMemory({
      text: context,
      sourceType: 'conversation',
      sourcePath: `session://${sessionId}`,
      metadataJson: JSON.stringify({ type: 'context' }),
      sessionId,
    });
  }

  /**
   * Get the most recent context entry for a session
   */
  async getContext(sessionId: string): Promise<MemoryEntry | null> {
    this.ensureInitialized();

    const results = await this._client!.search(`session:${sessionId}`, { topK: 100 });

    // Find the most recent context entry
    let latestContext: MemoryEntry | null = null;
    let latestTimestamp = 0;

    for (const result of results) {
      const entry = result.entry;
      if (entry.metadataJson) {
        try {
          const meta = JSON.parse(entry.metadataJson);
          if (meta.type === 'context') {
            const ts = entry.timestamp;
            if (ts > latestTimestamp) {
              latestTimestamp = ts;
              latestContext = adaptMemoryEntry(entry);
            }
          }
        } catch {
          // Not a context entry
        }
      }
    }

    return latestContext;
  }

/**
 * Search memories using query string with optional search options
 */
  async search(
    query: string,
    options?: Partial<SearchOptions>
  ): Promise<SearchResult<MemoryEntry>[]> {
    this.ensureInitialized();

    const opts = {
      ...DEFAULT_SEARCH_OPTIONS,
      ...options,
    };

    const results = await this._client!.search(query, { topK: opts.topK });

    return results.map((r) => ({
      entry: adaptMemoryEntry(r.entry),
      score: r.score,
    }));
  }

  /**
   * Ensure the system is initialized before performing operations
   */
  private ensureInitialized(): void {
    if (!this.isInitialized()) {
      throw new Error('MemorySystem not initialized. Call initialize() first.');
    }
  }

  /**
   * Get server status
   */
  async getStatus(): Promise<ServerStatus | null> {
    if (!this._client) {
      return null;
    }

    try {
      this._status = (await this._client.getStatus()) as ServerStatus;
      return this._status;
    } catch {
      return this._status;
    }
  }

  /**
   * Check if the memory system is ready
   */
  async isReady(): Promise<boolean> {
    const status = await this.getStatus();
    return status?.memoryReady ?? false;
  }

  /**
   * Check if content already exists (deduplication)
   */
  async contentExists(text: string): Promise<boolean> {
    this.ensureInitialized();

    const results = await this._client!.search(text, { topK: 1 });
    return results.length > 0;
  }

  /**
   * Search memories using a pre-computed vector
   * Note: memini-ai handles embedding internally
   */
  async searchWithVector(
    vector: number[],
    options?: Partial<SearchOptions>
  ): Promise<SearchResult<MemoryEntry>[]> {
    this.ensureInitialized();

    // memini-ai doesn't expose vector search directly
    // Fall back to text search
    const opts = {
      ...DEFAULT_SEARCH_OPTIONS,
      ...options,
    };

    // Use vector as seed for approximate search
    const results = await this._client!.search(
      `vector:${vector.slice(0, 10).join(',')}`,
      { topK: opts.topK }
    );

    return results.map((r) => ({
      entry: adaptMemoryEntry(r.entry),
      score: r.score,
    }));
  }

  /**
   * Get memories similar to a given memory
   */
  async getSimilar(
    memoryId: string,
    options?: Partial<SearchOptions>
  ): Promise<SearchResult<MemoryEntry>[]> {
    this.ensureInitialized();

    const memory = await this.getMemory(memoryId);
    if (!memory) {
      return [];
    }

    return this.search(memory.text, options);
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<{ count: number }> {
    this.ensureInitialized();

    const status = await this.getStatus();
    return {
      count: status ? Object.keys(status).length : 0, // Placeholder
    };
  }
}

/**
 * Map boomerang source type to memini-ai source type
 */
function mapSourceType(
  type: SourceType
): 'session' | 'file' | 'web' | 'boomerang' | 'project' {
  switch (type) {
    case 'conversation':
      return 'session';
    case 'file':
      return 'file';
    case 'web':
      return 'web';
    case 'manual':
      return 'boomerang';
    default:
      return 'boomerang';
  }
}

/**
 * Map memini-ai source type back to boomerang source type
 */
function reverseMapSourceType(type: string): SourceType {
  switch (type) {
    case 'session':
      return 'conversation';
    case 'file':
      return 'file';
    case 'web':
      return 'web';
    case 'boomerang':
      return 'manual';
    case 'project':
      return 'manual';
    default:
      return type as SourceType;
  }
}

/**
 * Adapt a raw memory from memini-ai to our MemoryEntry type
 */
function adaptMemoryEntry(meminiEntry: {
  id: string;
  text: string;
  sourceType: string;
  sourcePath?: string;
  timestamp: number;
  contentHash?: string;
  metadataJson?: string;
  sessionId?: string;
  projectId?: string;
  score?: number;
  trustScore?: number;
  vector?: Float32Array;
}): MemoryEntry {
  return {
    id: meminiEntry.id,
    text: meminiEntry.text,
    vector: Array.from(meminiEntry.vector || []),
    sourceType: reverseMapSourceType(meminiEntry.sourceType) as SourceType,
    sourcePath: meminiEntry.sourcePath || '',
    timestamp: meminiEntry.timestamp,
    contentHash: meminiEntry.contentHash || '',
    metadataJson: meminiEntry.metadataJson as string | undefined,
    sessionId: meminiEntry.sessionId as string | undefined,
    projectId: meminiEntry.projectId as string | undefined,
    score: meminiEntry.score as number | undefined,
    trustScore: meminiEntry.trustScore as number | undefined,
  };
}

/**
 * Factory function to get the MemorySystem singleton
 */
export function getMemorySystem(): MemorySystem {
  return MemorySystem.getInstance();
}

export { MemorySystem };
export type { MeminiMCPClient as MeminiClient };