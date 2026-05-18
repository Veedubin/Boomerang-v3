/**
 * Memory Schema Definitions
 * 
 * Shared types between memini-client and plugin.
 */

// Source type for memory entries
export type MemorySourceType = 'session' | 'file' | 'web' | 'boomerang' | 'project';

// Memory entry stored in the database
export interface MemoryEntry {
  id: string;
  text: string;
  sourceType: MemorySourceType;
  sourcePath: string;
  timestamp: number;
  metadataJson: string;
  sessionId?: string;
  score?: number;
  trustScore?: number;
  vector?: Float32Array;
  contentHash?: string;
  projectId?: string;
}

// Input for creating a new memory entry
export type MemoryEntryInput = Omit<MemoryEntry, 'id' | 'timestamp' | 'vector' | 'contentHash'> & {
  vector?: Float32Array | number[];
};

// Search strategy for querying memories
export type SearchStrategy = 'TIERED' | 'VECTOR_ONLY' | 'TEXT_ONLY' | 'PARALLEL';

// Options for searching memories
export interface SearchOptions {
  topK?: number;
  strategy?: SearchStrategy;
  threshold?: number;
  filter?: SearchFilter;
}

// Filter criteria for memory search
export interface SearchFilter {
  sourceType?: MemorySourceType;
  sessionId?: string;
  since?: Date;
  projectId?: string;
}

// Trust signal types
export type TrustSignal = 'agent_used' | 'agent_ignored' | 'user_corrected' | 'user_confirmed';

// Constants
export const MEMORY_TABLE_NAME = 'memories';
export const DEFAULT_SEARCH_OPTIONS: Required<SearchOptions> = {
  topK: 5,
  strategy: 'TIERED',
  threshold: 0.72,
  filter: {},
};
