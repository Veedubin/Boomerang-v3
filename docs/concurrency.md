# Concurrency

Boomerang-v3 operates under a hard constraint: **3 concurrent model
slots** on Ollama Cloud. The orchestrator (`kimi-k2.6`) consumes 1
slot continuously while inside OpenCode, leaving only **2 slots for
parallel sub-agents**. When a sub-agent attempts to spawn another
(e.g. coder → linter), the request hits the ceiling and may be queued
or rejected (HTTP 503/429).

> The full architecture analysis lives in
> [`CONCURRENCY_ARCHITECTURE.md`](CONCURRENCY_ARCHITECTURE.md). This
> page is the user-facing summary.

## Current state

```
┌─────────────────────────────────────────────────────────────────┐
│                        OpenCode IDE                             │
│  ┌──────────────┐    ┌──────────────────────────────────┐    │
│  │ Orchestrator │    │      Boomerang Plugin (TS)       │    │
│  │ kimi-k2.6    │───▶│  - Pure decision layer           │    │
│  │  (1 slot)    │    │  - Returns Context Packages      │    │
│  │  CONTINUOUS  │    │  - No execution / no queue       │    │
│  └──────────────┘    └──────────────────────────────────┘    │
│         │                                                        │
│         ▼ (OpenCode spawns agents natively)                     │
│  ┌──────────────┐    ┌──────────────┐                         │
│  │ Sub-agent 1  │    │ Sub-agent 2  │                         │
│  │ glm-5.2      │    │ devstral-2   │                         │
│  │  (1 slot)    │    │  (1 slot)    │                         │
│  └──────────────┘    └──────────────┘                         │
│       Total: 3 slots (MAXED OUT)                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (MCP stdio)
                    ┌─────────────────────┐
                    │   memini-ai-dev     │
                    │  (Python FastMCP)   │
                    │  PostgreSQL/pgvector │
                    └─────────────────────┘
```

## Pain points

1. **Orchestrator tax** — orchestrator model holds 1 slot for the
   entire session; cannot release it.
2. **No client-side limiting** — plugin doesn't enforce "max 2
   sub-agents"; OpenCode may attempt a 3rd.
3. **No retry on rejection** — plugin can't see HTTP 503/429;
   failures surface as generic errors.
4. **No timeout enforcement** — tasks can hang indefinitely, holding
   slots hostage.
5. **No cross-session state** — queue, failures, and metrics evaporate
   when OpenCode restarts.
6. **No observability** — can't see queue depth, slot utilisation, or
   failure rates.

## The four proposals

| Proposal | Description | Plugin | MCP Server | Hybrid | Web Service |
|----------|-------------|--------|------------|--------|-------------|
| **1. Orchestrator Tax** | Async job queue, orchestrator spins down | Impossible | Impossible | Impossible | Partial |
| **2. App Semaphore** | Client-side max 2 concurrent sub-agents | Logical only | Logical | Full | Full |
| **3. Exponential Backoff** | Retry on 503/429 with jitter | Task-level only | Task-level | Task-level | HTTP-level |
| **4. Aggressive Timeouts** | Hard 60s timeout, release slot | Task param | Task param | Task param | Proxy timeout |

## Recommended implementation

| Proposal | Implementation | Feasibility |
|----------|---------------|-------------|
| **1. Orchestrator Tax** | NOT possible. Orchestrator runs inside OpenCode process; we don't control model lifecycle. | N/A |
| **2. Semaphore** | Logical `maxConcurrentAgents = 2` enforced in `orchestrator.ts`. Before dispatching a 3rd agent, plugin warns and serialises. | Partial |
| **3. Backoff** | Wrap `task` execution in retry loop with exponential backoff + jitter on failure. Can't see HTTP codes, but catches task failures. | Partial |
| **4. Timeouts** | Set `timeout: 60000` on all `task` tool calls. If agent exceeds 60s, task fails, slot is released by OpenCode. | Full |

## Code changes (Phase 1)

- `src/orchestrator.ts`: Add `ConcurrencyPlanner` class
  - `maxConcurrentSlots: 2` (3 total minus 1 for orchestrator)
  - `canDispatch(agentName): boolean` — checks current slot usage
  - `dispatchWithRetry(agentName, context, retries=3)` — exponential
    backoff
  - `dispatchWithTimeout(agentName, context, timeout=60000)`
- `src/execution/task-runner.ts`: Add retry decorator
- `src/types.ts`: Add `ConcurrencyConfig` interface

## Pros and cons

**Pros:**

- Minimal change to existing codebase
- No new infrastructure
- Fully contained within TypeScript plugin
- Plugin stays lightweight

**Cons:**

- Doesn't solve the fundamental "orchestrator tax" problem
- Can't see HTTP status codes for true backpressure
- No persistence across OpenCode restarts
- No observability dashboard
- Still limited to 2 parallel sub-agents
- Quality gates (lint, test) may still fail due to slot exhaustion

**Effort estimate:** 1-2 weeks.

**Recommended phase:** Phase 1 (Immediate).

For the full feasibility matrix, Options A-D, and the phased
implementation strategy, see
[`CONCURRENCY_ARCHITECTURE.md`](CONCURRENCY_ARCHITECTURE.md).