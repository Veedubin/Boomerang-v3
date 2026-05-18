/**
 * Tiered loading integration for memini-ai
 *
 * L0: ~100 tokens - project summary for session start
 * L1: ~2K tokens - key decisions for planning tasks
 */

import { getClient, MeminiClient } from '../memini-client/index.js';
import type { TieredSummary, ExtractionResult } from './schema.js';

/**
 * Get L0 project summary (~100 tokens)
 *
 * Uses high-trust memories (trust >= 0.5) to generate a concise
 * project summary suitable for session start auto-injection.
 */
export async function getTier0Summary(
  forceRefresh = false,
  client?: MeminiClient
): Promise<TieredSummary> {
  const mc = client ?? getClient();
  const result = await mc.getTier0Summary(forceRefresh);

  if (!result) {
    return {
      tier: 'L0',
      content: null,
      tokenCount: 0,
      cacheHit: false,
      sourceCount: 0,
      generatedAt: null,
      error: 'Failed to generate summary',
    };
  }

  return {
    tier: 'L0',
    content: result.content,
    tokenCount: result.memoryCount,
    cacheHit: false,
    sourceCount: result.memoryCount,
    generatedAt: result.generatedAt,
    error: undefined,
  };
}

/**
 * Get L1 key decisions summary (~2K tokens)
 *
 * Uses promoted memories (trust >= 0.8) to generate a structured
 * summary of key decisions and patterns for planning tasks.
 */
export async function getTier1Summary(
  forceRefresh = false,
  client?: MeminiClient
): Promise<TieredSummary> {
  const mc = client ?? getClient();
  const result = await mc.getTier1Summary(forceRefresh);

  if (!result) {
    return {
      tier: 'L1',
      content: null,
      tokenCount: 0,
      cacheHit: false,
      sourceCount: 0,
      generatedAt: null,
      error: 'Failed to generate summary',
    };
  }

  return {
    tier: 'L1',
    content: result.content,
    tokenCount: result.memoryCount,
    cacheHit: false,
    sourceCount: result.memoryCount,
    generatedAt: result.generatedAt,
    error: undefined,
  };
}

/**
 * Trigger memory extraction manually
 *
 * Extracts facts/decisions/preferences from conversation text
 * using LLM-based automatic extraction.
 */
export async function triggerExtraction(
  conversation?: string,
  client?: MeminiClient
): Promise<{
  success: boolean;
  count: number;
  memoryIds: string[];
}> {
  const mc = client ?? getClient();
  const result = await mc.triggerExtraction(conversation);

  return {
    success: true,
    count: result.length,
    memoryIds: result,
  };
}

/**
 * Pre-compression extraction
 *
 * Captures current context and extracts memories before context
 * compression/compaction. Helps preserve important details.
 */
export async function preconpressExtraction(
  context?: string,
  client?: MeminiClient
): Promise<ExtractionResult> {
  const mc = client ?? getClient();
  const result = await mc.preconpressExtraction(context);

  if (!result) {
    return {
      extractionCount: 0,
      memoriesCreated: [],
      contextCaptured: context ?? '',
    };
  }

  return {
    extractionCount: result.extractedMemories.length,
    memoriesCreated: result.extractedMemories,
    contextCaptured: context ?? '',
  };
}