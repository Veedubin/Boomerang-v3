/**
 * Knowledge graph integration for memini-ai (Phase 3)
 *
 * Entity extraction, graph queries, and inference chains
 */

import { getClient, MeminiClient } from '../memini-client/index.js';
import type { Entity, EntityGraph, InferencePath, KGQuery, KGResult } from './schema.js';

/**
 * Execute a formal knowledge graph query
 */
export async function queryKG(
  query: KGQuery,
  client?: MeminiClient
): Promise<KGResult> {
  const mc = client ?? getClient();

  const result = await mc.queryKG({
    entity_a: query.entityA,
    entity_b: query.entityB,
    relationship_types: query.relationshipTypes,
    inference_depth: query.inferenceDepth ?? 1,
    limit: query.limit ?? 100,
  });

  if (!result) {
    return {
      success: false,
      count: 0,
      results: [],
      error: 'Query failed',
    };
  }

  return {
    success: true,
    count: result.entities.length,
    results: result.entities,
    error: undefined,
  };
}

/**
 * Extract entities from a specific memory
 */
export async function extractEntities(
  memoryId: string,
  client?: MeminiClient
): Promise<{
  success: boolean;
  memoryId: string;
  entities: Entity[];
  count: number;
}> {
  const mc = client ?? getClient();
  const result = await mc.extractEntities(memoryId);

  return {
    success: true,
    memoryId,
    entities: result.map((e) => ({
      id: e.id,
      name: e.name,
      entityType: e.type ?? 'unknown',
      metadata: e.properties ?? {},
    })),
    count: result.length,
  };
}

/**
 * Get all connections to/from an entity
 */
export async function getEntityGraph(
  entityId: string,
  depth = 1,
  client?: MeminiClient
): Promise<EntityGraph | null> {
  const mc = client ?? getClient();
  const result = await mc.getEntityGraph(entityId, depth);

  if (!result) {
    return null;
  }

  return {
    entityId: result.entity.id,
    incoming: result.connections.map((c) => c.target),
    outgoing: result.connections.map((c) => c.target),
    inferred: [],
  };
}

/**
 * Find inference paths between two entities
 */
export async function getInferenceChain(
  startEntity: string,
  endEntity: string,
  maxDepth = 3,
  client?: MeminiClient
): Promise<{
  success: boolean;
  startEntity: string;
  endEntity: string;
  paths: InferencePath[];
  count: number;
  error?: string;
}> {
  const mc = client ?? getClient();
  const result = await mc.getInferenceChain(startEntity, endEntity, maxDepth);

  return {
    success: true,
    startEntity,
    endEntity,
    paths: result.map((p) => ({
      path: p.path.map((step) => step.entity),
      confidence: p.confidence,
      depth: p.depth,
    })),
    count: result.length,
    error: undefined,
  };
}

/**
 * Search for entities by name
 */
export async function searchEntities(
  name: string,
  limit = 10,
  client?: MeminiClient
): Promise<{
  success: boolean;
  query: string;
  entities: Entity[];
  count: number;
}> {
  const mc = client ?? getClient();
  const result = await mc.searchEntities(name, limit);

  return {
    success: true,
    query: name,
    entities: result.map((e) => ({
      id: e.id,
      name: e.name,
      entityType: e.type ?? 'unknown',
      metadata: e.properties ?? {},
    })),
    count: result.length,
  };
}

/**
 * Get HTML visualization of the knowledge graph
 */
export async function getGraphVisualization(
  limit = 100,
  client?: MeminiClient
): Promise<string> {
  const mc = client ?? getClient();
  return mc.getGraphVisualization(limit);
}