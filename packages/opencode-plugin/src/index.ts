/**
 * Boomerang v3.0.0 - OpenCode Plugin Interface
 * 
 * Self-contained plugin that integrates with OpenCode's plugin system.
 * Uses memini-ai for memory operations.
 */

import { createOrchestrator } from './orchestrator.js';
import { loadAgents, loadSkills, listAvailableAgents, listAvailableSkills } from './asset-loader.js';
import { getMemorySystem } from './memory.js';
import { runAllQualityGates, DEFAULT_QUALITY_GATES } from './quality-gates.js';
import type { BoomerangConfig, PluginContext } from './types.js';

export { createOrchestrator } from './orchestrator.js';
export type { OrchestrationResult, ContextPackage } from './orchestrator.js';

const VERSION = '3.0.0';

// Default configuration
const DEFAULT_CONFIG: BoomerangConfig = {
  memoryEnabled: true,
  qualityGates: {
    lint: true,
    typecheck: true,
    test: true,
  },
};

// memini-ai configuration
const MEMINI_SERVER_URL = process.env.MEMINI_SERVER_URL || 'http://localhost:8000';

/**
 * Plugin registration with OpenCode
 */
export function register(registry: PluginRegistry): void {
  // Load and register agents
  const agents = loadAgents();
  for (const agent of agents) {
    registry.registerAgent(agent.name, {
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.systemPrompt || '',
      skills: agent.skills,
    });
  }

  // Load and register skills
  const skills = loadSkills();
  for (const skill of skills) {
    registry.registerSkill(skill.name, {
      name: skill.name,
      description: skill.description,
      instructions: skill.instructions,
    });
  }

  // Register commands
  registry.registerCommand('boomerang', handleBoomerangCommand);
  registry.registerCommand('/handoff', handleHandoffCommand);
}

export interface PluginRegistry {
  registerCommand(name: string, handler: CommandHandler): void;
  registerAgent(name: string, definition: AgentDefinition): void;
  registerSkill(name: string, definition: SkillDefinition): void;
}

interface AgentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  skills: string[];
}

interface SkillDefinition {
  name: string;
  description: string;
  instructions: string;
}

type CommandHandler = (context: PluginContext) => Promise<void>;

/**
 * Plugin activation - initialize memory and prepare for execution
 */
export async function activate(context: PluginContext): Promise<void> {
  // Initialize memory system
  const memorySystem = getMemorySystem();
  try {
    await memorySystem.initialize(MEMINI_SERVER_URL);
    console.log('[boomerang] Memory system initialized');
  } catch (error) {
    console.warn('[boomerang] Memory initialization failed (fallback mode):', error instanceof Error ? error.message : error);
  }

  // Handle commands
  const command = context.args[0];
  if (command === 'boomerang' || command === undefined) {
    await handleBoomerangCommand(context);
  } else if (command === '/handoff') {
    await handleHandoffCommand(context);
  }
}

/**
 * Handle boomerang command - analyze request and prepare context for OpenCode execution
 */
async function handleBoomerangCommand(context: PluginContext): Promise<void> {
  const request = context.args.slice(1).join(' ') || 'help';

  if (request === 'help') {
    console.log(`
Boomerang v${VERSION} - Multi-Agent Orchestration Plugin for OpenCode

Commands:
  boomerang <task>    - Orchestrate a task with appropriate agent
  boomerang /handoff  - End session and save context

Available agents:
  - boomerang: General purpose orchestrator
  - boomerang-coder: Fast code generation
  - boomerang-tester: Testing specialist
  - boomerang-explorer: Codebase exploration
  - boomerang-architect: Architecture and design
  - boomerang-writer: Documentation
  - boomerang-git: Version control
  - boomerang-linter: Quality enforcement
  - boomerang-release: Release automation
  - boomerang-scraper: Web research

Examples:
  boomerang implement user authentication
  boomerang test payment processing
  boomerang explore find files with API endpoints
    `);
    return;
  }

  try {
    const orchestrator = createOrchestrator();
    const result = await orchestrator.orchestrate(request);

    console.log('[boomerang] Orchestration complete');
    console.log(`[boomerang] Agent: ${result.agent}`);
    console.log(`[boomerang] Context Package built with ${result.contextPackage.relevantFiles.length} relevant files`);
    console.log('[boomerang] Suggestions:', result.suggestions);
  } catch (error) {
    console.error('[boomerang] Orchestration failed:', error instanceof Error ? error.message : error);
  }
}

/**
 * Handle handoff command - save context and prepare for session end
 */
async function handleHandoffCommand(context: PluginContext): Promise<void> {
  console.log('[boomerang] Starting session handoff...');

  try {
    const memorySystem = getMemorySystem();
    
    if (memorySystem.isInitialized()) {
      const summary = `Session handoff completed at ${new Date().toISOString()}`;
      await memorySystem.saveContext(context.cwd, summary);
      console.log('[boomerang] Context saved to memory');
    }

    console.log('[boomerang] Handoff complete. Session summary saved.');
  } catch (error) {
    console.error('[boomerang] Handoff failed:', error instanceof Error ? error.message : error);
  }
}

// Export BoomerangPlugin as default for OpenCode
export const BoomerangPlugin = async (ctx: PluginContext): Promise<unknown> => {
  const config = DEFAULT_CONFIG;
  
  try {
    (ctx.client as { app?: { log?: (msg: string) => void } }).app?.log?.('Boomerang Protocol v3.0.0 activated');
  } catch {
    // Logging not available
  }

  // Initialize memory system
  try {
    const memorySystem = getMemorySystem();
    await memorySystem.initialize(MEMINI_SERVER_URL);
    (ctx.client as { app?: { log?: (msg: string) => void } }).app?.log?.('memini-ai connected');
  } catch (err) {
    console.error('Failed to initialize memory:', err);
  }

  // Log bundled assets
  console.log(`Loaded ${listAvailableAgents().length} agents`);
  console.log(`Loaded ${listAvailableSkills().length} skills`);

  return {
    tool: {
      boomerang_status: {
        description: 'Check Boomerang Protocol status and configuration',
        inputSchema: {},
        async execute() {
          return `Boomerang Protocol v${VERSION} Status:
- Memory Enabled: ${config.memoryEnabled}
- Quality Gates: lint=${config.qualityGates.lint}, typecheck=${config.qualityGates.typecheck}, test=${config.qualityGates.test}
- Agents Loaded: ${listAvailableAgents().length}
- Skills Loaded: ${listAvailableSkills().length}`;
        },
      },

      boomerang_orchestrate: {
        description: 'Orchestrate a task - analyze request, query memory, build context package',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'The task or request to orchestrate' },
          },
          required: ['prompt'],
        },
        async execute(args: { prompt: string }) {
          try {
            const orchestrator = createOrchestrator();
            const result = await orchestrator.orchestrate(args.prompt);
            
            return JSON.stringify({
              agent: result.agent,
              systemPrompt: result.systemPrompt,
              contextPackage: result.contextPackage,
              suggestions: result.suggestions,
            }, null, 2);
          } catch (error) {
            return `Orchestration failed: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
      },

      boomerang_quality_gates: {
        description: 'Run quality gates: lint, typecheck, and tests',
        inputSchema: {},
        async execute() {
          const result = await runAllQualityGates(DEFAULT_QUALITY_GATES);
          return result.summary;
        },
      },

      boomerang_memory_search: {
        description: 'Search memini-ai for relevant context',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            limit: { type: 'number', description: 'Max results' },
          },
          required: ['query'],
        },
        async execute(args: { query: string; limit?: number }) {
          try {
            const memorySystem = getMemorySystem();
            const results = await memorySystem.search(args.query, { topK: args.limit || 10 });
            
            if (results.length === 0) {
              return 'No relevant memories found.';
            }
            
            return results
              .map(r => `- [${r.score.toFixed(2)}] ${r.entry.text.substring(0, 200)}`)
              .join('\n');
          } catch (error) {
            return `Memory search failed: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
      },

      boomerang_memory_add: {
        description: 'Save context to memini-ai',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'Content to save' },
            sourceType: { type: 'string', description: 'Source type (default: manual)' },
          },
          required: ['content'],
        },
        async execute(args: { content: string; sourceType?: string }) {
          try {
            const memorySystem = getMemorySystem();
            const entry = await memorySystem.addMemory({
              text: args.content,
              sourceType: (args.sourceType as 'session' | 'file' | 'web' | 'boomerang' | 'project') || 'manual',
              sourcePath: '',
            });
            return `Saved memory (ID: ${entry.id})`;
          } catch (error) {
            return `Failed to save: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
      },

      boomerang_get_trust_score: {
        description: 'Get trust score for a memory entry',
        inputSchema: {
          type: 'object',
          properties: {
            memory_id: { type: 'string', description: 'Memory ID' },
          },
          required: ['memory_id'],
        },
        async execute(args: { memory_id: string }) {
          try {
            const memorySystem = getMemorySystem();
            const score = await memorySystem.getTrustScore(args.memory_id);
            if (score === null) {
              return 'Memory not found or trust score unavailable';
            }
            return `Trust score: ${score.toFixed(3)}`;
          } catch (error) {
            return `Failed to get trust score: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
      },
    },

    event: async ({ event }: { event: unknown }) => {
      const eventType = (event as { type?: string }).type;
      if (eventType === 'session.created') {
        try {
          (ctx.client as { app?: { log?: (msg: string) => void } }).app?.log?.('Session created - Boomerang ready');
        } catch {}
      }
      if (eventType === 'session.idle') {
        try {
          (ctx.client as { app?: { log?: (msg: string) => void } }).app?.log?.('Session idle - Boomerang orchestration available');
        } catch {}
      }
    },

    config: async (cfg: Record<string, unknown>) => {
      cfg.boomerang = config;
    },

    cleanup: async () => {
      // Cleanup if needed
    },
  };
};

export default BoomerangPlugin;