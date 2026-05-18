# Boomerang v3.0.0

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![OpenCode Plugin](https://img.shields.io/badge/OpenCode-Plugin-ff6b35?style=flat-square)](https://opencode.ai)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square)](https://www.typescriptlang.org/)
[![v3.0.0](https://img.shields.io/badge/v3.0.0-memini--ai-2ecc71?style=flat-square)](https://github.com/Veedubin/opencode-boomerang/releases/tag/plugin-v3.0.0)

*Intelligent multi-agent coordination for OpenCode with memini-ai memory.*

---

## v3.0.0 Highlights

> **NEW: memini-ai Integration** — Boomerang v3 uses memini-ai for memory, replacing Super-Memory-TS. memini-ai is a Python-based semantic memory server with PostgreSQL/pgvector backend.

| Feature | Description |
|---------|-------------|
| **Trust-Weighted Memory** | Every memory has a trust score (0.0-1.0), adjusted by agent feedback |
| **Memory Graph** | Track relationships (SUPERSEDES, RELATED_TO, CONTRADICTS, DERIVED_FROM) |
| **Knowledge Graph** | Entity extraction, inference chains, semantic relationships |
| **Tiered Loading** | L0/L1/L2 summaries for efficient context loading |
| **Contradiction Detection** | Find and resolve conflicting memories |
| **PostgreSQL + pgvector** | Production-grade vector storage with streaming diskANN |

---

## Features

- **Trust-weighted memory context** — Memories have trust scores adjusted by usage
- **Memory graph for decision tracking** — Track relationships between memories
- **Tiered loading (L0/L1/L2)** — Efficient context abstraction
- **Contradiction detection** — Find and resolve conflicting memories
- **Knowledge graph integration** — Entity extraction and inference
- **Python-based memini-ai** — Modern memory server with FastMCP

---

## Requirements

- **Node.js** 18+
- **Python** 3.11+ (for memini-ai)
- **PostgreSQL** with pgvector (or Qdrant as fallback)

### Optional: Live Visualization

memini-ai includes a live D3.js visualization for the knowledge graph:

```bash
cd memini-ai-dev
export MEMINI_DB_URL="postgresql://postgres:password@localhost:5432/postgres"
python -m uvicorn memini_ai.api.visualization:create_app --factory True --host 0.0.0.0 --port 8000
```

Then open `http://localhost:8000` for the interactive graph visualization.

---

## Installation

```bash
npm install @veedubin/boomerang-v3
```

### Configuration

Add to your `.opencode/opencode.json`:

```json
{
  "plugin": ["@veedubin/boomerang-v3"],
  "mcp": {
    "sequential-thinking": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-sequential-thinking"],
      "enabled": true
    },
    "memini-ai": {
      "type": "stdio",
      "command": ["python", "-m", "memini_ai.server"],
      "env": {
        "MEMINI_DB_URL": "postgresql://postgres:password@localhost:5432/postgres",
        "MEMINI_PROJECT_ID": "my-project"
      }
    }
  }
}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MEMINI_DB_URL` | PostgreSQL connection URL | `postgresql://postgres:password@localhost:5432/postgres` |
| `MEMINI_PROJECT_ID` | Project namespace | auto-generated |
| `MEMINI_EMBEDDING_DIM` | 1024 or 384 | 1024 |
| `MEMINI_DEVICE` | auto, gpu, cpu | auto |
| `MEMINI_TRUST_ENGINE` | Enable trust scoring | false |
| `MEMINI_MEMORY_GRAPH` | Enable memory graph | false |
| `MEMINI_KG_ENABLED` | Enable knowledge graph | false |

---

## Quick Start with Docker Compose

### Start PostgreSQL with pgvector

```bash
docker run -d --name postgres-test \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  timescale/timescaledb:latest-pg15
```

### Start memini-ai

```bash
cd memini-ai-dev
export MEMINI_DB_URL="postgresql://postgres:password@localhost:5432/postgres"
python -m memini_ai.server
```

### Run Boomerang

```bash
npm run build
npm run typecheck
npm run lint
npx vitest run
```

---

## Architecture

### What Boomerang Is

**Boomerang is an orchestration plugin for OpenCode, not a standalone agent execution system.**

- **Boomerang's role**: Analyze requests, query memory, select appropriate agent, build rich Context Package
- **OpenCode's role**: Handle agent execution natively using its own agent spawning mechanism
- **memini-ai's role**: Persistent memory with trust scoring, knowledge graph, and tiered loading

### How It Works

```
User Request
      │
      ▼
┌─────────────────┐
│  Boomerang      │  ← Pure decision layer
│  Orchestrator    │     - Analyzes request
│                  │     - Queries memini-ai
│                  │     - Selects agent
│                  │     - Builds Context Package
└─────────────────┘
      │
      ▼ (Context Package returned to OpenCode)
┌─────────────────┐
│  OpenCode       │  ← Native agent execution
│  Agent Runner   │     - Executes selected agent
│                  │     - Handles lifecycle
└─────────────────┘
      │
      ▼ (Memory operations via MCP)
┌─────────────────┐
│  memini-ai      │  ← Memory server
│  (Python)       │     - Trust scoring
│                  │     - Knowledge graph
│                  │     - Tiered loading
└─────────────────┘
```

### Orchestrator (Pure Decision Layer)

The `BoomerangOrchestrator` class provides:

| Method | Description |
|--------|-------------|
| `analyzeTask()` | Detect task type from request keywords |
| `selectAgent()` | Choose appropriate agent based on task type |
| `queryMemory()` | Search memini-ai for relevant context |
| `buildContextPackage()` | Create rich context for sub-agent |
| `orchestrate()` | Main entry — returns `{agent, systemPrompt, contextPackage, suggestions}` |

### Context Package System

Boomerang passes comprehensive context to sub-agents:
- Original user request (verbatim)
- Task background and constraints
- Relevant files and code snippets
- Expected output format
- Scope boundaries and escalation targets

This ensures sub-agents have everything they need to work effectively.

### memini-ai Hub

memini-ai is the central knowledge base:
- **Query before responding** — Orchestrator checks memory for relevant context
- **Save after completing** — Agents save detailed work to memory
- **Thin responses** — Sub-agents return concise summaries + memory references
- **Thick memory** — Full details stored for future retrieval with trust scoring

---

## Memory System

### Trust Engine

Every memory starts at trust=0.5 and is adjusted based on feedback:

| Signal | Trust Adjustment |
|--------|------------------|
| `agent_used` | +0.05 |
| `user_confirmed` | +0.10 |
| `agent_ignored` | -0.05 |
| `user_corrected` | -0.10 |

### Memory Graph

Track relationships between memories:

| Relationship | Description |
|-------------|-------------|
| `SUPERSEDES` | New memory replaces old one |
| `RELATED_TO` | Memories are semantically related |
| `CONTRADICTS` | Memories conflict |
| `DERIVED_FROM` | Memory was derived from another |

### Tiered Loading

| Tier | Description | Use Case |
|------|-------------|----------|
| **L0 Summary** | ~100 tokens, high-trust memories only | Session start |
| **L1 Key Decisions** | ~2K tokens, trust ≥ 0.8 | Planning |
| **L2 Full Context** | All memories | Deep research |

### Knowledge Graph

memini-ai tracks entities and relationships:

| Tool | Purpose |
|------|---------|
| `query_kg` | Execute formal KG queries |
| `extract_entities` | Extract entities from a memory |
| `get_entity_graph` | Get all connections for an entity |
| `get_inference_chain` | Find inference paths between entities |

---

## Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Build TypeScript to `dist/` |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Run ESLint |
| `npx vitest run` | Run test suite |

---

## Project Structure

```
boomerang-v3/
├── src/
│   ├── index.ts              # Plugin interface
│   ├── orchestrator.ts       # Pure decision layer
│   ├── protocol/             # ProtocolAdvisor (mandatory enforcement)
│   ├── execution/            # TaskRunner (prompt builder only)
│   └── agents/               # Agent definitions
├── .opencode/
│   └── skills/               # Skill definitions
├── packages/
│   └── opencode-plugin/      # OpenCode plugin package
├── tests/                   # Test suite
├── AGENTS.md                # Agent roster
├── README.md                # This file
└── package.json             # @veedubin/boomerang-v3
```

---

## Release History

- **v3.0.0** — memini-ai integration: Trust engine, knowledge graph, tiered loading, PostgreSQL/pgvector
- **v4.0.0** (boomerang-v2) — Orchestrator as pure decision layer, OpenCode handles execution
- **v3.0.0** (boomerang-v2) — LanceDB → Qdrant migration
- **v2.0.0** (boomerang-v2) — First stable with built-in memory

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">

**Built with 🚀 by [Veedubin](https://github.com/Veedubin)**

*Your AI development team, on demand.*

</div>