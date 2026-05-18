/**
 * Protocol Types for Boomerang v3
 * 
 * Extended with memory features: trust scores, contradictions, tiered loading
 */

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
 * Contradiction pair from dialectic engine
 */
export interface Contradiction {
  memoryA: unknown;
  memoryB: unknown;
  contradictionType: string;
  evidence: string[];
}

/**
 * Context package for agent execution (v3 with memory features)
 */
export interface ContextPackageV3 {
  originalUserRequest: string;
  taskBackground: string;
  relevantFiles: string[];
  codeSnippets: string[];
  previousDecisions: string[];
  expectedOutput: string;
  scopeBoundaries: {
    inScope: string[];
    outOfScope: string[];
  };
  errorHandling: string;
  // Memory feature fields
  trustScores?: Record<string, number>;
  contradictions?: Contradiction[];
  projectSummary?: string;
  keyDecisions?: string;
}

/**
 * Orchestration result supporting both single and multi-agent execution
 */
export interface OrchestrationResultV3 {
  agent?: string;
  systemPrompt?: string;
  contextPackage?: ContextPackageV3;
  tasks?: TaskPlanV3[];
  suggestions: {
    useSequentialThinking: boolean;
    runQualityGates: boolean;
  };
}

/**
 * Task plan for multi-agent parallel execution
 */
export interface TaskPlanV3 {
  id: string;
  agent: string;
  description: string;
  contextPackage: ContextPackageV3;
  dependencies: string[];
  priority: 'low' | 'medium' | 'high';
  canParallelize: boolean;
}