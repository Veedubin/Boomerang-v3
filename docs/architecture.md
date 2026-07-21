# Architecture

Boomerang v3 is an **orchestration plugin for OpenCode**, not a
standalone agent execution system.

## What Boomerang is

- **Boomerang's role**: Analyse requests, query memory, select the
  appropriate agent, build a rich Context Package.
- **OpenCode's role**: Handle agent execution natively using its own
  agent spawning mechanism.
- **memini-ai's role**: Persistent memory with trust scoring, knowledge
  graph, and tiered loading.

## How it works

<!-- mermaid: dispatch-flow -->
```mermaid
flowchart TD
    subgraph Input["Input"]
        U["User Prompt"]
    end

    subgraph Orchestrator["Boomerang Orchestrator"]
        S1["Step 1: Memory Query<br/>memini-ai-dev_query_memories"]
        S2["Step 2: Thought Chain<br/>memini-ai-dev_add_thought"]
        S3["Step 3: Plan<br/>create plan or<br/>delegate to architect"]
        S4["Step 4: Delegate<br/>Task tool dispatch<br/>routing matrix<br/>parallel waves"]
        S5["Step 5: Git Check<br/>verify working tree"]
        S6["Step 6: Quality Gates<br/>lint → typecheck → test"]
        S7["Step 7: Doc Update<br/>TASKS.md / AGENTS.md<br/>DocTracker SHA-256"]
        S8["Step 8: Memory Save<br/>memini-ai-dev_add_memory"]
    end

    subgraph Sidecar["memini-ai Sidecar"]
        MEM["memini-ai MCP Server<br/>PostgreSQL + pgvector<br/>trust engine + KG<br/>tiered L0/L1/L2"]
    end

    subgraph Pool["Sub-Agent Pool"]
        ARCH["boomerang-architect<br/>design + research"]
        CODER["boomerang-coder<br/>code implementation"]
        TESTER["boomerang-tester<br/>test writing"]
        LINTER["boomerang-linter<br/>quality enforcement"]
        GIT["boomerang-git<br/>version control"]
        WRITER["boomerang-writer<br/>documentation"]
        EXPLORER["boomerang-explorer<br/>file finding"]
    end

    subgraph Output["Output"]
        R["Response to User"]
    end

    U --> S1
    S1 -->|"query"| MEM
    MEM -->|"context"| S1
    S1 --> S2
    S2 --> S3
    S3 -->|"plan ready"| S4
    S3 -->|"needs design"| ARCH
    ARCH -->|"design doc"| S3
    S4 -->|"dispatch"| CODER
    S4 -->|"dispatch"| TESTER
    S4 -->|"dispatch"| LINTER
    S4 -->|"dispatch"| GIT
    S4 -->|"dispatch"| WRITER
    S4 -->|"dispatch"| EXPLORER
    CODER -->|"result"| S5
    TESTER -->|"result"| S5
    LINTER -->|"result"| S5
    GIT -->|"result"| S5
    WRITER -->|"result"| S5
    EXPLORER -->|"result"| S5
    S5 --> S6
    S6 --> S7
    S7 --> S8
    S8 -->|"save"| MEM
    S8 --> R
```

The orchestrator is a **pure decision layer**:

- Analyses the request
- Queries memini-ai for relevant context
- Selects the appropriate agent
- Builds a Context Package
- Returns `{agent, systemPrompt, contextPackage, suggestions}` to
  OpenCode

OpenCode then spawns the selected agent natively. The agent does its
work, saves detailed results to memini-ai, and returns a thin summary
to the orchestrator.

## Orchestrator API

The `BoomerangOrchestrator` class provides:

| Method | Description |
|--------|-------------|
| `analyzeTask()` | Detect task type from request keywords |
| `selectAgent()` | Choose appropriate agent based on task type |
| `queryMemory()` | Search memini-ai for relevant context |
| `buildContextPackage()` | Create rich context for sub-agent |
| `orchestrate()` | Main entry — returns `{agent, systemPrompt, contextPackage, suggestions}` |

## Context Package system

Boomerang passes comprehensive context to sub-agents:

- Original user request (verbatim)
- Task background and constraints
- Relevant files and code snippets
- Expected output format
- Scope boundaries and escalation targets

This ensures sub-agents have everything they need to work effectively.

## Plugin hooks

OpenCode plugins support 25+ lifecycle hooks. Boomerang-v3 is already
loaded as a plugin (`@veedubin/boomerang-v3` in `opencode.json`), so
adding hooks is incremental — just export them from the existing plugin
structure.

Key hooks used or planned:

| Hook | Purpose |
|------|---------|
| `experimental.session.compacting` | Inject boomerang state before compaction (preserves task graph, slot usage, queued jobs) |
| `tool.execute.before` | Validate the mandatory routing matrix |
| `tool.execute.after` | Audit trail for tool calls |
| `session.created` | Session initialisation |
| `file.edited` | Track documentation changes via DocTracker |

> The `experimental.session.compacting` hook is the key to solving
> context loss: it fires before the LLM compaction prompt is generated,
> letting us inject boomerang state that survives context pruning.

See [`docs/CONFIG_RESEARCH.md`](CONFIG_RESEARCH.md) for the full
feature evaluation of plugin hooks, routing validation, and audit
trail.

## Compaction integration

When OpenCode is about to compact the session context, the
`experimental.session.compacting` hook fires. Boomerang uses this to:

1. Snapshot the current task graph, slot usage, and queued jobs.
2. Inject a state summary that survives the compaction prompt.
3. Restore the snapshot on `session.compacted`.

This directly addresses the context preservation problem that plagued
earlier versions of Boomerang.

## Project structure

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
├── tests/                    # Test suite
├── AGENTS.md                 # Agent roster
├── README.md                 # This file
└── package.json              # @veedubin/boomerang-v3
```