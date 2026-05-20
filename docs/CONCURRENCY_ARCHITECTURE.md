# Boomerang-v3 Concurrency Optimization: Architecture Analysis

> **Status**: Architecture Planning Document  
> **Date**: 2026-05-19  
> **Scope**: Ollama Cloud 3-slot concurrency bottleneck  
> **Author**: boomerang-architect  

---

## Executive Summary

Boomerang-v3 operates under a hard constraint: **3 concurrent model slots** on Ollama Cloud. The orchestrator (kimi-k2.6:cloud) consumes 1 slot continuously while inside OpenCode, leaving only **2 slots for parallel sub-agents**. When a sub-agent attempts to spawn another (e.g., coder → linter), the request hits the ceiling and may be queued or rejected (HTTP 503/429).

This document analyzes four architectural approaches to address the concurrency pain points, evaluates each against the four user proposals, and recommends a phased implementation strategy.

---

## Current State Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        OpenCode IDE                             │
│  ┌──────────────┐    ┌──────────────────────────────────┐    │
│  │ Orchestrator │    │      Boomerang Plugin (TS)       │    │
│  │ kimi-k2.6:cloud│───▶│  • Pure decision layer           │    │
│  │  (1 slot)     │    │  • Returns Context Packages      │    │
│  │  CONTINUOUS   │    │  • No execution / no queue       │    │
│  └──────────────┘    └──────────────────────────────────┘    │
│         │                                                        │
│         ▼ (OpenCode spawns agents natively)                     │
│  ┌──────────────┐    ┌──────────────┐                         │
│  │ Sub-agent 1  │    │ Sub-agent 2  │                         │
│  │ glm-5.1:cloud│    │devstral-2:123b-cloud│                        │
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

**Pain Points:**
1. **Orchestrator Tax**: Orchestrator model holds 1 slot for entire session — cannot release it
2. **No Client-Side Limiting**: Plugin doesn't enforce "max 2 sub-agents" — OpenCode may attempt a 3rd
3. **No Retry on Rejection**: Plugin can't see HTTP 503/429 — failures surface as generic errors
4. **No Timeout Enforcement**: Tasks can hang indefinitely, holding slots hostage
5. **No Cross-Session State**: Queue, failures, and metrics evaporate when OpenCode restarts
6. **No Observability**: Can't see queue depth, slot utilization, or failure rates

---

## The Four Proposals: Feasibility Matrix

| Proposal | Description | Plugin | MCP Server | Hybrid | Web Service |
|----------|-------------|--------|------------|--------|-------------|
| **1. Orchestrator Tax** | Async job queue, orchestrator spins down | ❌ Impossible | ❌ Impossible | ❌ Impossible | ⚠️ Partial* |
| **2. App Semaphore** | Client-side max 2 concurrent sub-agents | ⚠️ Logical only | ✅ Logical | ✅ Full | ✅ Full |
| **3. Exponential Backoff** | Retry on 503/429 with jitter | ⚠️ Task-level only | ⚠️ Task-level | ⚠️ Task-level | ✅ HTTP-level |
| **4. Aggressive Timeouts** | Hard 60s timeout, release slot | ✅ Task param | ✅ Task param | ✅ Task param | ✅ Proxy timeout |

> *Web Service can implement an Ollama Cloud proxy that queues requests, but still can't free OpenCode's orchestrator slot because OpenCode manages that lifecycle internally.

---

## Option A: Enhanced Plugin (Within OpenCode Constraints)

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        OpenCode IDE                             │
│  ┌──────────────┐    ┌──────────────────────────────────┐    │
│  │ Orchestrator │    │   Boomerang Plugin v3.1 (TS)     │    │
│  │ kimi-k2.6:cloud│───▶│  ┌─────────────────────────┐   │    │
│  │  (1 slot)     │    │  │  Concurrency Manager    │   │    │
│  │  CONTINUOUS   │    │  │  ├─ Logical semaphore   │   │    │
│  └──────────────┘    │  │  ├─ Task timeout: 60s   │   │    │
│         │            │  │  ├─ Retry with backoff  │   │    │
│         ▼            │  │  └─ Max 2 parallel rule │   │    │
│  ┌──────────────┐    │  └─────────────────────────┘   │    │
│  │ Sub-agent 1  │    └──────────────────────────────────┘    │
│  │ glm-5.1:cloud│                                             │
│  │  (1 slot)    │                                             │
│  └──────────────┘                                             │
│  ┌──────────────┐                                             │
│  │ Sub-agent 2  │                                             │
│  │devstral-2:123b-cloud│                                            │
│  │  (1 slot)    │                                             │
│  └──────────────┘                                             │
│       Total: 3 slots (still maxed)                            │
└─────────────────────────────────────────────────────────────────┘
```

### What Gets Implemented

| Proposal | Implementation | Feasibility |
|----------|---------------|-------------|
| **1. Orchestrator Tax** | NOT possible. Orchestrator runs inside OpenCode process; we don't control model lifecycle. | ❌ |
| **2. Semaphore** | Logical `maxConcurrentAgents = 2` enforced in `orchestrator.ts`. Before dispatching a 3rd agent, plugin warns and serializes. | ⚠️ |
| **3. Backoff** | Wrap `task` execution in retry loop with exponential backoff + jitter on failure. Can't see HTTP codes, but catches task failures. | ⚠️ |
| **4. Timeouts** | Set `timeout: 60000` on all `task` tool calls. If agent exceeds 60s, task fails, slot is released by OpenCode. | ✅ |

### Code Changes

- `src/orchestrator.ts`: Add `ConcurrencyPlanner` class
  - `maxConcurrentSlots: 2` (3 total minus 1 for orchestrator)
  - `canDispatch(agentName): boolean` — checks current slot usage
  - `dispatchWithRetry(agentName, context, retries=3)` — exponential backoff
  - `dispatchWithTimeout(agentName, context, timeout=60000)`
- `src/execution/task-runner.ts`: Add retry decorator
- `src/types.ts`: Add `ConcurrencyConfig` interface

### Pros
- ✅ Minimal change to existing codebase
- ✅ No new infrastructure
- ✅ Fully contained within TypeScript plugin
- ✅ Plugin stays lightweight

### Cons
- ❌ Doesn't solve the fundamental "orchestrator tax" problem
- ❌ Can't see HTTP status codes for true backpressure
- ❌ No persistence across OpenCode restarts
- ❌ No observability dashboard
- ❌ Still limited to 2 parallel sub-agents
- ❌ Quality gates (lint, test) may still fail due to slot exhaustion

### Effort Estimate: **1-2 weeks**

### Recommended Phase: **Phase 1 (Immediate)**

---

## Option B: Standalone MCP Server

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        OpenCode IDE                             │
│  ┌──────────────┐    ┌──────────────────────────────────┐    │
│  │ Orchestrator │    │   Boomerang Plugin v3.x (TS)     │    │
│  │ kimi-k2.6:cloud│───▶│  • Submit jobs via MCP           │    │
│  │  (1 slot)     │    │  • Poll for completion           │    │
│  │  CONTINUOUS   │    │  • Display queue status          │    │
│  └──────────────┘    └──────────────────────────────────┘    │
│         │                        │                              │
│         ▼                        ▼ (MCP stdio)                │
│  ┌──────────────┐    ┌──────────────────────────────────┐    │
│  │ Sub-agent 1  │    │   Boomerang Queue Server        │    │
│  │ glm-5.1:cloud│◄───│   (Python FastMCP or new TS)   │    │
│  │  (1 slot)    │    │                                  │    │
│  └──────────────┘    │  ┌────────────────────────────┐│    │
│  ┌──────────────┐    │  │  Job Queue + State Machine ││    │
│  │ Sub-agent 2  │    │  │  ├─ PostgreSQL persistence  ││    │
│  │devstral-2:123b-cloud│◄──│  │  ├─ Slot accounting        ││    │
│  │  (1 slot)    │    │  │  ├─ Retry scheduler        ││    │
│  └──────────────┘    │  │  ├─ Timeout tracker          ││    │
│       Total: 3       │  │  └─ Observability metrics   ││    │
│                      │  └────────────────────────────┘│    │
│                      └──────────────────────────────────┘    │
│                              │                                  │
│                              ▼ (shared DB)                    │
│                      ┌─────────────────────┐                   │
│                      │   PostgreSQL        │                   │
│                      │   (jobs table)      │                   │
│                      └─────────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

### What Gets Implemented

| Proposal | Implementation | Feasibility |
|----------|---------------|-------------|
| **1. Orchestrator Tax** | Still impossible. MCP server doesn't control OpenCode's model lifecycle. Orchestrator slot remains held. | ❌ |
| **2. Semaphore** | **FULLY**. MCP server maintains `active_jobs` counter in PostgreSQL. Plugin queries before dispatch. Server enforces `max_concurrent = 3`. | ✅ |
| **3. Backoff** | **FULLY**. Server has retry scheduler with exponential backoff + jitter. Jobs in `failed` state auto-retry after delay. | ✅ |
| **4. Timeouts** | **FULLY**. Server tracks job start time. Marks jobs `timed_out` if `now() - started_at > timeout`. Plugin passes timeout via task parameter. | ✅ |

### MCP Server Schema

```python
# New table in shared PostgreSQL
CREATE TABLE boomerang_jobs (
    id UUID PRIMARY KEY,
    session_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    status TEXT CHECK (status IN ('queued','running','completed','failed','timed_out')),
    context_json JSONB,
    priority INT DEFAULT 0,
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    timeout_seconds INT DEFAULT 60,
    result_json JSONB,
    error_message TEXT
);

CREATE INDEX idx_jobs_status ON boomerang_jobs(status);
CREATE INDEX idx_jobs_session ON boomerang_jobs(session_id);
CREATE INDEX idx_jobs_running ON boomerang_jobs(status) WHERE status = 'running';
```

### MCP Tools Added

| Tool | Purpose |
|------|---------|
| `submit_job` | Add a task to the queue |
| `get_job_status` | Poll for completion |
| `get_queue_depth` | How many jobs queued/running/failed |
| `get_slot_usage` | Current slot consumption |
| `cancel_job` | Abort a queued or running job |
| `get_metrics` | Failure rates, avg latency, retry count |

### Pros
- ✅ **Cross-session persistence**: Jobs survive OpenCode restart
- ✅ **True observability**: Queue depth, slot usage, failure rates
- ✅ **Full retry logic**: Exponential backoff with jitter at server level
- ✅ **Timeout enforcement**: Server tracks and kills hung jobs
- ✅ **Shared PostgreSQL**: Reuses existing memini-ai database
- ✅ **FastMCP pattern**: Consistent with existing memini-ai-dev architecture

### Cons
- ❌ Doesn't free orchestrator slot (still runs inside OpenCode)
- ❌ Adds another persistent process (or extends memini-ai-dev)
- ❌ MCP latency overhead for every job submission/poll
- ❌ More complex deployment (server must be running)
- ❌ Two codebases to maintain (TypeScript plugin + Python/TS server)

### Effort Estimate: **3-4 weeks**

### Recommended Phase: **Phase 2 (After Option A)**

### Integration with memini-ai-dev

Two sub-options:

**B1. Extend memini-ai-dev**: Add job queue tables + MCP tools to existing Python FastMCP server. Pro: Single process, shared DB connection pool. Con: Blurs separation of concerns (memory vs queue).

**B2. New `boomerang-queue` server**: Standalone Python FastMCP server that connects to same PostgreSQL. Pro: Clean separation, can be restarted independently. Con: Another process to manage.

**Recommendation: B2** — Keep memory server (memini-ai-dev) focused on its domain. Job queue is a distinct concern.

---

## Option C: Hybrid Plugin + MCP Server

### Architecture

This is the **practical combination** of Options A and B. The plugin handles lightweight, synchronous decisions (timeout, simple retry). The MCP server handles stateful, persistent concerns (queue, scheduling, observability).

```
┌─────────────────────────────────────────────────────────────────┐
│                        OpenCode IDE                             │
│                                                                 │
│  ┌──────────────┐    ┌──────────────────────────────────┐    │
│  │ Orchestrator │    │   Boomerang Plugin v3.x (TS)     │    │
│  │ kimi-k2.6:cloud│───▶│  ┌─────────────────────────┐   │    │
│  │  (1 slot)     │    │  │  Lightweight Layer      │   │    │
│  │  CONTINUOUS   │    │  │  ├─ Task timeout: 60s   │   │    │
│  └──────────────┘    │  │  ├─ Simple retry (1x)     │   │    │
│         │            │  │  ├─ Slot check (advisory) │   │    │
│         ▼            │  │  └─ Fail fast on overload │   │    │
│  ┌──────────────┐    │  └─────────────────────────┘   │    │
│  │ Sub-agent N  │    │         │                      │    │
│  │ (various)    │    │         ▼ (MCP, when needed)   │    │
│  │  (2 slots)   │    │  ┌─────────────────────────┐   │    │
│  └──────────────┘    │  │  Persistence Layer (MCP)  │   │    │
│                      │  │  ├─ Submit to queue        │   │    │
│                      │  │  ├─ Cross-session recovery│   │    │
│                      │  │  ├─ Observability          │   │    │
│                      │  │  └─ Background scheduling  │   │    │
│                      │  └─────────────────────────┘   │    │
│                      └──────────────────────────────────┘    │
│                              │                                  │
└──────────────────────────────┼──────────────────────────────────┘
                               ▼ (MCP stdio)
                     ┌──────────────────────┐
                     │  Boomerang Queue Svc │
                     │  (Python FastMCP)    │
                     │  ├─ Job state machine │
                     │  ├─ Retry scheduler  │
                     │  └─ Metrics          │
                     └──────────────────────┘
                               │
                               ▼
                     ┌──────────────────────┐
                     │  PostgreSQL          │
                     │  (shared with memini)│
                     └──────────────────────┘
```

### Decision Flow

```
User Request
    │
    ▼
┌─────────────────┐
│ Plugin checks:  │
│ Can we handle   │
│ this inline?    │
└─────────────────┘
    │
    ├─ YES (simple task, slots available)
    │   └──► Dispatch directly with timeout + 1 retry
    │
    └─ NO (complex, queue deep, cross-session needed)
        └──► Submit to MCP Queue Server
             └──► Server schedules with full retry/backoff
```

### What Gets Implemented

| Proposal | Implementation | Feasibility |
|----------|---------------|-------------|
| **1. Orchestrator Tax** | Still impossible. But plugin minimizes orchestrator work by delegating scheduling to server. | ❌ |
| **2. Semaphore** | **FULLY**. Plugin enforces logical limit synchronously. MCP server enforces persistent limit asynchronously. | ✅ |
| **3. Backoff** | **FULLY**. Plugin: simple 1-retry for transient failures. MCP server: full exponential backoff with jitter for queued jobs. | ✅ |
| **4. Timeouts** | **FULLY**. Plugin: 60s task timeout. MCP server: tracks job lifetime, marks stale jobs. | ✅ |

### Pros
- ✅ Best of both worlds: plugin stays fast, server handles complexity
- ✅ Graceful degradation: if MCP server is down, plugin falls back to inline logic
- ✅ Observability without sacrificing responsiveness
- ✅ Cross-session persistence for important jobs
- ✅ Layered retry: fast inline retry + thorough server retry

### Cons
- ❌ Doesn't free orchestrator slot
- ❌ Two systems to reason about (when to inline vs queue)
- ❌ MCP latency for queued jobs
- ❌ Slightly more complex mental model

### Effort Estimate: **4-5 weeks** (includes Option A + Option B)

### Recommended Phase: **Phase 2-3**

---

## Option D: Standalone Web Service (Ollama Cloud Proxy)

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        OpenCode IDE                             │
│                                                                 │
│  ┌──────────────┐    ┌──────────────────────────────────┐    │
│  │ Orchestrator │    │   Boomerang Plugin (TS)        │    │
│  │ kimi-k2.6:cloud│───▶│  • Thin adapter layer          │    │
│  │  (1 slot)     │    │  • Routes API calls to proxy   │    │
│  │  CONTINUOUS   │    │  • Receives results back       │    │
│  └──────────────┘    └──────────────────────────────────┘    │
│         │                        │                              │
│         ▼                        ▼ (HTTP API)                 │
│  ┌──────────────┐    ┌──────────────────────────────────┐    │
│  │ Sub-agent 1  │    │   Boomerang Proxy Service        │    │
│  │ glm-5.1:cloud│───▶│   (Python FastAPI / Node.js)    │    │
│  │  (1 slot)    │    │                                  │    │
│  └──────────────┘    │  ┌────────────────────────────┐ │    │
│  ┌──────────────┐    │  │  OpenAI-Compatible API      │ │    │
│  │ Sub-agent 2  │    │  │  ├─ /v1/chat/completions   │ │    │
│  │devstral-2:123b-cloud│──▶│  │  ├─ /v1/models             │ │    │
│  │  (1 slot)    │    │  │  └─ /v1/embeddings         │ │    │
│  └──────────────┘    │  └────────────────────────────┘ │    │
│       Total: 3       │         │                         │    │
│                      │         ▼                         │    │
│                      │  ┌────────────────────────────┐  │    │
│                      │  │  Queue + Concurrency Layer  │  │    │
│                      │  │  ├─ Semaphore: 3 slots     │  │    │
│                      │  │  ├─ Retry on 503/429       │  │    │
│                      │  │  ├─ Timeout: 60s upstream   │  │    │
│                      │  │  └─ Metrics dashboard      │  │    │
│                      │  └────────────────────────────┘  │    │
│                      └──────────────────────────────────┘    │
│                              │                                  │
└──────────────────────────────┼──────────────────────────────────┘
                               ▼ (HTTPS)
                     ┌──────────────────────┐
                     │  Ollama Cloud         │
                     │  https://ollama.com/v1│
                     │  (3 concurrent slots) │
                     └──────────────────────┘
```

### Key Insight

Option D is **not** about freeing the orchestrator slot — OpenCode still holds it while the orchestrator agent runs. What Option D **does** solve:

1. **True API-level backpressure**: The proxy sees HTTP 503/429 from Ollama Cloud and queues/retryies transparently
2. **True semaphore**: Proxy enforces max 3 concurrent upstream requests, regardless of which OpenCode agent makes them
3. **Cross-tool coordination**: If multiple tools (not just Boomerang) use Ollama Cloud, they all go through the same proxy and share the same queue
4. **Timeout enforcement**: Proxy can cancel upstream requests and return 408 to OpenCode

### What Gets Implemented

| Proposal | Implementation | Feasibility |
|----------|---------------|-------------|
| **1. Orchestrator Tax** | **PARTIAL**. Proxy can't free OpenCode's orchestrator slot, but CAN queue other requests so the orchestrator never hits 503. | ⚠️ |
| **2. Semaphore** | **FULLY**. Proxy maintains `asyncio.Semaphore(3)` for ALL upstream requests. | ✅ |
| **3. Backoff** | **FULLY**. Proxy intercepts 503/429, pauses with exponential backoff + jitter, retries. | ✅ |
| **4. Timeouts** | **FULLY**. Proxy enforces 60s read timeout on upstream, cancels request, releases semaphore slot. | ✅ |

### OpenCode Configuration Change

```json
{
  "providers": [
    {
      "id": "ollama",
      "name": "Ollama Cloud (via Boomerang Proxy)",
      "baseURL": "http://localhost:8123/v1",
      "apiKey": "${OLLAMA_API_KEY}",
      "model": "kimi-k2.6:cloud"
    }
  ]
}
```

### Proxy Endpoints

| Endpoint | Behavior |
|----------|----------|
| `POST /v1/chat/completions` | Queue if at capacity, retry on 503, timeout at 60s |
| `GET /v1/models` | Pass-through with caching |
| `GET /health` | Queue depth, slot usage, recent errors |
| `GET /metrics` | Prometheus-style metrics |

### Pros
- ✅ **True API-level control**: Sees HTTP codes, controls retries
- ✅ **Tool-agnostic**: All OpenCode agents benefit, not just Boomerang
- ✅ **Prevents 503/429**: Queue absorbs bursts
- ✅ **Observable**: Dashboard shows queue depth, latency, errors
- ✅ **Transparent**: OpenCode doesn't know proxy exists

### Cons
- ❌ **Doesn't solve orchestrator tax**: OpenCode still holds orchestrator slot
- ❌ **Complex infrastructure**: New service to deploy, monitor, secure
- ❌ **Latency**: Adds hop between OpenCode and Ollama Cloud
- ❌ **Failure mode**: If proxy dies, ALL agents lose Ollama Cloud access
- ❌ **SSL/TLS termination**: Needs certs if exposed beyond localhost
- ❌ **Auth**: Needs to securely manage Ollama Cloud API keys

### Effort Estimate: **5-7 weeks**

### Recommended Phase: **Phase 3 (Long-term)**

---

## Trade-off Summary

| Dimension | Option A (Plugin) | Option B (MCP Server) | Option C (Hybrid) | Option D (Web Service) |
|-----------|-------------------|----------------------|-------------------|----------------------|
| **Effort** | 1-2 weeks | 3-4 weeks | 4-5 weeks | 5-7 weeks |
| **Orchestrator Tax** | ❌ | ❌ | ❌ | ⚠️ |
| **Semaphore** | ⚠️ Logical | ✅ Full | ✅ Full | ✅ Full |
| **Backoff** | ⚠️ Task-level | ✅ Full | ✅ Full | ✅ HTTP-level |
| **Timeouts** | ✅ | ✅ | ✅ | ✅ |
| **Persistence** | ❌ | ✅ | ✅ | ✅ |
| **Observability** | ❌ | ✅ | ✅ | ✅ |
| **Infra Cost** | None | Low | Low | Medium |
| **Complexity** | Low | Medium | Medium | High |
| **Risk** | Low | Low-Med | Med | High |

---

## Final Recommendation: Hybrid Approach (Option C) in Three Phases

### Why Hybrid?

1. **Option A alone** doesn't solve core problems (no persistence, no observability)
2. **Option B alone** is overkill for simple tasks and adds MCP latency to everything
3. **Option D** is too heavy, too risky, and still doesn't solve the orchestrator tax
4. **Option C** gives us:
   - Immediate wins from plugin enhancements (Phase 1)
   - Persistent queue + observability from MCP server (Phase 2)
   - No disruption to existing architecture
   - Graceful degradation if server is unavailable

### Phase 1: Enhanced Plugin (Weeks 1-2)

**Goal**: Implement what we can inside OpenCode constraints. Get immediate relief.

**Deliverables**:
- `src/concurrency/` module in boomerang-v3 plugin
  - `TaskLimiter`: Enforce `maxConcurrentSubAgents = 2`
  - `RetryExecutor`: Exponential backoff with jitter (3 retries max)
  - `TimeoutEnforcer`: 60s default on all task calls
- Update `orchestrator.ts` to check slot availability before dispatch
- Add `boomerang_concurrency_status` tool to plugin
- Update AGENTS.md with new concurrency-aware guidelines
- Tests: 20+ new tests for limiter, retry, timeout logic

**Impact**:
- Prevents sub-agent spawning failures
- Reduces hung task slot consumption
- Improves resilience with retry

### Phase 2: MCP Queue Server (Weeks 3-5)

**Goal**: Add persistent queue, cross-session state, and observability.

**Deliverables**:
- New project: `boomerang-queue/` (Python FastMCP server)
  - Reuses PostgreSQL from memini-ai-dev
  - `jobs` table with state machine
  - 6 MCP tools (submit, status, cancel, depth, slots, metrics)
- Update plugin to call queue server for:
  - Complex multi-step tasks
  - Background jobs (indexing, consolidation)
  - Cross-session recovery
- Simple dashboard: `GET /health` returns queue JSON
- Tests: Server tests + integration tests with plugin

**Impact**:
- Jobs survive OpenCode restart
- Queue depth visible
- Full retry + backoff for queued jobs
- Can schedule background tasks (e.g., project indexing) without consuming interactive slots

### Phase 3: Ollama Cloud Proxy (Weeks 6-8, Optional)

**Goal**: Only if Phase 1-2 proves insufficient. Add true API-level queueing.

**Deliverables**:
- New project: `boomerang-proxy/` (Python FastAPI or Node.js)
  - OpenAI-compatible API surface
  - `asyncio.Semaphore(3)` for upstream
  - Exponential backoff on 503/429
  - 60s timeout enforcement
- OpenCode reconfigured to use proxy URL
- Metrics endpoint for monitoring

**Decision Gate**: Implement Phase 3 only if:
- Phase 1-2 still results in frequent 503/429 errors
- Other OpenCode tools (not Boomerang) also need queueing
- User explicitly requests tool-agnostic proxy

---

## Integration with Existing Code

### boomerang-v3/ (TypeScript Plugin)

```
boomerang-v3/
├── src/
│   ├── concurrency/          # NEW (Phase 1)
│   │   ├── task-limiter.ts
│   │   ├── retry-executor.ts
│   │   └── timeout-enforcer.ts
│   ├── queue-client/         # NEW (Phase 2)
│   │   └── mcp-client.ts     # MCP client for queue server
│   ├── memini-client/        # EXISTING
│   ├── orchestrator.ts       # MODIFY (add slot check)
│   └── execution/            # MODIFY (add retry decorator)
```

### memini-ai-dev/ (Python Memory Server)

**Phase 2**: Can either:
1. **Extend**: Add `queue/` module + MCP tools to existing server
2. **Separate**: Create `boomerang-queue/` as standalone server, share PostgreSQL

**Recommendation**: Separate server for clean separation of concerns.

### PostgreSQL Schema

```sql
-- Phase 2 additions to shared database
CREATE SCHEMA IF NOT EXISTS boomerang_queue;

CREATE TABLE boomerang_queue.jobs (...);
CREATE TABLE boomerang_queue.metrics (...);
CREATE TABLE boomerang_queue.sessions (...);

-- No impact on existing memini-ai tables
```

---

## Open Questions

1. **Can OpenCode's task tool accept timeout parameter?** If not, Proposal 4 may need Option D proxy approach.
2. **Does Ollama Cloud return 429 or 503?** Need to verify actual status codes to tune retry logic.
3. **Is 60s timeout appropriate for all agents?** Architect (deepseek-v4-pro:cloud) may need longer for complex reasoning.
4. **Should queue server be TS or Python?** Python aligns with memini-ai-dev. TypeScript aligns with plugin. Recommend Python for FastMCP consistency.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-19 | Recommend Hybrid (Option C) | Balances effort vs benefit; incremental; low risk |
| 2026-05-19 | Phase 1 = Enhanced Plugin only | Immediate relief without new infrastructure |
| 2026-05-19 | Phase 2 = Separate MCP server (not extending memini-ai) | Clean separation of concerns |
| 2026-05-19 | Phase 3 = Proxy only if needed | High effort, high risk; defer until proven necessary |
| 2026-05-19 | Orchestrator Tax = acknowledged as unsolvable | Would require OpenCode architecture change or standalone service replacing OpenCode's role |

---

*Next Step: User review and approval of phased approach. Then delegate Phase 1 implementation to `boomerang-coder`.*
