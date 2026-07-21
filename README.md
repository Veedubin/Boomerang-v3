# Boomerang: Intelligent Multi-Agent Orchestration for OpenCode

[![npm version](https://img.shields.io/npm/v/@veedubin/boomerang-v3.svg)](https://www.npmjs.com/package/@veedubin/boomerang-v3)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![OpenCode Plugin](https://img.shields.io/badge/OpenCode-Plugin-ff6b35?style=flat-square)](https://opencode.ai)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square)](https://www.typescriptlang.org/)

Boomerang is an **intelligent multi-agent orchestration plugin** for OpenCode. It acts as a routing brain that:
- Picks the right specialist agent for every task
- Arms agents with trust-weighted memory and context
- Enforces an 8-step quality protocol for reliable execution
- Integrates with memini-ai for persistent, semantic memory

## What It Does

- **Intelligent Routing**: Analyzes tasks and dispatches to 13 specialist agents (coder, architect, tester, writer, etc.)
- **Trust-Weighted Memory**: Uses memini-ai to store and retrieve memories with trust scores (0.0-1.0)
- **8-Step Protocol**: Enforces mandatory steps (memory query, planning, quality gates, doc updates, etc.)
- **Parallel Execution**: Launches multiple sub-agents simultaneously for independent tasks
- **Context Packages**: Builds rich context for sub-agents (files, snippets, constraints, expectations)
- **Security**: Explicit tool allow-lists per agent (~57-73% token reduction vs wildcards)
- **Skills**: Markdown-based skills loaded at runtime for specialized workflows
- **Pre-Question Rule**: Dispatches architect to research before asking user clarifying questions

## Architecture

Boomerang-v3 implements the **orchestrator** layer in this ecosystem:

```mermaid
flowchart LR
    U[User] -->|prompt| OC[OpenCode TUI]
    OC -->|task| ORCH["Neuralgentics Orchestrator<br/>12 personas + routing matrix"]
    ORCH -->|query / save| MEM[("memini-ai<br/>FIRST-CLASS MCP<br/>registered directly in opencode.json")]
    MEM --> PG[("PostgreSQL + pgvector<br/>trust-weighted memory")]
    ORCH -->|dispatch| AG["Specialist sub-agents<br/>coder · architect · tester · writer"]
    AG -->|"long-tail tool calls"| BRK["Neuralgentics Broker<br/>catalog · access control · audit"]
    BRK --> MCP["Brokered MCP servers<br/>searxng · github · videre · ssh<br/>behind the broker · on demand"]
    AG -->|outbound HTTP| GW["Neuralgentics Gateway<br/>egress policy + audit"]
    GW --> NET["Internet / LLM APIs"]
    MEM --> WEB["Neuralgentics Web<br/>dashboards"]
    GW --> WEB
    BRK --> WEB
```
memini-ai is a **first-class** MCP server — registered directly in `opencode.json` and always loaded. Every other MCP server sits **behind the broker**: catalog-advertised, access-controlled, and brokered on demand, which keeps long-tail tool schemas out of every prompt.


[**View full architecture diagram**](https://veedubin.github.io/Boomerang-v3/architecture/)

## Quickstart

```bash
npx @veedubin/boomerang-v3 --setup
```

This bootstraps:
- 13 specialist agents (coder, architect, tester, writer, etc.)
- Skills for common workflows
- AGENTS.md with routing matrix
- opencode.json patching for memini-ai integration

**Provider Note**: Uses Ollama Cloud by default. See [docs/providers.md](https://github.com/Veedubin/Boomerang-v3/blob/main/docs/providers.md) for alternatives (local Ollama, Docker Model Runner, OpenAI, Anthropic, Google, OpenRouter).

## Features

### Orchestration
- **Routing Matrix**: Code-enforced rules for agent selection (e.g., code → `boomerang-coder`, research → `boomerang-architect`)
- **13 Specialist Agents**: coder, architect, tester, writer, git, explorer, scraper, release, linter, mcp-specialist, researcher, agent-builder, handoff
- **Parallel Dispatch**: Uses Kahn's algorithm for dependency-free parallel execution
- **Context Packages**: Rich context for sub-agents (files, snippets, constraints, expectations)

### Protocol
- **8-Step Mandatory State Machine**: Memory query → Sequential think → Plan → Delegate → Git check → Quality gates → Doc update → Memory save
- **Strictness Levels**: lenient (log suggestions), standard (log warnings), strict (block execution)
- **Waiver Phrases**: `skip planning`, `just do it`, `no plan needed`, `skip tests`, `git is fine`, `--force`, `no docs needed`
- **Pre-Question Rule**: Dispatches architect to research before asking user clarifying questions

### Memory
- **memini-ai Integration**: MCP stdio interface to Python semantic memory server
- **Trust Engine**: Memories start at trust=0.5, adjusted by feedback (`agent_used` +0.05, `user_corrected` -0.10)
- **Memory Graph**: Relationships (SUPERSEDES, RELATED_TO, CONTRADICTS, DERIVED_FROM)
- **Tiered Loading**: L0 (~100 tokens, high-trust), L1 (~2K tokens, key decisions), L2 (full context)
- **Contradiction Detection**: Finds and resolves conflicting memories
- **Thought Chains**: Structured reasoning traces for complex problem-solving

### Security & Permissions
- **Per-Agent Tool Allow-Lists**: No wildcards, explicit permissions for ~57-73% token reduction
- **detect-secrets CI**: Scans for API keys, passwords, tokens in commits
- **GitHub MCP**: Restricted to `boomerang-git` for remote operations (no `boomerang-release` access)

### Skills
- **Markdown Skills**: Loaded at runtime for specialized workflows (e.g., `boomerang-release`, `kanban-board-manager`)
- **Skill Self-Audit**: Detects repeated processes and formalizes them as skills
- **Pre-Compaction Extraction**: Captures context before memory compaction

## Agent Roster

| Agent | Purpose | Model (Ollama Cloud) |
|-------|---------|----------------------|
| `boomerang` | Orchestration | kimi-k2.6 |
| `boomerang-coder` | Code implementation | glm-5.2 |
| `boomerang-architect` | Design decisions | deepseek-v4-pro |
| `boomerang-tester` | Testing | deepseek-v4-flash |
| `boomerang-writer` | Documentation | mistral-large-3:675b |
| `boomerang-git` | Git operations | minimax-m3 |
| `boomerang-explorer` | File finding | deepseek-v4-flash |
| `boomerang-linter` | Linting/formatting | qwen3.5:397b |
| `boomerang-scraper` | Web scraping | qwen3.5 |
| `boomerang-release` | Release automation | minimax-m3 |
| `boomerang-agent-builder` | Skill/agent creation | glm-5.2 |
| `boomerang-init` | Session initialization | kimi-k2.6 |
| `boomerang-handoff` | Session wrap-up | kimi-k2.6 |
| `mcp-specialist` | MCP/server debug | glm-5.2 |
| `researcher` | Web research | kimi-k2.6 |

[**Full agent roster and routing rules**](https://github.com/Veedubin/Boomerang-v3/blob/main/AGENTS.md)

## Configuration

### Key `opencode.json` Settings

```json
{
  "provider": {
    "ollama": {
      "name": "Ollama Cloud",
      "api": "openai",
      "options": {
        "baseURL": "https://ollama.com/v1",
        "apiKey": "YOUR_OLLAMA_CLOUD_API_KEY"
      },
      "models": {
        "kimi-k2.6": { "name": "Kimi K2.6 (Cloud)" },
        "glm-5.2": { "name": "GLM 5.2 (Cloud)" },
        "mistral-large-3:675b": { "name": "Mistral Large 3 675B (Cloud)" }
      }
    }
  },
  "mcp": {
    "memini-ai-dev": {
      "type": "local",
      "command": ["uvx", "--from", "memini-ai-dev", "memini-ai", "--stdio"],
      "environment": {
        "MEMINI_DB_URL": "postgresql://postgres:password@localhost:5434/postgres",
        "TRUST_ENGINE": "true",
        "MEMORY_GRAPH": "true",
        "KG_ENABLED": "true",
        "TIERED_LOADING": "true",
        "THOUGHT_CHAINS": "true"
      },
      "enabled": true
    }
  }
}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MEMINI_DB_URL` | PostgreSQL connection URL | `postgresql://postgres:password@localhost:5434/postgres` |
| `MEMINI_PROJECT_ID` | Project namespace | Auto-generated |
| `TRUST_ENGINE` | Enable trust scoring | `true` |
| `MEMORY_GRAPH` | Enable memory graph | `true` |
| `KG_ENABLED` | Enable knowledge graph | `true` |
| `TIERED_LOADING` | Enable tiered loading | `true` |
| `THOUGHT_CHAINS` | Enable thought chains | `true` |

## Documentation

[**Full Documentation**](https://veedubin.github.io/Boomerang-v3/)

- [Architecture](https://veedubin.github.io/Boomerang-v3/architecture/)
- [Agent Roster](https://veedubin.github.io/Boomerang-v3/agents/)
- [Protocol](https://veedubin.github.io/Boomerang-v3/protocol/)
- [Memory System](https://veedubin.github.io/Boomerang-v3/memory/)
- [Providers](https://github.com/Veedubin/Boomerang-v3/blob/main/docs/providers.md)

## Development

```bash
npm install
npm run build    # TypeScript → dist/
npm run test     # vitest
npm run typecheck # tsc --noEmit
```

## License

MIT