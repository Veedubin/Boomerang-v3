/**
 * Contradiction detection integration for memini-ai
 *
 * Finds and resolves contradictory memory pairs using dialectic reasoning
 */

import { getClient, MeminiClient } from '../memini-client/index.js';
import type { MemoryEntry, Contradiction, Resolution, Argument } from './schema.js';

/**
 * Find memory pairs that contradict each other
 */
export async function findContradictions(
  query?: string,
  limit = 10,
  client?: MeminiClient
): Promise<Contradiction[]> {
  const mc = client ?? getClient();
  const result = await mc.findContradictions(query, limit);

  return result.map((c) => ({
    memoryA: { id: c.memoryIdA, text: c.textA } as MemoryEntry,
    memoryB: { id: c.memoryIdB, text: c.textB } as MemoryEntry,
    contradictionType: c.contradictionType,
    evidence: [],
  }));
}

/**
 * Resolve contradiction between two memories
 *
 * Generates dialectic resolution with pro/con arguments
 */
export async function resolveContradiction(
  memoryIdA: string,
  memoryIdB: string,
  client?: MeminiClient
): Promise<Resolution | null> {
  const mc = client ?? getClient();
  const result = await mc.resolveContradiction(memoryIdA, memoryIdB);

  if (!result) {
    return null;
  }

  return {
    memoryAId: memoryIdA,
    memoryBId: memoryIdB,
    proArguments: [],
    conArguments: [],
    resolution: result.resolutionText,
    winner: null,
    reasoning: '',
    confidence: result.confidence,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get dialectic history for a memory
 */
export async function getDialecticHistory(
  memoryId: string,
  client?: MeminiClient
): Promise<{
  memoryId: string;
  notes: string[];
  challenges: Array<{
    challengeText: string;
    response: string;
    confidenceDelta: number;
    timestamp: string;
  }>;
  resolutions: Resolution[];
}> {
  const mc = client ?? getClient();
  const results = await mc.getDialecticHistory(memoryId);

  if (results.length === 0) {
    return {
      memoryId,
      notes: [],
      challenges: [],
      resolutions: [],
    };
  }

  // Get the first history entry
  const first = results[0];
  return {
    memoryId: first.memoryId,
    notes: [],
    challenges: [{
      challengeText: first.challengeText,
      response: first.responseText ?? '',
      confidenceDelta: 0,
      timestamp: first.timestamp,
    }],
    resolutions: [],
  };
}

/**
 * Challenge a memory with a counter-argument
 */
export async function challengeMemory(
  memoryId: string,
  challengeText: string,
  client?: MeminiClient
): Promise<{
  success: boolean;
  memoryId: string;
  challengeText: string;
  response: string;
  confidenceDelta: number;
  timestamp: string;
} | null> {
  const mc = client ?? getClient();
  const result = await mc.challengeMemory(memoryId, challengeText);

  if (!result) {
    return null;
  }

  return {
    success: true,
    memoryId: result.memoryId,
    challengeText: result.challengeText,
    response: '',
    confidenceDelta: 0,
    timestamp: result.timestamp,
  };
}

/**
 * Adapt a raw memory from memini-ai to our MemoryEntry type
 */
function adaptMemoryEntry(raw: Record<string, unknown>): MemoryEntry {
  let timestamp: number;
  if (typeof raw.timestamp === 'number') {
    timestamp = raw.timestamp;
  } else if (typeof raw.timestamp === 'string') {
    timestamp = new Date(raw.timestamp).getTime();
  } else {
    timestamp = Date.now();
  }

  return {
    id: raw.id as string,
    text: raw.text as string,
    vector: (raw.vector as number[]) ?? [],
    sourceType: (raw.sourceType as MemoryEntry['sourceType']) ?? 'manual',
    sourcePath: (raw.sourcePath as string) ?? '',
    timestamp,
    contentHash: raw.contentHash as string,
    metadataJson: raw.metadataJson as string | undefined,
    sessionId: raw.sessionId as string | undefined,
    projectId: raw.projectId as string | undefined,
    score: raw.score as number | undefined,
    trustScore: raw.trustScore as number | undefined,
    retrievalCount: raw.retrievalCount as number | undefined,
    isArchived: raw.isArchived as boolean | undefined,
  };
}