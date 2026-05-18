/**
 * Trust engine integration for memini-ai
 *
 * Provides trust scoring and adjustment for memory entries
 */

import { getClient, MeminiClient } from '../memini-client/index.js';
import type { MemoryEntry, TrustSignal, TrustScore } from './schema.js';

const TRUST_SIGNALS: TrustSignal[] = ['agent_used', 'agent_ignored', 'user_corrected', 'user_confirmed'];

/**
 * Get trust score for a memory entry
 */
export async function getTrustScore(
  memoryId: string,
  client?: MeminiClient
): Promise<TrustScore> {
  const mc = client ?? getClient();
  const result = await mc.getTrustScore(memoryId);

  return {
    id: memoryId,
    trustScore: result ?? null,
    trustLevel: null,
    retrievalCount: null,
    isArchived: null,
  };
}

/**
 * Adjust trust score based on feedback signal
 */
export async function adjustTrust(
  memoryId: string,
  signal: TrustSignal,
  client?: MeminiClient
): Promise<{
  success: boolean;
  memoryId: string;
  oldScore: number | null;
  newScore: number | null;
  signal: TrustSignal;
  action: string | null;
}> {
  if (!TRUST_SIGNALS.includes(signal)) {
    throw new Error(`Invalid trust signal: ${signal}. Must be one of: ${TRUST_SIGNALS.join(', ')}`);
  }

  const mc = client ?? getClient();
  await mc.adjustTrust(memoryId, signal);

  return {
    success: true,
    memoryId,
    oldScore: null,
    newScore: null,
    signal,
    action: null,
  };
}

/**
 * List archived memories (trust below archive threshold)
 */
export async function listArchived(
  limit = 50,
  offset = 0,
  client?: MeminiClient
): Promise<MemoryEntry[]> {
  const mc = client ?? getClient();
  const result = await mc.listArchived(limit, offset);

  return result.map((e) => ({
    id: e.id,
    text: e.text,
    vector: Array.from(e.vector || []),
    sourceType: e.sourceType as MemoryEntry['sourceType'],
    sourcePath: e.sourcePath || '',
    timestamp: e.timestamp,
    contentHash: e.contentHash || '',
  }));
}

/**
 * Get decay engine status
 */
export async function getDecayStatus(
  client?: MeminiClient
): Promise<{
  enabled: boolean;
  decayStats?: {
    totalMemories: number;
    archivedCount: number;
    fadingCount: number;
  };
  fadingMemories: MemoryEntry[];
}> {
  const mc = client ?? getClient();
  const result = await mc.getDecayStatus();

  if (!result) {
    return {
      enabled: false,
      fadingMemories: [],
    };
  }

  return {
    enabled: result.enabled,
    decayStats: {
      totalMemories: result.totalMemories,
      archivedCount: result.archivedCount,
      fadingCount: result.fadingCount,
    },
    fadingMemories: [],
  };
}

/**
 * List fading memories (approaching archive threshold)
 */
export async function listFadingMemories(
  limit = 20,
  client?: MeminiClient
): Promise<MemoryEntry[]> {
  const mc = client ?? getClient();
  const result = await mc.listFadingMemories(limit);

  return result.map((e) => ({
    id: e.id,
    text: e.text,
    vector: Array.from(e.vector || []),
    sourceType: e.sourceType as MemoryEntry['sourceType'],
    sourcePath: e.sourcePath || '',
    timestamp: e.timestamp,
    contentHash: e.contentHash || '',
  }));
}

/**
 * Adjust decay rate for a specific memory
 */
export async function adjustDecayRate(
  memoryId: string,
  decayRate: number,
  client?: MeminiClient
): Promise<{
  success: boolean;
  memoryId: string;
  newDecayRate: number;
  message: string;
}> {
  // Clamp decay rate to valid range
  const clampedRate = Math.max(0.1, Math.min(10.0, decayRate));

  const mc = client ?? getClient();
  await mc.adjustDecayRate(memoryId, clampedRate);

  return {
    success: true,
    memoryId,
    newDecayRate: clampedRate,
    message: 'Decay rate adjusted',
  };
}

/**
 * Trigger memory consolidation
 */
export async function triggerConsolidation(
  force = false,
  client?: MeminiClient
): Promise<{
  success: boolean;
  pairsFound: number;
  pairsMerged: number;
  memoriesConsolidated: number;
}> {
  const mc = client ?? getClient();
  const result = await mc.triggerConsolidation(force);

  if (!result) {
    return {
      success: false,
      pairsFound: 0,
      pairsMerged: 0,
      memoriesConsolidated: 0,
    };
  }

  return {
    success: true,
    pairsFound: 0,
    pairsMerged: result.mergedCount,
    memoriesConsolidated: result.mergedCount,
  };
}

/**
 * Adapt a raw memory from memini-ai to our MemoryEntry type
 */
function adaptMemoryEntry(meminiEntry: { id: string; text: string; sourceType: string; sourcePath?: string; timestamp: number; contentHash?: string; metadataJson?: string; sessionId?: string; projectId?: string; score?: number; trustScore?: number; vector?: Float32Array }): MemoryEntry {
  return {
    id: meminiEntry.id,
    text: meminiEntry.text,
    vector: Array.from(meminiEntry.vector || []),
    sourceType: meminiEntry.sourceType as MemoryEntry['sourceType'],
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