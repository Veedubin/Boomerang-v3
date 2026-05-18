# Boomerang Agent Roster

## Core Agents

> **Note**: Models are configurable. Use `install-agents.js --primary=<model> --secondary=<model>` to customize.

| Agent | Skill | Default Model | Role |
|-------|-------|-------|------|
| **boomerang** | boomerang-orchestrator | Kimi K2.6 | 🎯 **Orchestrator** — Plans, coordinates, provides intelligent routing |
| **boomerang-coder** | boomerang-coder | MiniMax M2.7 | 💻 **Fast code generation** — Write and modify code efficiently |
| **boomerang-architect** | boomerang-architect | Kimi K2.6 | 🏗️ **Design decisions** — Trade-off analysis and architecture |
| **boomerang-explorer** | boomerang-explorer | MiniMax M2.7 | 🔍 **Codebase exploration** — Find files by name/glob |
| **boomerang-tester** | boomerang-tester | MiniMax M2.7 | 🧪 **Testing specialist** — Unit/integration tests, verification |
| **boomerang-linter** | boomerang-linter | MiniMax M2.7 | ✅ **Quality enforcement** — Lint, format, style consistency |
| **boomerang-git** | boomerang-git | MiniMax M2.7 | 📦 **Version control** — Commits, branches, history discipline |
| **boomerang-writer** | boomerang-writer | Kimi K2.6 | 📝 **Documentation** — Markdown writing and documentation |
| **boomerang-scraper** | boomerang-scraper | MiniMax M2.7 | 🌐 **Web scraping** — Research and information gathering |
| **boomerang-release** | boomerang-release | MiniMax M2.7 | 🚀 **Release automation** — Version bump, changelog, publish |
| **researcher** | researcher | MiniMax M2.7 | 🌐 **Web research** — Search, fetch, and synthesize online information |
| **mcp-specialist** | mcp-specialist | MiniMax M2.7 | 🔌 **MCP Protocol** — Tool design, server debug |

| Skill | Purpose | Model |
|-------|---------|-------|
| **boomerang-init** | Initialize and personalize agents for a project | Kimi K2.6 |
| **boomerang-handoff** | Wrap-up session. Updates docs, saves context | Kimi K2.6 |

## Agent Selection Guide

| Task Type | → Primary Agent | Model |
|-----------|------------------|-------|
| Complex planning / orchestration | `boomerang` | Kimi K2.6 |
| Architecture / design decisions | `boomerang-architect` | Kimi K2.6 |
| Documentation writing | `boomerang-writer` | Kimi K2.6 |
| Session initialization | `boomerang-init` | Kimi K2.6 |
| Session wrap-up / handoff | `boomerang-handoff` | Kimi K2.6 |
| Fast code generation / bug fixes | `boomerang-coder` | MiniMax M2.7 |
| Code exploration / finding files | `boomerang-explorer` | MiniMax M2.7 |
| Writing / running tests | `boomerang-tester` | MiniMax M2.7 |
| Linting / formatting | `boomerang-linter` | MiniMax M2.7 |
| Git operations | `boomerang-git` | MiniMax M2.7 |
| Web research / scraping | `boomerang-scraper` | MiniMax M2.7 |
| MCP tool design / server debug | `mcp-specialist` | MiniMax M2.7 |
| Release automation | `boomerang-release` | MiniMax M2.7 |

### Orchestrator Permissions (v3.0.0)

The orchestrator provides **intelligent routing and context building** — it does not execute agents directly.

**Orchestrator Does:**
- Analyze request and detect task type
- Query memini-ai for relevant context
- Select appropriate agent based on task
- Build rich Context Package with all necessary information
- Return `{agent, systemPrompt, contextPackage, suggestions}` to OpenCode

**Orchestrator Delegates:**
- Agent execution → OpenCode (native)
- Multi-file changes → sub-agents
- Complex implementation → boomerang-coder
- Architecture decisions → boomerang-architect

**Decision Threshold:**
```
Task Size ≤ 1 file AND ≤ 20 lines AND deterministic
    → Orchestrator handles directly

Task Size > 1 file OR > 20 lines OR needs analysis
    → Delegate to appropriate sub-agent
```

### Architect Reasoning Level

The `boomerang-architect` agent uses **highest reasoning level** for Kimi K2.6 when creating implementation plans. The plan is handed back to the orchestrator as a "ready-to-run game plan" for dispatching coders, testers, etc.

## Protocol (MANDATORY)

All agents **MUST** follow the **8-Step Boomerang Protocol** — enforcement is **MANDATORY**.

### 8-Step Protocol (MANDATORY)

1. **Query Memory** — `memini-ai-dev_query_memories` FIRST
2. **Think** — `sequential-thinking_sequentialthinking` for complex tasks
3. **Plan** — Create/refine implementation plan (MANDATORY unless user explicitly waives)
4. **Delegate** — OpenCode executes selected agent with Context Package
5. **Git Check** — Verify working tree state before code changes
6. **Quality Gates** — Lint → Typecheck → Test
7. **Update Docs & Todos** — Update TASKS.md, todo list, AGENTS.md as needed
8. **Save Memory** — `memini-ai-dev_add_memory` with project tag

### Planning Enforcement

Planning is MANDATORY unless user explicitly waives with phrases like:
- "skip planning"
- "just do it"
- "/boomerang-handoff"
- "do a handoff"
- "no plan needed"

Simple tasks (handoff, status checks, single-file docs) may skip planning.
Build/create/implement tasks ALWAYS require planning.

### Context Passing

The orchestrator builds a complete Context Package with:
1. Original User Request (verbatim)
2. Task Background
3. Relevant Files
4. Code Snippets
5. Previous Decisions & Constraints
6. Expected Output Format
7. Scope Boundaries (IN vs OUT of scope)
8. Error Handling

### memini-ai Hub
- Query memini-ai BEFORE answering user
- Save to memini-ai AFTER answering user
- Pass context DIRECTLY to sub-agents (don't tell them to query memory)
- Sub-agents save detailed work to memory, return thin summaries

## Documentation Maintenance (Encouraged)

After EVERY session interaction, consider updating:

1. **TASKS.md** — Mark done, add new, remove outdated
2. **Todo List** — Mark completed, remove old, add new
3. **AGENTS.md** — Update if agent changes made
4. **README.md** — Update if user-facing changes
5. **HANDOFF.md** — Update at session end

> **Note**: Unlike previous versions, documentation updates are **MANDATORY** at handoff.

### memini-ai Integration Architecture (v3.0.0)

Boomerang v3 uses **memini-ai** for memory — a Python-based semantic memory server with trust scoring, knowledge graph, and tiered loading.

| Integration | Description |
|-------------|-------------|
| **Built-in** | Direct memini-ai integration via Python subprocess |
| **MCP (External)** | Standalone MCP server for non-boomerang users |

#### How memini-ai Memory Works

- memini-ai is a Python FastMCP server with PostgreSQL/pgvector backend
- Boomerang communicates via MCP protocol to memini-ai-dev tools
- All memory operations are async via MCP tool calls
- Trust scoring, knowledge graph, and tiered loading are built-in features

### Memory Operations (via MCP)

All agents SHOULD:
1. **Query memory FIRST** — `memini-ai-dev_query_memories` before work
2. **Use sequential-thinking** — For complex tasks
3. **Save results** — `memini-ai-dev_add_memory` when complete

### Trust-Weighted Memory

memini-ai uses a trust engine where every memory starts at trust=0.5 and is adjusted based on agent feedback:

| Signal | Trust Adjustment |
|--------|------------------|
| `agent_used` | +0.05 |
| `user_confirmed` | +0.10 |
| `agent_ignored` | -0.05 |
| `user_corrected` | -0.10 |

### Memory Graph

memini-ai tracks relationships between memories:

| Relationship | Description |
|-------------|-------------|
| `SUPERSEDES` | New memory replaces old one |
| `RELATED_TO` | Memories are semantically related |
| `CONTRADICTS` | Memories conflict |
| `DERIVED_FROM` | Memory was derived from another |

### Tiered Memory Architecture

memini-ai supports tiered memory loading for efficient context use:

| Tier | Description | Use Case |
|------|-------------|----------|
| **L0 Summary** | ~100 tokens, high-trust memories only | Session start |
| **L1 Key Decisions** | ~2K tokens, trust ≥ 0.8 | Planning |
| **L2 Full Context** | All memories | Deep research |

#### When Saving:
- **Routine work** (logs, quick fixes, explorations): Use standard `memini-ai-dev_add_memory`
- **High-value work** (architectural decisions, session summaries, verified successes): Use `memini-ai-dev_add_memory` with a descriptive `project` tag in metadata

#### When Searching:
- Default searches use the configured strategy automatically
- For explicit control: `memini-ai-dev_query_memories` with `strategy` parameter (`tiered`, `vector_only`, or `text_only`)

### Knowledge Graph Integration

memini-ai includes a knowledge graph for tracking entities and relationships:

| Tool | Purpose |
|------|---------|
| `memini-ai-dev_query_kg` | Execute formal KG queries |
| `memini-ai-dev_extract_entities` | Extract entities from a memory |
| `memini-ai-dev_get_entity_graph` | Get all connections for an entity |
| `memini-ai-dev_get_inference_chain` | Find inference paths between entities |
| `memini-ai-dev_search_entities` | Search for entities by name |

## Project-Specific Context

This is Boomerang v3.0.0 — an orchestration plugin for OpenCode that provides intelligent routing and context, using memini-ai for memory with trust scoring, knowledge graph, and tiered loading.

## Agent Governance Rules (v3.0.0)

> **⚠️ CODE-LEVEL ENFORCED** — These rules are not optional guidelines.

### Research Ownership
- **boomerang-architect** owns ALL research tasks (web searches, code analysis, documentation review)
- boomerang-explorer is **file-finding only** - no pattern analysis or code research
- **memini-ai-dev_search_project** is the primary research tool for codebase investigation

### Orchestrator Delegation Rules
1. Research tasks → `boomerang-architect` (NOT explorer)
2. File finding → `boomerang-explorer` (only for glob/find operations)
3. Code implementation → `boomerang-coder`
4. Never delegate research to explorer - architect handles it

### Agent Scope Boundaries

| Agent | Scope |
|-------|-------|
| boomerang-explorer | Find files by name/glob ONLY |
| boomerang-architect | Design + Research + Code analysis |
| boomerang-coder | Code implementation |
| boomerang-tester | Test writing |
| boomerang-linter | Quality enforcement |

### Why This Matters
- Prevents duplicate work (explorer finds file, architect analyzes)
- Ensures proper context for design decisions
- Uses memini-ai search for efficient research

## Protocol Advisor v3.0.0

> **BREAKING CHANGE**: The Boomerang Protocol is now **MANDATORY** — it enforces all 8 steps and blocks execution if required steps are missing.

### Architecture: Mandatory State Machine

The protocol is implemented as a **mandatory state machine with enforcement at each step**:

```
IDLE → MEMORY_QUERY → SEQUENTIAL_THINK → PLAN → DELEGATE → GIT_CHECK → QUALITY_GATES → DOC_UPDATE → MEMORY_SAVE → COMPLETE
```

| Component | Purpose |
|-----------|---------|
| **ProtocolStateMachine** | Tracks state transitions for logging |
| **ProtocolAdvisor** | Enforces steps and blocks execution if required steps are missing |
| **TaskRunner** | Prompt builder only (no subprocess execution) |
| **DocTracker** | Tracks documentation changes via SHA-256 hash comparison |

### Strictness Levels (Enforced)

| Level | Behavior |
|-------|----------|
| **lenient** | Log suggestions, auto-fix logged |
| **standard** | Log warnings and suggestions (default) |
| **strict** | BLOCK execution if required steps are missing |

**Important**: v3.0.0 **blocks execution** if mandatory steps are missing in strict mode.

### 8-Step Mandatory Protocol

1. **MEMORY_QUERY** — MUST call `memini-ai-dev_query_memories` first
2. **SEQUENTIAL_THINK** — MUST call `sequential-thinking_sequentialthinking` for complex tasks
3. **PLAN** — MUST create plan or delegate to architect for build tasks
4. **DELEGATE** — OpenCode handles agent execution
5. **GIT_CHECK** — MUST verify working tree state before code changes
6. **QUALITY_GATES** — MUST run lint/typecheck/test before completion
7. **DOC_UPDATE** — Track via DocTracker, update at handoff
8. **MEMORY_SAVE** — MUST save to memory when complete

### Enforcement Matrix

| Step | Requirement | Waiver Phrase |
|------|-------------|---------------|
| 1. Memory Query | MUST query memory first | None (always required) |
| 2. Sequential Thinking | MUST think for complex tasks | None (always required for complex) |
| 3. Planning | MUST plan or delegate to architect | "skip planning", "just do it", "no plan needed" |
| 4. Delegate | OpenCode executes | None |
| 5. Git Check | MUST verify working tree | "git is fine" |
| 6. Quality Gates | MUST run lint/typecheck/test | "skip tests", "skip gates" |
| 7. Doc Update | MUST update documentation | "no docs needed" |
| 8. Memory Save | MUST save to memory | None (always required) |

### Waiver Phrases (Escape Hatches)

| Phrase | Effect |
|--------|--------|
| `skip planning` | Skip planning for this turn |
| `just do it` | Skip planning and execute immediately |
| `no plan needed` | Skip planning for simple tasks |
| `skip tests` | Skip running tests |
| `skip gates` | Skip quality gates |
| `git is fine` | Skip git check |
| `--force` | Skip all checks (emergency) |
| `no docs needed` | Skip documentation update |

### memini-ai MCP Tools Available

| Tool | Purpose |
|------|---------|
| `memini-ai-dev_query_memories` | Semantic search over memories |
| `memini-ai-dev_add_memory` | Store a new memory entry |
| `memini-ai-dev_search_project` | Search indexed project files |
| `memini-ai-dev_index_project` | Trigger project indexing |
| `memini-ai-dev_get_file_contents` | Reconstruct file from indexed chunks |
| `memini-ai-dev_get_status` | Check memini-ai server status |
| `memini-ai-dev_query_kg` | Query knowledge graph |
| `memini-ai-dev_extract_entities` | Extract entities from memory |
| `memini-ai-dev_get_entity_graph` | Get entity connections |
| `memini-ai-dev_get_trust_score` | Get memory trust score |
| `memini-ai-dev_adjust_trust` | Adjust memory trust |
| `memini-ai-dev_find_contradictions` | Find contradictory memories |

---

## Review Notes

- **2026-05-18**: v3.0.0 RELEASED — memini-ai integration: Trust engine, knowledge graph, tiered loading. PostgreSQL with pgvector backend. 645 tests passing in memini-ai.
- **2026-05-06**: v4.1.0 (boomerang-v2) — Protocol enforcement: MANDATORY. Parallel agent launching.
- **2026-05-03**: v4.0.0 (boomerang-v2) — Orchestrator as pure decision layer, OpenCode handles execution.