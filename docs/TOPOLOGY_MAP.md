# System Topology Map: MCP-Servers Monorepo

## 1. Architecture Diagram

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                                User / OpenCode                           │
└───────────────────────┬──────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          boomerang-v3 (Orchestrator)                     │
│  (Context Building ───► Coordination ───► Protocol Enforcement)         │
└──────────┬────────────────────┬────────────────────┬─────────────────────┘
           │                    │                    │
           │                    │                    │
           ▼                    ▼                    ▼
┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
│  memini-ai-dev      │ │  boomerang-queue   │ │  boomerang-proxy    │
│  (MCP stdio)        │ │  (FastMCP HTTP/SSE)  │ │  (FastAPI Proxy)   │
└──────────┬───────────┘ └──────────┬───────────┘ └──────────┬───────────┘
           │                    │                    │
           │                    │                    │
           └──────────┬─────────┴────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          PostgreSQL : 5434                                │
│  (Shared DB: memini_ai schema, boomerang_queue schema, telemetry)         │
└──────────────────────────────────────────────────────────────────────────┘
                                     ▲
                                     │
                                     │ (Queries Telemetry & State)
                                     │
                                     │
┌──────────────────────────────────────────────────────────────────────────┐
│                          boomerang-proxy (API/UI)                        │
│  (/dashboard ───► Renders Stats) ───► WS (/ws/dashboard)                  │
└──────────┬───────────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                           Ollama Cloud API                               │
│  (Kimi-k2.6, GLM-5.1, DeepSeek-v4, Gemma4, etc.)                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## 2. Ports & Protocols

| Service | Port | Protocol | Container | Language | Purpose |
|:---|:---|:---|:---|:---|:---|
| memini-ai-dev | N/A | stdio | Local/Docker | Python | Semantic Memory & KG |
| boomerang-queue | 8000 | HTTP/SSE | `boomerang-queue` | Python | Job Queue & Scheduling |
| boomerang-proxy | 8080 | HTTP/WS | `boomerang-proxy` | Python | LLM Gateway & Dashboard |
| PostgreSQL | 5434 | TCP/SQL | `vectordb` | SQL | Vector & Relational Storage |

## 3. File Inventory

### boomerang-v3 (Orchestration)
- `.opencode/agents/` (30 files) - Agent persona and permission definitions.
- `AGENTS.md` (~150 lines) - Master agent routing matrix.
- `TASKS.md` (~100 lines) - Session-based task tracking.

### memini-ai-dev (Memory)
- `src/memini_ai/memory.py` (~400 lines) - Core semantic memory logic.
- `src/memini_ai/graph.py` (~300 lines) - Knowledge graph implementation.
- `src/memini_ai/server.py` (~200 lines) - MCP server entry point.

### boomerang-queue (Scheduling)
- `src/boomerang_queue/server.py` (~250 lines) - FastMCP tool definitions.
- `src/boomerang_queue/scheduler.py` (~300 lines) - Background job processor.
- `src/boomerang_queue/database.py` (~200 lines) - asyncpg multi-tenant logic.
- `src/boomerang_queue/schema.py` (~100 lines) - SQL table definitions.

### boomerang-proxy (Gateway)
- `src/boomerang_proxy/router.py` (~300 lines) - API endpoints & LLM routing.
- `src/boomerang_proxy/main.py` (~150 lines) - FastAPI application setup.
- `src/boomerang_proxy/dashboard.py` (~200 lines) - Dashboard data aggregation.

## 4. Data Flow Examples

**1. Agent Invocation**
`User Request` $\rightarrow$ `Orchestrator` $\rightarrow$ `memini-ai (query_memories)` $\rightarrow$ `Context Package` $\rightarrow$ `Agent Execution` $\rightarrow$ `memini-ai (add_memory)`

**2. Job Queuing**
`submit_job` $\rightarrow$ `boomerang-queue` $\rightarrow$ `PostgreSQL (Insert Job)` $\rightarrow$ `Scheduler (Poll/Dequeue)` $\rightarrow$ `Agent Dispatch` $\rightarrow$ `Job Status (Update PG)`

**3. Dashboard Loading**
`Browser` $\rightarrow$ `/dashboard` $\rightarrow$ `boomerang-proxy` $\rightarrow$ `PG (Telemetry) + memini-ai (Metadata)` $\rightarrow$ `HTML/JSON Response` $\rightarrow$ `WS Connection (/ws/dashboard)`

## 5. Environment Variables Cheat Sheet

| Variable | Description | Default / Example |
|:---|:---|:---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5434/db` |
| `OLLAMA_CLOUD_API_KEY` | API key for Ollama Cloud | `sk-....` |
| `OLLAMA_BASE_URL` | Ollama API endpoint | `https://ollama.com/v1` |
| `QUEUE_HTTP_PORT` | Port for boomerang-queue | `8000` |
| `PROXY_PORT` | Port for boomerang-proxy | `8080` |
| `MEMINI_TRUST_THRESHOLD`| Minimum trust for L1 summary | `0.8` |

## 6. Docker Status

| Container | Image | Status | Ports | Restart |
|:---|:---|:---|:---|:---|
| vectordb | postgres:16-alpine | Running | 5434:5432 | always |
| boomerang-queue | boomerang-queue:latest | Running | 8000:8000 | on-failure |
| boomerang-proxy | boomerang-proxy:latest | Running | 8080:8080 | on-failure |
