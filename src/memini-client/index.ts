/**
 * Memini Client - TypeScript wrapper for memini-ai MCP server
 *
 * Communicates with the Python memini-ai FastMCP server via stdio.
 * Provides the same interface as Super-Memory-TS MemorySystem.
 *
 * Uses persistent process architecture: ONE server process for all tool calls,
 * with proper MCP JSON-RPC message framing over stdio.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MemoryEntry, SearchOptions } from './schema.js';

// ============================================================================
// Type Definitions
// ============================================================================

interface MeminiMemoryEntry {
  id: string;
  text: string;
  sourceType: 'session' | 'file' | 'web' | 'boomerang' | 'project';
  sourcePath?: string;
  timestamp: string;
  metadataJson?: string;
  sessionId?: string;
  projectId?: string;
  score?: number;
  trustScore?: number;
}

// ---------------------------------------------------------------------------
// Contradiction Types
// ---------------------------------------------------------------------------

export interface Contradiction {
  memoryIdA: string;
  memoryIdB: string;
  textA: string;
  textB: string;
  contradictionType: string;
  severity: number;
}

export interface Resolution {
  resolutionText: string;
  resolvedMemoryId: string;
  confidence: number;
  method: string;
}

export interface DialecticHistory {
  memoryId: string;
  challengeText: string;
  responseText?: string;
  timestamp: string;
  outcome: 'pending' | 'resolved' | 'superseded';
}

export interface Challenge {
  challengeText: string;
  memoryId: string;
  challengeId: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Relationship Types
// ---------------------------------------------------------------------------

export interface RelationshipSummary {
  memoryId: string;
  totalRelationships: number;
  byType: Record<string, number>;
  highConfidenceCount: number;
}

// ---------------------------------------------------------------------------
// Knowledge Graph Types
// ---------------------------------------------------------------------------

export interface KGQuery {
  entity_a?: string;
  entity_b?: string;
  relationship_types?: string[];
  inference_depth?: number;
  limit?: number;
}

export interface KGResult {
  entities: Entity[];
  relationships: KGRelationship[];
  paths: InferencePath[];
}

export interface Entity {
  id: string;
  name: string;
  type?: string;
  properties?: Record<string, unknown>;
  trustScore?: number;
}

export interface KGRelationship {
  sourceId: string;
  targetId: string;
  relationshipType: string;
  confidence: number;
}

export interface EntityGraph {
  entity: Entity;
  connections: Array<{
    target: Entity;
    relationshipType: string;
    confidence: number;
  }>;
  depth: number;
}

export interface InferencePath {
  startEntity: string;
  endEntity: string;
  path: Array<{
    entity: string;
    relationship: string;
  }>;
  confidence: number;
  depth: number;
}

// ---------------------------------------------------------------------------
// Tiered Memory Types
// ---------------------------------------------------------------------------

export interface TieredSummary {
  content: string;
  memoryCount: number;
  trustAverage: number;
  generatedAt: string;
}

export interface ExtractionResult {
  extractedMemories: string[];
  confidence: number;
  entities: string[];
}

// ---------------------------------------------------------------------------
// Trust/Decay Types
// ---------------------------------------------------------------------------

export interface DecayStatus {
  enabled: boolean;
  totalMemories: number;
  archivedCount: number;
  fadingCount: number;
  averageTrust: number;
}

export interface ConsolidationResult {
  mergedCount: number;
  archivedCount: number;
  duration: number;
}

export interface ServerStatus {
  memoryReady: boolean;
  modelReady: boolean;
  indexerReady: boolean;
  initError: string | null;
}

// ---------------------------------------------------------------------------
// Alias types for search compatibility
// ---------------------------------------------------------------------------

export type SearchResult<T> = { entry: T; score: number };

// ============================================================================
// MeminiClient - Persistent MCP stdio Client
// ============================================================================

/**
 * Convert memini MemoryEntry to plugin MemoryEntry
 */
function toMemoryEntry(meminiEntry: MeminiMemoryEntry): MemoryEntry {
  return {
    id: meminiEntry.id,
    text: meminiEntry.text,
    sourceType: meminiEntry.sourceType,
    sourcePath: meminiEntry.sourcePath || '',
    timestamp: new Date(meminiEntry.timestamp).getTime(),
    metadataJson: meminiEntry.metadataJson || '{}',
    sessionId: meminiEntry.sessionId,
    score: meminiEntry.score,
    trustScore: meminiEntry.trustScore,
  };
}

/**
 * Parse tool result content - FastMCP returns content array with text
 */
function parseToolResult(result: unknown): unknown {
  const res = result as { content?: Array<{ type: string; text: string }> };
  if (Array.isArray(res.content)) {
    const textContent = res.content.find((c) => c.type === 'text');
    if (textContent && typeof textContent.text === 'string') {
      try {
        return JSON.parse(textContent.text);
      } catch {
        return textContent.text;
      }
    }
  }
  return result;
}

/**
 * MeminiClient - wraps memini-ai MCP server with MemorySystem-compatible API
 *
 * Uses persistent process architecture with proper MCP stdio transport.
 */
export class MeminiClient {
  private static instance: MeminiClient | null = null;
  private _initialized: boolean = false;
  private _serverUrl: string = 'http://localhost:6333';
  private _mcpClient: Client | null = null;
  private _transport: StdioClientTransport | null = null;

  private constructor() {}

  static getInstance(): MeminiClient {
    if (!MeminiClient.instance) {
      MeminiClient.instance = new MeminiClient();
    }
    return MeminiClient.instance;
  }

  isInitialized(): boolean {
    return this._initialized;
  }

  async initialize(serverUrl?: string): Promise<void> {
    if (this._initialized) {
      return;
    }

    if (serverUrl) {
      this._serverUrl = serverUrl;
    }

    try {
      // Create stdio transport - SDK handles process spawning
      this._transport = new StdioClientTransport({
        command: 'python',
        args: ['-m', 'memini_ai.server'],
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      });

      // Create MCP client
      this._mcpClient = new Client({
        name: 'memini-ai-client',
        version: '1.0.0',
      }, {
        capabilities: {},
      });

      // Connect client to transport
      await this._mcpClient.connect(this._transport);
      console.log('memini-ai MCP client connected');

      // Verify connection with get_status
      const status = await this._mcpClient.callTool({ name: 'get_status' }) as unknown as ServerStatus;
      if (status) {
        console.log('memini-ai server initialized:', status);
      }

      this._initialized = true;
    } catch (err) {
      console.warn('memini-ai server not available, operating in degraded mode:', err);
      // Graceful degradation - mark as initialized to allow other operations
      this._initialized = true;
    }
  }

  /**
   * Ensure MCP client is connected
   */
  private ensureConnected(): void {
    if (!this._mcpClient) {
      throw new Error('MeminiClient not connected. Call initialize() first.');
    }
  }

  /**
   * Call MCP tool with arguments
   */
  private async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const result = await this._mcpClient!.callTool({ name: toolName, arguments: args });
    return parseToolResult(result);
  }

  async search(query: string, options?: Partial<SearchOptions>): Promise<{ entry: MemoryEntry; score: number }[]> {
    this.ensureConnected();

    const topK = options?.topK || 10;
    const strategy = options?.strategy || 'tiered';

    try {
      const result = await this.callTool('query_memories', {
        query,
        limit: topK,
        strategy,
      }) as { memories: MeminiMemoryEntry[] };

      return result.memories.map((mem) => ({
        entry: toMemoryEntry(mem),
        score: mem.score || 0,
      }));
    } catch (err) {
      console.error('memini-ai query_memories failed:', err);
      return [];
    }
  }

  async addMemory(entry: Partial<MemoryEntry>): Promise<MemoryEntry> {
    this.ensureConnected();

    const input = {
      content: entry.text || '',
      sourceType: entry.sourceType || 'boomerang',
      sourcePath: entry.sourcePath || '',
      metadata: entry.metadataJson ? JSON.parse(entry.metadataJson) : {},
      sessionId: entry.sessionId || '',
    };

    try {
      const result = await this.callTool('add_memory', input) as { id: string };

      // Get the created memory
      const memories = await this.search(input.content, { topK: 1 });
      if (memories.length > 0) {
        return memories[0].entry;
      }

      // Fallback: construct from input
      return {
        id: result.id,
        text: input.content,
        sourceType: input.sourceType as MemoryEntry['sourceType'],
        sourcePath: input.sourcePath,
        timestamp: Date.now(),
        metadataJson: JSON.stringify(input.metadata),
        sessionId: input.sessionId,
      };
    } catch (err) {
      console.error('memini-ai add_memory failed:', err);
      throw err;
    }
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
    try {
      this.ensureConnected();
      const result = await this.callTool('get_trust_score', { memory_id: memoryId }) as { trustScore: number };
      return result?.trustScore ?? null;
    } catch {
      return null;
    }
  }

  async adjustTrust(memoryId: string, signal: 'agent_used' | 'agent_ignored' | 'user_corrected' | 'user_confirmed'): Promise<void> {
    try {
      this.ensureConnected();
      await this.callTool('adjust_trust', { memory_id: memoryId, signal });
    } catch (err) {
      console.error('memini-ai adjust_trust failed:', err);
    }
  }

  // =========================================================================
  // Contradiction Methods
  // =========================================================================

  async findContradictions(query?: string, limit: number = 10): Promise<Contradiction[]> {
    try {
      this.ensureConnected();
      const result = await this.callTool('find_contradictions', {
        query: query || '',
        limit,
      }) as { contradictions: Contradiction[] };
      return result.contradictions || [];
    } catch (err) {
      console.error('memini-ai find_contradictions failed:', err);
      return [];
    }
  }

  async resolveContradiction(memoryIdA: string, memoryIdB: string): Promise<Resolution | null> {
    try {
      this.ensureConnected();
      const result = await this.callTool('resolve_contradiction', {
        memory_id_a: memoryIdA,
        memory_id_b: memoryIdB,
      }) as { resolution: Resolution };
      return result.resolution;
    } catch (err) {
      console.error('memini-ai resolve_contradiction failed:', err);
      return null;
    }
  }

  async getDialecticHistory(memoryId: string): Promise<DialecticHistory[]> {
    try {
      this.ensureConnected();
      const result = await this.callTool('get_dialectic_history', {
        memory_id: memoryId,
      }) as { history: DialecticHistory[] };
      return result.history || [];
    } catch (err) {
      console.error('memini-ai get_dialectic_history failed:', err);
      return [];
    }
  }

  async challengeMemory(memoryId: string, challengeText: string): Promise<Challenge | null> {
    try {
      this.ensureConnected();
      const result = await this.callTool('challenge_memory', {
        memory_id: memoryId,
        challenge_text: challengeText,
      }) as { challenge: Challenge };
      return result.challenge;
    } catch (err) {
      console.error('memini-ai challenge_memory failed:', err);
      return null;
    }
  }

  // =========================================================================
  // Relationship Methods
  // =========================================================================

  async findRelatedMemories(memoryId: string, relationshipType?: string, limit: number = 10): Promise<MemoryEntry[]> {
    try {
      this.ensureConnected();
      const result = await this.callTool('find_related_memories', {
        memoryId,
        relationshipType: relationshipType || null,
        limit,
      }) as { memories: MeminiMemoryEntry[] };
      return (result.memories || []).map(toMemoryEntry);
    } catch (err) {
      console.error('memini-ai find_related_memories failed:', err);
      return [];
    }
  }

  async createRelationship(sourceId: string, targetId: string, relationshipType: string, confidence: number = 1.0): Promise<void> {
    try {
      this.ensureConnected();
      await this.callTool('create_relationship', {
        sourceId,
        targetId,
        relationshipType,
        confidence,
      });
    } catch (err) {
      console.error('memini-ai create_relationship failed:', err);
    }
  }

  async getRelationshipSummary(memoryId: string): Promise<RelationshipSummary | null> {
    try {
      this.ensureConnected();
      const result = await this.callTool('get_relationship_summary', {
        memoryId,
      }) as { summary: RelationshipSummary };
      return result.summary;
    } catch (err) {
      console.error('memini-ai get_relationship_summary failed:', err);
      return null;
    }
  }

  // =========================================================================
  // Knowledge Graph Methods
  // =========================================================================

  async queryKG(query: KGQuery): Promise<KGResult | null> {
    try {
      this.ensureConnected();
      const result = await this.callTool('query_kg', {
        query: JSON.stringify(query),
      }) as { result: KGResult };
      return result.result;
    } catch (err) {
      console.error('memini-ai query_kg failed:', err);
      return null;
    }
  }

  async extractEntities(memoryId: string): Promise<Entity[]> {
    try {
      this.ensureConnected();
      const result = await this.callTool('extract_entities', {
        memory_id: memoryId,
      }) as { entities: Entity[] };
      return result.entities || [];
    } catch (err) {
      console.error('memini-ai extract_entities failed:', err);
      return [];
    }
  }

  async getEntityGraph(entityId: string, depth: number = 1): Promise<EntityGraph | null> {
    try {
      this.ensureConnected();
      const result = await this.callTool('get_entity_graph', {
        entity_id: entityId,
        depth,
      }) as { graph: EntityGraph };
      return result.graph;
    } catch (err) {
      console.error('memini-ai get_entity_graph failed:', err);
      return null;
    }
  }

  async getInferenceChain(startEntity: string, endEntity: string, maxDepth: number = 3): Promise<InferencePath[]> {
    try {
      this.ensureConnected();
      const result = await this.callTool('get_inference_chain', {
        start_entity: startEntity,
        end_entity: endEntity,
        max_depth: maxDepth,
      }) as { paths: InferencePath[] };
      return result.paths || [];
    } catch (err) {
      console.error('memini-ai get_inference_chain failed:', err);
      return [];
    }
  }

  async searchEntities(name: string, limit: number = 10): Promise<Entity[]> {
    try {
      this.ensureConnected();
      const result = await this.callTool('search_entities', {
        name,
        limit,
      }) as { entities: Entity[] };
      return result.entities || [];
    } catch (err) {
      console.error('memini-ai search_entities failed:', err);
      return [];
    }
  }

  async getGraphVisualization(limit: number = 100): Promise<string> {
    try {
      this.ensureConnected();
      const result = await this.callTool('get_graph_visualization', {
        limit,
      }) as { html: string };
      return result.html || '';
    } catch (err) {
      console.error('memini-ai get_graph_visualization failed:', err);
      return '';
    }
  }

  // =========================================================================
  // Tiered Memory Methods
  // =========================================================================

  async getTier0Summary(forceRefresh: boolean = false): Promise<TieredSummary | null> {
    try {
      this.ensureConnected();
      const result = await this.callTool('get_tier0_summary', {
        force_refresh: forceRefresh,
      }) as { summary: TieredSummary };
      return result.summary;
    } catch (err) {
      console.error('memini-ai get_tier0_summary failed:', err);
      return null;
    }
  }

  async getTier1Summary(forceRefresh: boolean = false): Promise<TieredSummary | null> {
    try {
      this.ensureConnected();
      const result = await this.callTool('get_tier1_summary', {
        force_refresh: forceRefresh,
      }) as { summary: TieredSummary };
      return result.summary;
    } catch (err) {
      console.error('memini-ai get_tier1_summary failed:', err);
      return null;
    }
  }

  async triggerExtraction(conversation?: string): Promise<string[]> {
    try {
      this.ensureConnected();
      const result = await this.callTool('trigger_extraction', {
        conversation: conversation || null,
      }) as { memory_ids: string[] };
      return result.memory_ids || [];
    } catch (err) {
      console.error('memini-ai trigger_extraction failed:', err);
      return [];
    }
  }

  async preconpressExtraction(contextContent?: string): Promise<ExtractionResult | null> {
    try {
      this.ensureConnected();
      const result = await this.callTool('preconpress_extraction', {
        context_content: contextContent || null,
      }) as { result: ExtractionResult };
      return result.result;
    } catch (err) {
      console.error('memini-ai preconpress_extraction failed:', err);
      return null;
    }
  }

  // =========================================================================
  // Trust/Decay Methods
  // =========================================================================

  async listArchived(limit: number = 50, offset: number = 0): Promise<MemoryEntry[]> {
    try {
      this.ensureConnected();
      const result = await this.callTool('list_archived', {
        limit,
        offset,
      }) as { memories: MeminiMemoryEntry[] };
      return (result.memories || []).map(toMemoryEntry);
    } catch (err) {
      console.error('memini-ai list_archived failed:', err);
      return [];
    }
  }

  async getDecayStatus(): Promise<DecayStatus | null> {
    try {
      this.ensureConnected();
      const result = await this.callTool('get_decay_status', {}) as { status: DecayStatus };
      return result.status;
    } catch (err) {
      console.error('memini-ai get_decay_status failed:', err);
      return null;
    }
  }

  async listFadingMemories(limit: number = 20): Promise<MemoryEntry[]> {
    try {
      this.ensureConnected();
      const result = await this.callTool('list_fading_memories', {
        limit,
      }) as { memories: MeminiMemoryEntry[] };
      return (result.memories || []).map(toMemoryEntry);
    } catch (err) {
      console.error('memini-ai list_fading_memories failed:', err);
      return [];
    }
  }

  async adjustDecayRate(memoryId: string, decayRate: number): Promise<void> {
    try {
      this.ensureConnected();
      await this.callTool('adjust_decay_rate', {
        memory_id: memoryId,
        decay_rate: decayRate,
      });
    } catch (err) {
      console.error('memini-ai adjust_decay_rate failed:', err);
    }
  }

  async triggerConsolidation(force: boolean = false): Promise<ConsolidationResult | null> {
    try {
      this.ensureConnected();
      const result = await this.callTool('trigger_consolidation', {
        force,
      }) as { result: ConsolidationResult };
      return result.result;
    } catch (err) {
      console.error('memini-ai trigger_consolidation failed:', err);
      return null;
    }
  }

  // =========================================================================
  // Server Status / Query Aliases
  // =========================================================================

  async getStatus(): Promise<ServerStatus | null> {
    try {
      this.ensureConnected();
      return await this.callTool('get_status', {}) as ServerStatus;
    } catch (err) {
      console.error('memini-ai get_status failed:', err);
      return null;
    }
  }

  async queryMemories(query: string, options?: Partial<SearchOptions>): Promise<SearchResult<MemoryEntry>[]> {
    return this.search(query, options);
  }

  /**
   * Shutdown the client and close the transport
   */
  async shutdown(): Promise<void> {
    if (this._mcpClient) {
      await this._mcpClient.close();
      this._mcpClient = null;
    }
    if (this._transport) {
      await this._transport.close();
      this._transport = null;
    }
    this._initialized = false;
  }

  private ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('MeminiClient not initialized. Call initialize() first.');
    }
  }
}

// Singleton accessor
let clientInstance: MeminiClient | null = null;

export function getClient(): MeminiClient {
  if (!clientInstance) {
    clientInstance = MeminiClient.getInstance();
  }
  return clientInstance;
}

export async function initializeClient(_pythonPath?: string, _serverModule?: string): Promise<MeminiClient> {
  const client = getClient();
  await client.initialize();
  return client;
}

export { MeminiClient as MeminiMCPClient, MeminiClient as MemorySystem };