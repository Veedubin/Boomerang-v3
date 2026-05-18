/**
 * BoomerangOrchestrator - Pure Decision Layer v3.0.0
 * 
 * Does NOT execute agents or spawn subprocesses.
 * Analyzes requests and returns Context Packages for OpenCode to execute.
 * 
 * Self-contained - no cross-package imports from root boomerang-v3/src/.
 */

import { getMemorySystem } from './memory.js';
import { loadAgents } from './asset-loader.js';
import type { AgentDefinition, MemoryEntry } from './types.js';

export interface OrchestrationResult {
  agent: string;
  systemPrompt: string;
  contextPackage: ContextPackage;
  suggestions: {
    useSequentialThinking: boolean;
    runQualityGates: boolean;
  };
}

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

// Task type detection keywords
const TASK_KEYWORDS: Record<string, string[]> = {
  code: ['code', 'implement', 'create', 'add', 'build', 'make', 'fix', 'refactor'],
  test: ['test', 'testing', 'verify', 'check', 'validate', 'spec'],
  explore: ['explore', 'find', 'search', 'locate', 'discover', 'grep', 'glob'],
  review: ['review', 'analyze', 'assess', 'evaluate', 'architect'],
  write: ['doc', 'documentation', 'readme', 'md', 'write', 'update'],
  git: ['git', 'commit', 'push', 'branch', 'merge', 'pull', 'checkout', 'tag'],
  release: ['release', 'publish', 'version', 'bump', 'changelog'],
  scraper: ['scrape', 'fetch', 'web', 'search', 'research'],
};

const AGENT_FOR_TASK: Record<string, string> = {
  code: 'boomerang-coder',
  test: 'boomerang-tester',
  explore: 'boomerang-explorer',
  review: 'boomerang-architect',
  write: 'boomerang-writer',
  git: 'boomerang-git',
  release: 'boomerang-release',
  scraper: 'boomerang-scraper',
};

const COMPLEX_PATTERNS = /implement|create|design|architecture|refactor|migration|complex|multiple|stripe/i;
const THINKING_TRIGGERS = /think through|analyze|plan this|design|architecture|refactor/i;

/**
 * BoomerangOrchestrator - Pure decision layer for OpenCode integration
 * 
 * Returns context packages, NOT execution results. OpenCode executes agents natively.
 */
export class BoomerangOrchestrator {
  private agents: AgentDefinition[];

  constructor() {
    this.agents = loadAgents();
  }

  /**
   * Main orchestration entry point
   * Analyze request, query memory, build context package, return for OpenCode execution
   */
  async orchestrate(request: string): Promise<OrchestrationResult> {
    // Step 1: Query memory for relevant context
    const memories = await this.queryMemory(request);
    
    // Step 2: Detect task type
    const taskType = this.detectTaskType(request);
    
    // Step 3: Select agent
    const agent = this.selectAgent(taskType);
    
    // Step 4: Build context package
    const contextPackage = this.buildContextPackage(request, taskType, agent, memories);
    
    // Step 5: Return orchestration result for OpenCode to execute
    return {
      agent: agent.name,
      systemPrompt: agent.systemPrompt || '',
      contextPackage,
      suggestions: {
        useSequentialThinking: this.isComplexTask(request),
        runQualityGates: taskType === 'code',
      },
    };
  }

  /**
   * Query memories for relevant context
   */
  private async queryMemory(request: string): Promise<MemoryEntry[]> {
    try {
      const memorySystem = getMemorySystem();
      if (!memorySystem.isInitialized()) {
        return [];
      }
      const results = await memorySystem.search(request, { topK: 10 });
      return results.map(r => r.entry);
    } catch {
      return [];
    }
  }

  /**
   * Detect task type from request keywords
   */
  private detectTaskType(request: string): string {
    const lower = request.toLowerCase();
    
    for (const [taskType, keywords] of Object.entries(TASK_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lower.includes(keyword)) {
          return taskType;
        }
      }
    }
    
    return 'code';
  }

  /**
   * Select agent based on task type
   */
  private selectAgent(taskType: string): AgentDefinition {
    const agentName = AGENT_FOR_TASK[taskType] || 'boomerang';
    const agent = this.agents.find(a => a.name === agentName);
    
    if (agent) {
      return agent;
    }
    
    const fallback = this.agents.find(a => a.name === 'boomerang');
    return fallback || {
      name: 'boomerang',
      description: 'General purpose agent',
      systemPrompt: '',
      skills: [],
    };
  }

  /**
   * Build complete Context Package
   */
  private buildContextPackage(
    request: string,
    taskType: string,
    _agent: AgentDefinition,
    memories: MemoryEntry[]
  ): ContextPackage {
    const relevantFiles = this.extractFilePaths(memories);
    const previousDecisions = this.extractDecisions(memories);
    
    return {
      originalUserRequest: request,
      taskBackground: this.generateTaskBackground(taskType, request),
      relevantFiles,
      codeSnippets: this.extractCodeSnippets(memories),
      previousDecisions,
      expectedOutput: this.generateExpectedOutput(taskType),
      scopeBoundaries: this.generateScopeBoundaries(taskType),
      errorHandling: 'Report errors clearly with file paths and line numbers. Do not crash silently.',
    };
  }

  private extractFilePaths(memories: MemoryEntry[]): string[] {
    const paths = new Set<string>();
    for (const memory of memories) {
      if (memory.sourcePath && memory.sourcePath.startsWith('file://')) {
        paths.add(memory.sourcePath.replace('file://', ''));
      }
    }
    return Array.from(paths).slice(0, 20);
  }

  private extractDecisions(memories: MemoryEntry[]): string[] {
    const decisions: string[] = [];
    for (const memory of memories.slice(0, 5)) {
      const content = memory.text;
      if (content.includes('decided') || content.includes('chose') || content.includes('implemented')) {
        decisions.push(content.substring(0, 200));
      }
    }
    return decisions;
  }

  private extractCodeSnippets(memories: MemoryEntry[]): string[] {
    const snippets: string[] = [];
    for (const memory of memories) {
      const content = memory.text;
      const codeBlockMatch = content.match(/```[\s\S]*?```/g);
      if (codeBlockMatch) {
        snippets.push(...codeBlockMatch.slice(0, 3));
      }
    }
    return snippets.slice(0, 5);
  }

  private generateTaskBackground(taskType: string, request: string): string {
    return `Task type: ${taskType}\nUser request: ${request.substring(0, 500)}`;
  }

  private generateExpectedOutput(taskType: string): string {
    const outputs: Record<string, string> = {
      code: 'Working code with tests passing',
      test: 'Test files with coverage',
      explore: 'File paths and code locations',
      review: 'Analysis with recommendations',
      write: 'Updated documentation',
      git: 'Git operations completed',
      release: 'Published package with changelog',
      scraper: 'Gathered data and sources',
    };
    return outputs[taskType] || 'Task completed successfully';
  }

  private generateScopeBoundaries(taskType: string): { inScope: string[]; outOfScope: string[] } {
    const scopes: Record<string, { inScope: string[]; outOfScope: string[] }> = {
      code: {
        inScope: ['Implementation', 'Unit tests', 'Documentation updates'],
        outOfScope: ['Major architecture changes', 'Database migrations', 'Performance optimization'],
      },
      test: {
        inScope: ['Test files', 'Test coverage', 'Integration tests'],
        outOfScope: ['Implementation changes', 'Production deployment'],
      },
      explore: {
        inScope: ['File discovery', 'Pattern search', 'Code analysis'],
        outOfScope: ['Code modifications', 'File creation'],
      },
    };
    return scopes[taskType] || { inScope: ['Task execution'], outOfScope: ['Unrelated changes'] };
  }

  private isComplexTask(request: string): boolean {
    return COMPLEX_PATTERNS.test(request) || 
           THINKING_TRIGGERS.test(request) || 
           request.length > 500;
  }
}

/**
 * Factory function to create orchestrator
 */
export function createOrchestrator(): BoomerangOrchestrator {
  return new BoomerangOrchestrator();
}