/**
 * Boomerang Plugin v4.0.0 - Core Type Definitions
 * 
 * Types for the opencode-plugin package.
 * Compatible with memini-ai MemoryEntry format.
 */

// Plugin Context - provided by OpenCode
export interface PluginContext {
  cwd: string;
  interactive: boolean;
  args: string[];
  client: unknown;
  $: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
}

// Memory Entry - compatible with memini-ai / Super-Memory-TS
export type MemorySourceType = 'session' | 'file' | 'web' | 'boomerang' | 'project';

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
}

// Search Result
export interface SearchResult<T = MemoryEntry> {
  entry: T;
  score: number;
}

// Search Options
export interface SearchOptions {
  strategy: 'TIERED' | 'VECTOR_ONLY' | 'TEXT_ONLY' | 'PARALLEL';
  topK: number;
  threshold?: number;
  filter?: SearchFilter;
}

// Search Filter
export interface SearchFilter {
  sourceType?: MemorySourceType;
  sessionId?: string;
  since?: Date;
  projectId?: string;
}

// Trust Signal types
export type TrustSignal = 'agent_used' | 'agent_ignored' | 'user_corrected' | 'user_confirmed';

// Orchestration Result
export interface OrchestrationResult {
  agent: string;
  systemPrompt: string;
  contextPackage: ContextPackage;
  suggestions: {
    useSequentialThinking: boolean;
    runQualityGates: boolean;
  };
}

// Context Package built by orchestrator
export interface ContextPackage {
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
}

// Agent Definition
export interface AgentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  skills: string[];
}

// Skill Definition
export interface SkillDefinition {
  name: string;
  description: string;
  instructions: string;
}

// Quality Gate
export interface QualityGate {
  name: string;
  enabled: boolean;
}

export interface QualityGateResult {
  gate: string;
  passed: boolean;
  output: string;
  error?: string;
}

export interface QualityGateSummary {
  allPassed: boolean;
  summary: string;
  results: QualityGateResult[];
}

// Git
export interface GitStatus {
  isDirty: boolean;
  files: string[];
  branch: string;
  ahead: number;
  behind: number;
}

export interface GitCommitResult {
  success: boolean;
  hash?: string;
  message?: string;
  error?: string;
}

// Plugin Configuration
export interface BoomerangConfig {
  memoryEnabled: boolean;
  qualityGates: {
    lint: boolean;
    typecheck: boolean;
    test: boolean;
  };
}