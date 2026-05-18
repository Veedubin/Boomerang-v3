/**
 * Memory entry and search types for memini-ai integration
 * Updated to include trust engine fields from memini-ai
 */

export type SourceType = 'file' | 'conversation' | 'manual' | 'web';

/**
 * Source type compatible with memini-ai
 */
export type MemorySourceType = 'session' | 'file' | 'web' | 'boomerang' | 'project';

/**
 * Trust signal types for trust engine
 */
export type TrustSignal = 'agent_used' | 'agent_ignored' | 'user_corrected' | 'user_confirmed';

/**
 * Relationship types for memory graph
 */
export type RelationshipType = 'SUPERSEDES' | 'RELATED_TO' | 'CONTRADICTS' | 'DERIVED_FROM';

/**
 * Trust level classification
 */
export type TrustLevel = 'archived' | 'low' | 'medium' | 'high' | 'promoted';

/**
 * Memory entry with trust engine support
 */
export interface MemoryEntry {
  /** Unique identifier (UUID) */
  id: string;
  /** Raw text content */
  text: string;
  /** Embedding vector */
  vector: number[];
  /** Origin of the memory */
  sourceType: SourceType;
  /** File path or URL or conversation ID */
  sourcePath: string;
  /** Creation timestamp (Unix ms) */
  timestamp: number;
  /** SHA-256 hash of content */
  contentHash: string;
  /** JSON-serialized metadata */
  metadataJson?: string;
  /** Associated session ID */
  sessionId?: string;
  /** Similarity score from search (populated when returned from search) */
  score?: number;
  /** Project ID for multi-tenant isolation */
  projectId?: string;
  /** Trust score (0.0-1.0, default 0.5) */
  trustScore?: number;
  /** Number of times retrieved */
  retrievalCount?: number;
  /** Whether memory is archived (trust below threshold) */
  isArchived?: boolean;
}

/**
 * Trust score result from trust engine
 */
export interface TrustScore {
  id: string;
  trustScore: number | null;
  trustLevel: TrustLevel | null;
  retrievalCount: number | null;
  isArchived: boolean | null;
}

/**
 * Relationship between memories
 */
export interface Relationship {
  targetId: string;
  relationshipType: RelationshipType;
  confidence: number;
}

/**
 * Relationship summary for a memory
 */
export interface RelationshipSummary {
  memoryId: string;
  totalRelationships: number;
  byType: Record<RelationshipType, number>;
}

/**
 * Tiered summary (L0/L1)
 */
export interface TieredSummary {
  tier: 'L0' | 'L1';
  content: string | null;
  tokenCount: number;
  cacheHit: boolean;
  sourceCount: number;
  generatedAt: string | null;
  error?: string;
}

/**
 * Extraction result from preconpress
 */
export interface ExtractionResult {
  extractionCount: number;
  memoriesCreated: string[];
  contextCaptured: string;
}

/**
 * Search result wrapper
 */
export interface SearchResult<T = MemoryEntry | ProjectChunk> {
  entry: T;
  score: number;
}

/**
 * Search strategy options
 */
export type SearchStrategy = 'tiered' | 'vector_only' | 'text_only' | 'parallel';

export interface SearchOptions {
  strategy: SearchStrategy;
  topK: number;
  threshold: number;
  filter?: {
    sourceType?: MemorySourceType;
    sessionId?: string;
    since?: Date;
    projectId?: string;
  };
}

/** Default search options */
export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  strategy: 'tiered',
  topK: 10,
  threshold: 0.7,
};

/**
 * Project chunk from indexer
 */
export interface ProjectChunk {
  id: string;
  filePath: string;
  content: string;
  vector: number[];
  chunkIndex: number;
  lineStart: number;
  lineEnd: number;
  contentHash: string;
  timestamp: number;
}

/**
 * Search project result
 */
export interface SearchProjectResult {
  path: string;
  content: string;
  chunkIndex: number;
  totalChunks: number;
  score: number;
}

/**
 * KG Query structure
 */
export interface KGQuery {
  entityA?: string;
  entityB?: string;
  relationshipTypes?: string[];
  inferenceDepth?: number;
  limit?: number;
}

/**
 * KG Result entry
 */
export interface KGResult {
  success: boolean;
  count: number;
  results: unknown[];
  error?: string;
}

/**
 * Entity from knowledge graph
 */
export interface Entity {
  id: string;
  name: string;
  entityType: string;
  metadata: Record<string, unknown>;
}

/**
 * Entity graph for a specific entity
 */
export interface EntityGraph {
  entityId: string;
  incoming: unknown[];
  outgoing: unknown[];
  inferred: unknown[];
}

/**
 * Inference path between entities
 */
export interface InferencePath {
  path: string[];
  confidence: number;
  depth: number;
}

/**
 * Contradiction pair
 */
export interface Contradiction {
  memoryA: MemoryEntry;
  memoryB: MemoryEntry;
  contradictionType: string;
  evidence: string[];
}

/**
 * Resolution for contradiction
 */
export interface Resolution {
  memoryAId: string;
  memoryBId: string;
  proArguments: Argument[];
  conArguments: Argument[];
  resolution: string;
  winner: 'A' | 'B' | 'tie' | null;
  reasoning: string;
  confidence: number;
  timestamp: string;
}

/**
 * Dialectic argument
 */
export interface Argument {
  memoryId: string;
  side: 'pro' | 'con';
  argument: string;
  confidence: number;
  evidence: string[];
}

/**
 * Server status
 */
export interface ServerStatus {
  memoryReady: boolean;
  modelReady: boolean;
  indexerReady: boolean;
  trustEngineReady: boolean;
  memoryGraphReady: boolean;
  knowledgeGraphReady: boolean;
  extractorReady: boolean;
  precompressReady: boolean;
  tieredLoadingReady: boolean;
  userModelingReady: boolean;
  multiPeerReady: boolean;
  dialecticReady: boolean;
  initError?: string;
}