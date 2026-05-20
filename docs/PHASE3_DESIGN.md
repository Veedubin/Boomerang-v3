# Phase 3: Ollama Cloud Proxy — Design Document

> **Status**: Detailed Design for Implementation  
> **Date**: 2026-05-19  
> **Scope**: Standalone web service (Option D) from `CONCURRENCY_ARCHITECTURE.md`  
> **Author**: boomerang-architect

---

## 1. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              OpenCode IDE                                   │
│                                                                             │
│  ┌─────────────────┐      ┌─────────────────────────────────────────┐    │
│  │   Orchestrator  │      │   Boomerang Plugin v3.x (TS)            │    │
│  │  kimi-k2.6:cloud │─────▶│  • Thin adapter, no queue logic          │    │
│  │   (1 slot)       │      │  • Routes all LLM calls to proxy        │    │
│  │   CONTINUOUS     │      └─────────────────────────────────────────┘    │
│  └─────────────────┘                   │                                    │
│                                       │ HTTP / SSE                          │
│  ┌─────────────────┐                  ▼                                    │
│  │   Sub-agent 1   │      ┌─────────────────────────────────────────┐    │
│  │  glm-5.1:cloud  │─────▶│      Boomerang Proxy Service            │    │
│  │   (1 slot)      │      │      (Python FastAPI)                   │    │
│  └─────────────────┘      │                                         │    │
│  ┌─────────────────┐      │  ┌─────────────────────────────────┐ │    │
│  │   Sub-agent 2   │─────▶│  │  OpenAI-Compatible API Surface  │ │    │
│  │ devstral-2:123b-cloud │      │  │  • POST /v1/chat/completions    │ │    │
│  │   (1 slot)      │      │  │  • GET  /v1/models              │ │    │
│  └─────────────────┘      │  │  • POST /v1/embeddings          │ │    │
│        Total: 3           │  └─────────────────────────────────┘ │    │
│                           │         │                               │    │
│                           │         ▼                               │    │
│                           │  ┌─────────────────────────────────┐  │    │
│                           │  │  Queue + Concurrency Layer      │  │    │
│                           │  │  ├─ asyncio.Semaphore(3)       │  │    │
│                           │  │  ├─ Fair FIFO queue              │  │    │
│                           │  │  ├─ Retry w/ exp backoff+jitter  │  │    │
│                           │  │  ├─ Upstream timeout: 60s        │  │    │
│                           │  │  └─ /health + /metrics dashboards│  │    │
│                           │  └─────────────────────────────────┘  │    │
│                           │         │                               │    │
│                           └─────────┼───────────────────────────────┘    │
│                                     │ HTTPS                               │
└─────────────────────────────────────┼───────────────────────────────────┘
                                      ▼
                           ┌──────────────────────────┐
                           │      Ollama Cloud          │
                           │   https://ollama.com/v1    │
                           │   (3 concurrent slots)     │
                           └──────────────────────────┘
```

### Request Flow

```
OpenCode Agent
      │
      ▼ POST /v1/chat/completions
┌────────────────────────┐
│ 1. Validate auth       │
│ 2. Enqueue request     │
│ 3. Wait on Semaphore(3)│ ──► Queue if full
└────────────────────────┘
      │
      ▼ (slot acquired)
┌────────────────────────┐
│ 4. Start 60s timer     │
│ 5. Forward to Ollama   │
│ 6. Stream response     │
└────────────────────────┘
      │
      ▼ 503/429
┌────────────────────────┐
│ 7. Backoff + Jitter    │
│ 8. Retry (max 3)       │
│ 9. Release on success/ │
│    failure/timeout     │
└────────────────────────┘
```

---

## 2. Project Structure

Proposed layout for `boomerang-proxy/`, mirroring the existing `boomerang-queue/` conventions:

```
boomerang-proxy/
├── pyproject.toml              # uv/hatchling packaging, deps, ruff, pytest
├── README.md                   # Quick-start, env vars, OpenCode config
├── Dockerfile                  # python:3.11-slim + uv
├── docker-compose.yml          # Optional: proxy + Redis (metrics cache)
├── .env.example                # Template for all environment variables
├── src/
│   └── boomerang_proxy/
│       ├── __init__.py         # Version info
│       ├── __main__.py         # `python -m boomerang_proxy` entrypoint
│       ├── config.py           # Pydantic Settings (env vars, defaults)
│       ├── main.py             # FastAPI app factory + lifespan
│       ├── router.py           # OpenAI-compatible endpoint handlers
│       ├── upstream.py         # httpx client builder, request forwarding
│       ├── concurrency.py      # Semaphore(3), queue logic, slot tracking
│       ├── retry.py            # Exponential backoff + jitter on 503/429
│       ├── timeout.py          # 60s upstream timeout enforcement
│       ├── models.py           # Pydantic request/response schemas
│       ├── health.py           # /health and /metrics data aggregation
│       └── middleware.py       # CORS, request ID logging, auth header pass-through
├── tests/
│   ├── __init__.py
│   ├── conftest.py             # Shared fixtures: httpx.AsyncClient mock
│   ├── unit/
│   │   ├── test_config.py      # Env loading, defaults
│   │   ├── test_concurrency.py # Semaphore acquisition/release, queue ordering
│   │   ├── test_retry.py       # Backoff intervals, jitter bounds, max retries
│   │   ├── test_timeout.py     # Cancel propagation, semaphore release on timeout
│   │   └── test_health.py      # Dashboard JSON shape, metric accumulation
│   └── integration/
│       ├── test_chat_completions.py   # Full proxy round-trip w/ mocked upstream
│       ├── test_rate_limit.py         # 503/429 → retry → success path
│       └── test_metrics_endpoint.py   # Prometheus-style /metrics output
```

---

## 3. API Endpoints

| Method | Path | Description | Request Body / Params | Response |
|--------|------|-------------|------------------------|----------|
| `POST` | `/v1/chat/completions` | OpenAI-compatible chat completions proxy | `{model, messages, stream?, temperature?, ...}` | `ChatCompletion` or SSE stream |
| `GET`  | `/v1/models` | List available models (cached pass-through) | None | `{data: [{id, ...}]}` |
| `GET`  | `/health` | Live dashboard: queue depth, active slots, recent errors | None | JSON (see schema below) |
| `GET`  | `/metrics` | Prometheus-style metrics for external scraping | None | `text/plain` (openmetrics) |

### POST /v1/chat/completions

- **Transparent**: forwards `model`, `messages`, `stream`, `temperature`, `max_tokens`, etc. to Ollama Cloud `/v1/chat/completions`.
- **Queueing**: if 3 slots are in use, request enters FIFO queue and waits (no 503 returned to OpenCode).
- **Streaming**: when `stream: true`, proxy streams chunks from upstream back to client using `fastapi.responses.StreamingResponse`.
- **Non-streaming**: when `stream: false` (or omitted), proxy buffers upstream response and returns complete JSON.
- **Auth**: proxy reads `Authorization: Bearer <token>` header from client and forwards it verbatim to upstream.

### GET /v1/models

- Pass-through to `https://ollama.com/v1/models`.
- **Cache**: TTL 60 seconds to reduce upstream noise.

### GET /health

```json
{
  "status": "ok",
  "version": "0.1.0",
  "timestamp": "2026-05-19T12:34:56Z",
  "concurrency": {
    "max_slots": 3,
    "active_slots": 2,
    "queued_requests": 1
  },
  "upstream": {
    "url": "https://ollama.com/v1",
    "reachable": true,
    "last_error": null,
    "last_error_at": null
  },
  "metrics": {
    "requests_total": 142,
    "requests_queued": 12,
    "retries_total": 4,
    "timeouts_total": 1,
    "errors_5xx_total": 2,
    "avg_latency_ms": 2340
  }
}
```

### GET /metrics

Prometheus exposition format (OpenMetrics):

```
# HELP boomerang_proxy_requests_total Total requests received
# TYPE boomerang_proxy_requests_total counter
boomerang_proxy_requests_total 142

# HELP boomerang_proxy_active_slots Current active upstream slots
# TYPE boomerang_proxy_active_slots gauge
boomerang_proxy_active_slots 2

# HELP boomerang_proxy_queued_requests Current queue depth
# TYPE boomerang_proxy_queued_requests gauge
boomerang_proxy_queued_requests 1

# HELP boomerang_proxy_request_duration_seconds Request latency
# TYPE boomerang_proxy_request_duration_seconds histogram
boomerang_proxy_request_duration_seconds_bucket{le="1.0"} 30
...
```

---

## 4. Concurrency Model

### Core Primitive: `asyncio.Semaphore(3)`

```python
# src/boomerang_proxy/concurrency.py
import asyncio
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class SlotManager:
    max_slots: int = 3
    _semaphore: asyncio.Semaphore = field(init=False)
    _queue_depth: int = 0
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    def __post_init__(self) -> None:
        self._semaphore = asyncio.Semaphore(self.max_slots)

    @property
    def active_slots(self) -> int:
        # semaphore._value is internal; safer to track ourselves
        return self.max_slots - self._semaphore._value  # type: ignore[attr-defined]

    @property
    def queued_requests(self) -> int:
        return self._queue_depth

    async def acquire(self) -> None:
        async with self._lock:
            self._queue_depth += 1
        await self._semaphore.acquire()
        async with self._lock:
            self._queue_depth -= 1

    def release(self) -> None:
        self._semaphore.release()
```

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| **One global Semaphore(3)** | All OpenCode agents share the same pool. Prevents any single agent from monopolizing slots. |
| **FIFO queue via Semaphore + `asyncio.Lock`** | `asyncio.Semaphore` naturally queues waiters in FIFO order (Python 3.11+). We track queue depth explicitly for observability. |
| **Separate read/write for `model` list** | `GET /v1/models` does **not** consume a slot (cached pass-through). Only chat/embeddings consume slots. |
| **Slot release guarantees** | `try/finally` around every upstream request ensures the semaphore is released even if the client disconnects or an exception bubbles up. |

---

## 5. Retry Logic

### Policy: Exponential Backoff + Jitter on 503 / 429

```python
# src/boomerang_proxy/retry.py
import asyncio
import random
from typing import Callable

Retryable = Callable[..., bool]

class BackoffConfig:
    base_delay: float = 1.0          # seconds
    max_delay: float = 16.0          # cap at 16s
    max_retries: int = 3
    jitter_factor: float = 0.25      # ±25%

    def delay_for_attempt(self, attempt: int) -> float:
        # Exponential: 1s, 2s, 4s ... capped at 16s
        exp = min(self.base_delay * (2 ** attempt), self.max_delay)
        # Full jitter: random in [0, exp] — avoids thundering herd
        jitter = random.uniform(0, exp)
        return jitter
```

### When to Retry

| Upstream Status | Action | Reason |
|-----------------|--------|--------|
| `503 Service Unavailable` | Retry with backoff | Ollama Cloud at capacity |
| `429 Too Many Requests` | Retry with backoff | Rate limit hit |
| `408 Request Timeout` (from proxy timer) | Retry once, then fail | Upstream hung; likely transient |
| `502 / 504` | Retry once | Gateway error; likely transient |
| `500` | Do **not** retry | Internal server error; retry unsafe |
| `401 / 403` | Fail immediately | Auth issue; retry will never help |
| `404` | Fail immediately | Model not found |

### Retry Decorator (conceptual)

```python
async def forward_with_retry(
    upstream: httpx.AsyncClient,
    request: httpx.Request,
    config: BackoffConfig = BackoffConfig(),
) -> httpx.Response:
    last_exception: Optional[Exception] = None
    for attempt in range(config.max_retries + 1):
        try:
            response = await upstream.send(request)
            if response.status_code in (503, 429):
                if attempt == config.max_retries:
                    return response  # exhausted, return the 503/429
                delay = config.delay_for_attempt(attempt)
                await asyncio.sleep(delay)
                continue
            return response
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            last_exception = exc
            if attempt == config.max_retries:
                raise
            delay = config.delay_for_attempt(attempt)
            await asyncio.sleep(delay)
    raise last_exception  # type: ignore[misc]
```

---

## 6. Timeout Enforcement

### Dual Timeout Architecture

| Layer | Timeout | Purpose |
|-------|---------|---------|
| **Client → Proxy** | 120s (configurable) | OpenCode should not hang forever waiting for proxy. |
| **Proxy → Upstream** | **60s** (hard limit) | Release slot if Ollama Cloud is hung or overloaded. |

### Implementation

```python
# src/bomerang_proxy/timeout.py
import asyncio
from contextlib import asynccontextmanager

UPSTREAM_TIMEOUT = 60.0  # seconds

@asynccontextmanager
async def upstream_timeout():
    """Wraps the upstream httpx request in a 60s timeout.
    On expiry, cancels the in-flight request and releases the semaphore."""
    task = asyncio.current_task()
    timer = asyncio.create_task(_cancel_after(task, UPSTREAM_TIMEOUT))
    try:
        yield
    finally:
        timer.cancel()
        try:
            await timer
        except asyncio.CancelledError:
            pass

async def _cancel_after(task: asyncio.Task, seconds: float) -> None:
    await asyncio.sleep(seconds)
    if not task.done():
        task.cancel()
```

### Slot Release Guarantee

```python
# In router.py — pseudocode for the handler
async def chat_completions(request: Request):
    await slot_manager.acquire()
    try:
        async with upstream_timeout():
            response = await forward_with_retry(upstream_client, build_request(request))
            return StreamingResponse(response.aiter_raw())
    except asyncio.TimeoutError:
        raise HTTPException(status_code=408, detail="Upstream timeout after 60s")
    finally:
        slot_manager.release()
```

**Critical rule**: `slot_manager.release()` is in `finally`, so cancellation, client disconnect, or exception always frees the slot.

---

## 7. Dependencies

```toml
# pyproject.toml [project.dependencies]
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "httpx>=0.28.0",
    "pydantic>=2.10.0",
    "pydantic-settings>=2.7.0",
    "prometheus-client>=0.21.0",
    "structlog>=24.4.0",
    "python-json-logger>=3.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.24.0",
    "pytest-httpx>=0.35.0",
    "ruff>=0.9.0",
    "mypy>=1.14.0",
]
```

### Why These Choices

| Package | Role | Rationale |
|---------|------|-----------|
| **FastAPI** | Web framework | Native Pydantic integration, async first, OpenAPI docs for free. |
| **Uvicorn** | ASGI server | Standard, supports HTTP/1.1 + WebSocket (for future SSE improvements). |
| **httpx** | Upstream client | Async-native, streaming support, timeout fine-grained control. |
| **pydantic-settings** | Config management | `.env` file support, type-safe environment variables. |
| **prometheus-client** | Metrics | Industry standard; `/metrics` endpoint is trivial. |
| **structlog** | Structured logging | JSON logs, request ID correlation, easy to ship to Loki/ELK. |
| **pytest-httpx** | Test mocking | `httpx_mock` fixture intercepts all httpx requests; perfect for integration tests. |

---

## 8. Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_CLOUD_BASE_URL` | `https://ollama.com/v1` | Upstream Ollama Cloud endpoint |
| `OLLAMA_API_KEY` | *(required)* | Forwarded in `Authorization: Bearer <key>` header |
| `PROXY_PORT` | `8123` | FastAPI bind port |
| `PROXY_HOST` | `0.0.0.0` | FastAPI bind host |
| `MAX_CONCURRENT_SLOTS` | `3` | Semaphore limit (must match Ollama Cloud plan) |
| `UPSTREAM_TIMEOUT_SECONDS` | `60` | Hard timeout for upstream requests |
| `MAX_RETRIES` | `3` | Retry attempts on 503/429 |
| `BASE_BACKOFF_SECONDS` | `1.0` | Initial retry delay |
| `MAX_BACKOFF_SECONDS` | `16.0` | Retry delay cap |
| `MODELS_CACHE_TTL_SECONDS` | `60` | Cache TTL for `GET /v1/models` |
| `LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `METRICS_ENABLED` | `true` | Enable `/metrics` endpoint |

### `.env.example`

```bash
# Upstream
OLLAMA_CLOUD_BASE_URL=https://ollama.com/v1
OLLAMA_API_KEY=sk-ollama-xxxxxxxx

# Proxy server
PROXY_PORT=8123
PROXY_HOST=0.0.0.0

# Concurrency (must match Ollama Cloud subscription)
MAX_CONCURRENT_SLOTS=3
UPSTREAM_TIMEOUT_SECONDS=60

# Retry tuning
MAX_RETRIES=3
BASE_BACKOFF_SECONDS=1.0
MAX_BACKOFF_SECONDS=16.0

# Observability
LOG_LEVEL=INFO
METRICS_ENABLED=true
```

---

## 9. Dockerfile

```dockerfile
# Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install uv
RUN pip install --no-cache-dir uv

# Copy project metadata + sources
COPY pyproject.toml ./
COPY README.md ./
COPY src/ ./src/

# Install into system environment (no venv needed in container)
RUN uv pip install --system -e ".[dev]"

# Runtime config defaults
ENV PYTHONUNBUFFERED=1
ENV PROXY_PORT=8123
ENV PROXY_HOST=0.0.0.0

EXPOSE 8123

# Use uvicorn directly for HTTP transport
CMD ["uvicorn", "boomerang_proxy.main:app", "--host", "0.0.0.0", "--port", "8123"]
```

### docker-compose.yml (optional local stack)

```yaml
version: "3.9"
services:
  boomerang-proxy:
    build: ./boomerang-proxy
    ports:
      - "8123:8123"
    environment:
      - OLLAMA_CLOUD_BASE_URL=https://ollama.com/v1
      - OLLAMA_API_KEY=${OLLAMA_API_KEY}
      - MAX_CONCURRENT_SLOTS=3
      - UPSTREAM_TIMEOUT_SECONDS=60
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8123/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

---

## 10. OpenCode Configuration

To point OpenCode at the proxy, update `~/.config/opencode/opencode.json` (or `.opencode/opencode.json` inside the project):

```json
{
  "providers": [
    {
      "id": "ollama",
      "name": "Ollama Cloud (via Boomerang Proxy)",
      "baseURL": "http://localhost:8123/v1",
      "apiKey": "${OLLAMA_API_KEY}",
      "models": [
        "kimi-k2.6:cloud",
        "glm-5.1:cloud",
        "deepseek-v4-pro:cloud",
        "devstral-2:123b-cloud",
        "deepseek-v4-flash:cloud",
        "qwen3-coder-next:cloud",
        "minimax-m2.7:cloud",
        "gemma4:31b-cloud",
        "qwen3.5:cloud"
      ]
    }
  ]
}
```

### Important Notes

- **Transparent**: OpenCode treats the proxy as a standard OpenAI-compatible endpoint. No plugin changes required.
- **Token**: The same `OLLAMA_API_KEY` is used. The proxy forwards the `Authorization` header unchanged.
- **Localhost only**: For single-user development. If exposing beyond localhost, add HTTPS (reverse proxy like Caddy/Traefik) and Bearer token validation on the proxy itself.

---

## 11. Testing Strategy

### Unit Tests (`tests/unit/`)

| Test File | What It Tests | Key Assertions |
|-----------|---------------|----------------|
| `test_config.py` | Pydantic Settings loading | Defaults, env overrides, missing required key raises error |
| `test_concurrency.py` | `SlotManager` | 3 parallel acquisitions succeed; 4th blocks; FIFO ordering on release; queue depth increments correctly |
| `test_retry.py` | `BackoffConfig` | Delay doubles each attempt; jitter within bounds; max retries respected; non-retryable codes fail fast |
| `test_timeout.py` | `upstream_timeout()` | Cancels task after 60s; releases semaphore on cancellation; leaves slot count correct |
| `test_health.py` | Dashboard aggregation | JSON shape matches schema; counters increment monotonically; reset behavior |

### Integration Tests (`tests/integration/`)

| Test File | What It Tests | Mock Strategy |
|-----------|-------------|---------------|
| `test_chat_completions.py` | Full round-trip | `pytest-httpx` intercepts `httpx.AsyncClient` to upstream; verify request body/headers forwarded; response streamed back |
| `test_rate_limit.py` | 503 → retry → success | `httpx_mock` returns `503` twice, then `200`; assert 3 upstream requests; assert proxy returns `200` |
| `test_metrics_endpoint.py` | `/metrics` output | Run 5 requests; scrape `/metrics`; verify counters match with Prometheus parser |

### Example: Concurrency Unit Test

```python
# tests/unit/test_concurrency.py
import asyncio
import pytest
from boomerang_proxy.concurrency import SlotManager

@pytest.fixture
def manager() -> SlotManager:
    return SlotManager(max_slots=3)

@pytest.mark.asyncio
async def test_fourth_request_queues(manager: SlotManager) -> None:
    acquired = []

    async def acquire_and_hold() -> None:
        await manager.acquire()
        acquired.append(True)
        await asyncio.sleep(10)  # hold slot

    # Start 3 holders
    tasks = [asyncio.create_task(acquire_and_hold()) for _ in range(3)]
    await asyncio.sleep(0.1)  # let them all acquire
    assert manager.active_slots == 3
    assert manager.queued_requests == 0

    # Fourth should queue
    fourth = asyncio.create_task(manager.acquire())
    await asyncio.sleep(0.1)
    assert manager.queued_requests == 1
    assert not fourth.done()

    # Release one, fourth should proceed
    manager.release()
    await fourth
    assert manager.queued_requests == 0
    assert manager.active_slots == 3

    # Cleanup
    for t in tasks:
        t.cancel()
    manager.release()
    manager.release()
    manager.release()
```

### Example: Retry Integration Test

```python
# tests/integration/test_rate_limit.py
import pytest
from fastapi.testclient import TestClient
from boomerang_proxy.main import app

@pytest.mark.asyncio
async def test_503_triggers_retry_and_eventually_succeeds(
    httpx_mock,  # from pytest-httpx
) -> None:
    # First two calls get 503; third succeeds
    httpx_mock.add_response(status_code=503)
    httpx_mock.add_response(status_code=503)
    httpx_mock.add_response(
        status_code=200,
        json={"id": "chatcmpl-ok", "choices": [{"message": {"content": "hi"}}]},
    )

    client = TestClient(app)
    response = client.post(
        "/v1/chat/completions",
        json={"model": "glm-5.1:cloud", "messages": [{"role": "user", "content": "hello"}]},
        headers={"Authorization": "Bearer test-key"},
    )

    assert response.status_code == 200
    assert response.json()["id"] == "chatcmpl-ok"
    requests = httpx_mock.get_requests()
    assert len(requests) == 3
```

### CI / Local Test Commands

```bash
# Install
uv pip install -e ".[dev]"

# Lint + typecheck
ruff check src/ tests/
mypy src/

# Unit only
pytest tests/unit/ -v

# Integration only (uses httpx_mock, no real upstream)
pytest tests/integration/ -v

# All
pytest -v
```

---

## 12. Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Proxy crashes → all agents lose Ollama Cloud | **High** | Docker `restart: unless-stopped`; healthcheck; optional multi-replica behind load balancer (future). |
| Proxy adds latency | **Low-Med** | Localhost loopback latency is <1ms; negligible compared to LLM inference. |
| 60s timeout too aggressive for architect agent | **Med** | Per-model timeout overrides (future); or increase `UPSTREAM_TIMEOUT_SECONDS` to 90s for `deepseek-v4-pro:cloud`. |
| Key leaked in logs | **High** | Proxy redacts `Authorization` header in structlog output; never log request body. |

---

## 13. Implementation Phases (Within Phase 3)

If breaking Phase 3 into sprints:

| Sprint | Deliverables | Est. Effort |
|--------|-------------|-------------|
| **3.1 Scaffold** | `pyproject.toml`, Dockerfile, `config.py`, `main.py` with `/health` stub | 2 days |
| **3.2 Core Proxy** | `router.py`, `upstream.py`, `models.py`; pass-through `chat/completions` + `models` | 3 days |
| **3.3 Concurrency** | `concurrency.py`, `retry.py`, `timeout.py`; Semaphore + queue + backoff | 3 days |
| **3.4 Observability** | `health.py`, `middleware.py`, Prometheus counters, structured logging | 2 days |
| **3.5 Testing** | Unit + integration tests; CI workflow; docs update | 3 days |
| **3.6 Integration** | OpenCode config validation; end-to-end smoke test with real Ollama Cloud | 2 days |

**Total Phase 3 Effort**: ~2–3 weeks (consistent with Option D estimate of 5–7 weeks in `CONCURRENCY_ARCHITECTURE.md`, but scoped to proxy only).

---

*Next Step: Delegate implementation to `boomerang-coder` starting with Sprint 3.1 (scaffold + core proxy).*
