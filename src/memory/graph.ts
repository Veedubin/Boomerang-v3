/**
 * Memory graph integration for memini-ai
 *
 * Manages relationships between memory entries
 */

import { getClient, MeminiClient } from '../memini-client/index.js';
import type { MemoryEntry, RelationshipType, RelationshipSummary } from './schema.js';

/**
 * Find memories related to a given memory
 */
export async function findRelatedMemories(
  memoryId: string,
  relationshipType?: RelationshipType,
  limit = 10,
  client?: MeminiClient
): Promise<MemoryEntry[]> {
  const mc = client ?? getClient();
  // findRelatedMemories returns MemoryEntry[], but API shows MemoryEntry[] directly
  const entries = await mc.findRelatedMemories(memoryId, relationshipType, limit);
  return entries.map((e) => ({
    id: e.id,
    text: e.text,
    vector: Array.from(e.vector || []),
    sourceType: reverseMapSourceType(e.sourceType) as MemoryEntry['sourceType'],
    sourcePath: e.sourcePath || '',
    timestamp: e.timestamp,
    contentHash: e.contentHash || '',
  }));
}

/**
 * Create a relationship between two memories
 */
export async function createRelationship(
  sourceId: string,
  targetId: string,
  type: RelationshipType,
  confidence = 1.0,
  client?: MeminiClient
): Promise<{
  success: boolean;
  sourceId: string;
  targetId: string;
  relationshipType: RelationshipType;
  confidence: number;
}> {
  const mc = client ?? getClient();
  await mc.createRelationship(sourceId, targetId, type, confidence);

  return {
    success: true,
    sourceId,
    targetId,
    relationshipType: type,
    confidence,
  };
}

/**
 * Get summary of all relationships for a memory
 */
export async function getRelationshipSummary(
  memoryId: string,
  client?: MeminiClient
): Promise<RelationshipSummary> {
  const mc = client ?? getClient();
  const result = await mc.getRelationshipSummary(memoryId);

  if (!result) {
    return {
      memoryId,
      totalRelationships: 0,
      byType: {
        SUPERSEDES: 0,
        RELATED_TO: 0,
        CONTRADICTS: 0,
        DERIVED_FROM: 0,
      },
    };
  }

  // Ensure all relationship types are present
  const allTypes: RelationshipType[] = ['SUPERSEDES', 'RELATED_TO', 'CONTRADICTS', 'DERIVED_FROM'];
  const completeByType = {} as Record<RelationshipType, number>;
  for (const t of allTypes) {
    completeByType[t] = result.byType?.[t] ?? 0;
  }

  return {
    memoryId: result.memoryId,
    totalRelationships: result.totalRelationships,
    byType: completeByType,
  };
}

/**
 * Map memini-ai source type back to boomerang source type
 */
function reverseMapSourceType(type: string): string {
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
      return type;
  }
}