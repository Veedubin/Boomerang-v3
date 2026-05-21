# Boomerang Services Docker Registry Publication Plan

**Version**: 0.1.0
**Date**: 2026-05-19
**Author**: boomerang-architect
**Status**: Draft (pending implementation)

---

## 1. Executive Summary

This document defines the strategy for publishing Boomerang-v3 microservices as Docker images, including which registry channels to use, how to build secure multi-arch images, and the CI/CD pipeline to maintain them. Three services are in scope:

| Service | Type | MCP Server? | Docker Hub | MCP Registry |
|---------|------|-------------|------------|--------------|
| **boomerang-proxy** | FastAPI proxy + dashboard | No | Yes | No (not MCP) |
| **boomerang-queue** | FastMCP job queue | Yes | Yes | Yes (Option A) |
| **memini-ai-dev** | FastMCP memory server | Yes | Optional | Future |

---

## 2. Service Classification

### 2.1 boomerang-proxy -- NOT an MCP Server

The proxy is an OpenAI-compatible HTTP API that sits between OpenCode and Ollama Cloud. It provides:

- `/v1/chat/completions` (OpenAI-compatible)
- `/v1/models` (model listing)
- `/health` (JSON health check)
- `/metrics` (Prometheus exposition)
- `/dashboard` (HTML + JS telemetry dashboard)
- `/ws/dashboard` (WebSocket real-time events)
- `/api/v1/dashboard/*` (REST telemetry API)

It does NOT implement the MCP protocol (no `initialize`, `tools/list`, or `tools/call` methods). It is an HTTP service that should be published to Docker Hub as a standard container image.

### 2.2 boomerang-queue -- MCP Server

The queue server exposes 8 MCP tools via FastMCP:

- `submit_job` -- Add a task to the queue
- `get_job_status` -- Poll job status
- `get_queue_depth` -- Count jobs by status
- `get_slot_usage` -- Current slot consumption
- `cancel_job` -- Cancel a queued/running job
- `get_metrics` -- Aggregated job metrics
- `emit_telemetry` -- Persist a telemetry event
- `get_telemetry` -- Retrieve telemetry events

It runs over stdio or HTTP/SSE. This is the primary candidate for Docker MCP Registry submission because Docker Desktop's MCP Toolkit can pull it directly and configure it via the `server.yaml` metadata.

### 2.3 memini-ai-dev -- MCP Server (Pip-Installable First)

memini-ai-dev is already installable via `pip install memini-ai-dev` and provides 25+ MCP tools. A Docker image is a secondary distribution channel. Publish to Docker Hub when ready; MCP Registry submission can follow.

---

## 3. Decision Table: Docker MCP Registry Channels

| Service | Option A (Docker-Built) | Option B (Self-Provided Image) | Self-Publish Only | Rationale |
|---------|------------------------|-------------------------------|-------------------|-----------|
| **boomerang-queue** | **RECOMMENDED** | Viable | Fallback | Full MCP server; benefits from Docker signatures, SBOMs, and MCP Toolkit visibility |
| **boomerang-proxy** | Not applicable | Not applicable | **ONLY OPTION** | Not an MCP server; cannot go to MCP Registry |
| **memini-ai-dev** | Future | Future | Current | Already pip-installable; Docker is secondary |

### Why Option A for boomerang-queue

Option A (Docker builds, signs, and publishes to `mcp/boomerang-queue` on Docker Hub) provides:

1. **Cryptographic signatures** via `cosign` -- users can verify the image was built by Docker
2. **SLSA provenance** -- attests the build came from the exact source commit
3. **SBOM** (Software Bill of Materials) -- complete dependency inventory
4. **Automatic security updates** -- Docker rebuilds when base image or deps have CVEs
5. **MCP Toolkit visibility** -- appears in Docker Desktop's built-in MCP catalog
6. **`mcp/` namespace** -- trusted namespace on Docker Hub

### Trade-off

- Option A requires submitting a PR to `docker/mcp-registry` with the source repository reference
- Docker controls the build pipeline; we lose control over exact build timing
- Image updates require updating the source commit hash in `server.yaml`
- Option B gives us full control but lacks security attestations

---

## 4. Dockerfile Specifications

### 4.1 boomerang-proxy Dockerfile

```dockerfile
# ---- Stage 0: Build ----
FROM python:3.11-slim AS builder

RUN pip install --no-cache-dir uv

WORKDIR /build
COPY pyproject.toml ./
COPY README.md ./
COPY src/ ./src/

RUN uv pip install --system --no-cache -e ".[dev]"

# ---- Stage 1: Runtime ----
FROM python:3.11-slim

# Non-root user
RUN addgroup --system --gid 1000 appuser \
    && adduser --system --uid 1000 --ingroup appuser appuser

COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY --from=builder --chown=appuser:appuser /build/src /app/src
COPY --chown=appuser:appuser pyproject.toml README.md /app/

WORKDIR /app
USER appuser

EXPOSE 8123

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8123/health')" || exit 1

ENTRYPOINT ["uvicorn", "boomerang_proxy.main:app", "--host", "0.0.0.0", "--port", "8123"]

# ---- OCI Labels ----
LABEL org.opencontainers.image.title="Boomerang Proxy" \
      org.opencontainers.image.description="OpenAI-compatible proxy for Ollama Cloud with concurrency control, telemetry dashboard, and Prometheus metrics. Listens on port 8123. Run: docker run -p 8123:8123 -e OLLAMA_CLOUD_BASE_URL=https://ollama.com/v1 boomerang-proxy" \
      org.opencontainers.image.version="0.1.0" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/VeeDubin/MCP-Servers" \
      org.opencontainers.image.url="https://github.com/VeeDubin/MCP-Servers/tree/main/boomerang-proxy" \
      org.opencontainers.image.documentation="https://github.com/VeeDubin/MCP-Servers/blob/main/boomerang-proxy/README.md"
```

### 4.2 boomerang-queue Dockerfile

```dockerfile
# ---- Stage 0: Build ----
FROM python:3.11-slim AS builder

RUN pip install --no-cache-dir uv

WORKDIR /build
COPY pyproject.toml ./
COPY README.md ./
COPY src/ ./src/

RUN uv pip install --system --no-cache -e ".[dev]"

# ---- Stage 1: Runtime ----
FROM python:3.11-slim

# Non-root user
RUN addgroup --system --gid 1000 appuser \
    && adduser --system --uid 1000 --ingroup appuser appuser

COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY --from=builder --chown=appuser:appuser /build/src /app/src
COPY --chown=appuser:appuser pyproject.toml README.md /app/

WORKDIR /app
USER appuser

EXPOSE 8000

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request, json; resp = urllib.request.urlopen('http://localhost:8000/health'); assert json.loads(resp).get('status') == 'ok'" || exit 1

# Default to HTTP/SSE mode (Docker Desktop expectation)
ENTRYPOINT ["python", "-m", "boomerang_queue", "--http", "--port", "8000"]

# ---- OCI Labels ----
LABEL org.opencontainers.image.title="Boomerang Queue" \
      org.opencontainers.image.description="FastMCP job queue server for Boomerang-v3 concurrency optimization. Provides 8 MCP tools for job submission, status polling, metrics, and telemetry. Listens on port 8000 (HTTP/SSE) or stdio. Requires PostgreSQL (MEMINI_DB_URL env var). Run: docker run -p 8000:8000 -e MEMINI_DB_URL=postgresql://... boomerang-queue" \
      org.opencontainers.image.version="0.1.0" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/VeeDubin/MCP-Servers" \
      org.opencontainers.image.url="https://github.com/VeeDubin/MCP-Servers/tree/main/boomerang-queue" \
      org.opencontainers.image.documentation="https://github.com/VeeDubin/MCP-Servers/blob/main/boomerang-queue/README.md"
```

### 4.3 memini-ai-dev Dockerfile (Future)

Same pattern as boomerang-queue: two-stage build, python:3.11-slim, non-root user, OCI labels. The memini-ai-dev project already has a Dockerfile; enhance it with these security hardening patterns.

---

## 5. Environment Variable Reference

### 5.1 boomerang-proxy Environment Variables

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `OLLAMA_CLOUD_BASE_URL` | string | `https://ollama.com/v1` | No | Upstream Ollama Cloud API endpoint |
| `OLLAMA_API_KEY` | string | `""` (empty) | No | Optional API key for upstream authentication |
| `PROXY_PORT` | int | `8123` | No | Listen port |
| `PROXY_HOST` | string | `0.0.0.0` | No | Bind address |
| `MAX_CONCURRENT_SLOTS` | int | `3` | No | Maximum concurrent upstream requests |
| `UPSTREAM_TIMEOUT_SECONDS` | float | `60.0` | No | Timeout per upstream request (seconds) |
| `CLIENT_TIMEOUT_SECONDS` | float | `120.0` | No | Client-side timeout (seconds) |
| `MAX_RETRIES` | int | `3` | No | Retry attempts on transient failures |
| `BASE_BACKOFF_SECONDS` | float | `1.0` | No | Exponential backoff base |
| `MAX_BACKOFF_SECONDS` | float | `16.0` | No | Exponential backoff ceiling |
| `LOG_LEVEL` | string | `INFO` | No | Logging level (DEBUG, INFO, WARNING, ERROR) |
| `METRICS_ENABLED` | bool | `true` | No | Enable Prometheus metrics at `/metrics` |
| `DASHBOARD_ENABLED` | bool | `true` | No | Enable telemetry dashboard at `/dashboard` |
| `TELEMETRY_ENABLED` | bool | `true` | No | Persist telemetry to PostgreSQL |
| `TELEMETRY_DB_URL` | string | `{env:TELEMETRY_DB_URL}` | Conditional | PostgreSQL URL for telemetry (required if `TELEMETRY_ENABLED=true`) |

### 5.2 boomerang-queue Environment Variables

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `MEMINI_DB_URL` | string | `{env:MEMINI_DB_URL}` | **Yes** | PostgreSQL connection URL (shared with memini-ai) |
| `BOOMERANG_TENANT_ID` | string | `default` | No | Tenant identifier for multi-tenant isolation |
| `LOG_LEVEL` | string | `INFO` | No | Logging level (DEBUG, INFO, WARNING, ERROR) |

### 5.3 memini-ai-dev Environment Variables (Reference)

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `MEMINI_DB_URL` | string | `{env:MEMINI_DB_URL}` | **Yes** | PostgreSQL connection URL (pgvector extension required) |
| `MEMINI_LOG_LEVEL` | string | `INFO` | No | Logging level |

---

## 6. server.yaml Templates (Docker MCP Registry)

### 6.1 boomerang-queue server.yaml

For Option A (Docker-Built) submission to `docker/mcp-registry`:

```yaml
name: boomerang-queue
type: server
meta:
  category: dev-tools
  tags:
    - mcp
    - queue
    - concurrency
    - boomerang
    - ai-agent
    - job-scheduler
about:
  title: Boomerang Queue
  icon: https://raw.githubusercontent.com/VeeDubin/MCP-Servers/main/boomerang-v3/assets/icon-queue.svg
  description: |
    FastMCP job queue server for Boomerang-v3 concurrency optimization.
    Provides 8 MCP tools for job submission, status polling, slot usage,
    metrics aggregation, and telemetry event persistence.
source:
  project: https://github.com/VeeDubin/MCP-Servers
  path: boomerang-queue
  branch: main
run:
  command:
    - python
    - -m
    - boomerang_queue
    - --http
    - --port
    - "8000"
  env:
    LOG_LEVEL: INFO
config:
  description: Configure the connection to your PostgreSQL database and tenant settings
  secrets:
    - name: boomerang_queue.db_password
      env: MEMINI_DB_URL
      description: PostgreSQL connection URL (postgresql://user:password@host:port/dbname)
      required: true
  env:
    - name: BOOMERANG_TENANT_ID
      example: default
      value: "{{boomerang-queue.tenant_id}}"
      description: Tenant identifier for multi-tenant job isolation
  parameters:
    type: object
    required:
      - db_url
    properties:
      db_url:
        type: string
        description: PostgreSQL connection URL
        examples:
          - postgresql://user:password@localhost:5434/postgres  # Set via .env
      tenant_id:
        type: string
        default: default
        description: Tenant identifier for multi-tenant environments
```

### 6.2 For Option B (Self-Provided Image)

If publishing our own image instead of letting Docker build:

```yaml
name: boomerang-queue
type: server
# For Option B, specify the image directly:
# image: jcharles/boomerang-queue:0.1.0
# OR if we create a boomerang org:
# image: boomerang/boomerang-queue:0.1.0
meta:
  category: dev-tools
  tags:
    - mcp
    - queue
    - concurrency
    - boomerang
about:
  title: Boomerang Queue
  icon: https://raw.githubusercontent.com/VeeDubin/MCP-Servers/main/boomerang-v3/assets/icon-queue.svg
  description: |
    FastMCP job queue server for Boomerang-v3 concurrency optimization.
run:
  command:
    - python
    - -m
    - boomerang_queue
    - --http
    - --port
    - "8000"
config:
  description: Configure PostgreSQL connection and tenant settings
  env:
    - name: MEMINI_DB_URL
      example: postgresql://user:password@localhost:5434/postgres  # Set via .env
      value: "{{boomerang-queue.db_url}}"
    - name: BOOMERANG_TENANT_ID
      example: default
      value: "{{boomerang-queue.tenant_id}}"
  parameters:
    type: object
    required:
      - db_url
    properties:
      db_url:
        type: string
        description: PostgreSQL connection URL
      tenant_id:
        type: string
        default: default
```

---

## 7. Multi-Arch Build Plan

### 7.1 Target Architectures

| Architecture | Rationale |
|-------------|-----------|
| `linux/amd64` | All x86_64 Linux hosts, Docker Desktop on Intel/AMD Macs |
| `linux/arm64` | Apple Silicon Macs (Docker Desktop), AWS Graviton, Raspberry Pi 4/5 |

### 7.2 Feasibility

Both services are pure Python with no compiled C extensions in the critical path. The `python:3.11-slim` base image supports both architectures natively. No cross-compilation toolchain needed.

### 7.3 Build Command

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag jcharles/boomerang-queue:0.1.0 \
  --tag jcharles/boomerang-queue:latest \
  --push \
  ./boomerang-queue
```

### 7.4 Manifest Verification

```bash
docker buildx imagetools inspect jcharles/boomerang-queue:0.1.0
# Expected output shows both linux/amd64 and linux/arm64 manifests
```

---

## 8. Versioning Strategy

### 8.1 Semantic Versioning

```
MAJOR.MINOR.PATCH  (e.g., 0.1.0)
  |     |     |
  |     |     +-- Bug fixes, security patches (no API changes)
  |     +-------- New features, non-breaking API additions
  +-------------- Breaking changes, major MCP tool signature changes
```

### 8.2 Docker Tags

| Tag Pattern | Example | When Pushed | Purpose |
|-------------|---------|-------------|---------|
| `latest` | `boomerang-queue:latest` | Every push to `main` | Development/bleeding edge |
| `sha-xxxxxxx` | `boomerang-queue:sha-a1b2c3d` | Every push to `main` | Immutable commit reference |
| `MAJOR` | `boomerang-queue:0` | Tag `v0.x.x` push | Latest stable major |
| `MAJOR.MINOR` | `boomerang-queue:0.1` | Tag `v0.1.x` push | Latest stable minor |
| `MAJOR.MINOR.PATCH` | `boomerang-queue:0.1.0` | Tag `v0.1.0` push | Exact release |

### 8.3 Tagging Workflow

```
git tag v0.1.0  ->  Docker tags: 0, 0.1, 0.1.0
git push main   ->  Docker tags: latest, sha-$(git rev-parse --short HEAD)
```

---

## 9. CI/CD Pipeline

### 9.1 GitHub Actions Workflow

**File**: `.github/workflows/docker-publish.yml`

```yaml
name: "Docker Publish"

on:
  push:
    branches:
      - main
    tags:
      - "v*.*.*"
  pull_request:
    branches:
      - main
  workflow_dispatch:

env:
  REGISTRY: docker.io
  IMAGE_NAMESPACE: jcharles

jobs:
  # ---- boomerang-proxy ----
  build-proxy:
    name: "Build & Push boomerang-proxy"
    runs-on: ubuntu-latest
    if: github.event_name != 'pull_request'
    strategy:
      fail-fast: false
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Extract Docker metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAMESPACE }}/boomerang-proxy
          tags: |
            type=raw,value=latest,enable={{is_default_branch}}
            type=sha,prefix=sha-,format=short
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=semver,pattern={{major}}
          labels: |
            org.opencontainers.image.title=Boomerang Proxy
            org.opencontainers.image.licenses=MIT

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: ./boomerang-proxy
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Generate SBOM
        uses: anchore/sbom-action@v0
        with:
          image: ${{ env.REGISTRY }}/${{ env.IMAGE_NAMESPACE }}/boomerang-proxy:latest
          artifact-name: sbom-boomerang-proxy.spdx.json

  # ---- boomerang-queue ----
  build-queue:
    name: "Build & Push boomerang-queue"
    runs-on: ubuntu-latest
    if: github.event_name != 'pull_request'
    strategy:
      fail-fast: false
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Extract Docker metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAMESPACE }}/boomerang-queue
          tags: |
            type=raw,value=latest,enable={{is_default_branch}}
            type=sha,prefix=sha-,format=short
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=semver,pattern={{major}}
          labels: |
            org.opencontainers.image.title=Boomerang Queue
            org.opencontainers.image.licenses=MIT

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: ./boomerang-queue
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Generate SBOM
        uses: anchore/sbom-action@v0
        with:
          image: ${{ env.REGISTRY }}/${{ env.IMAGE_NAMESPACE }}/boomerang-queue:latest
          artifact-name: sbom-boomerang-queue.spdx.json

  # ---- memini-ai-dev (future) ----
  build-memini:
    name: "Build & Push memini-ai-dev (future)"
    runs-on: ubuntu-latest
    if: false  # Disabled until Dockerfile is production-ready
    strategy:
      fail-fast: false
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Extract Docker metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAMESPACE }}/memini-ai-dev
          tags: |
            type=raw,value=latest,enable={{is_default_branch}}
            type=sha,prefix=sha-,format=short
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=semver,pattern={{major}}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: ./memini-ai-dev
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### 9.2 GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `DOCKERHUB_USERNAME` | Docker Hub username (e.g., `jcharles`) |
| `DOCKERHUB_TOKEN` | Docker Hub personal access token (not password) |

---

## 10. Security Hardening

### 10.1 Dockerfile Hardening Checklist

| Requirement | Implementation | Status |
|-------------|---------------|--------|
| Minimal base image | `python:3.11-slim` (Debian-based, ~50MB smaller than full) | Planned |
| Non-root user | `appuser` (UID 1000, GID 1000), no sudo | Planned |
| No pip cache | `--no-cache-dir` on all pip/uv installs | Planned |
| No shell in CMD | Use `exec` form: `["python", "-m", "boomerang_queue"]` | Planned |
| HEALTHCHECK | 30s interval, 5s timeout, 10s start period, 3 retries | Planned |
| COPY ownership | `--chown=appuser:appuser` on all COPY commands | Planned |
| No secrets in layers | All secrets via environment variables, never in Dockerfile | By design |
| PYTHONUNBUFFERED | `ENV PYTHONUNBUFFERED=1` | Planned |
| Read-only rootfs | Set `read_only: true` in docker-compose, mount `/tmp` as tmpfs | Future |

### 10.2 Image Scanning

```yaml
# Add to CI workflow after build:
- name: Scan image for vulnerabilities
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: ${{ env.REGISTRY }}/${{ env.IMAGE_NAMESPACE }}/boomerang-queue:latest
    format: sarif
    output: trivy-results.sarif
    severity: CRITICAL,HIGH
```

### 10.3 Docker Compose Updates

Update `docker-compose.yml` to pull from registry with security controls:

```yaml
services:
  boomerang-proxy:
    image: jcharles/boomerang-proxy:latest
    container_name: boomerang-proxy
    user: "1000:1000"
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    environment:
      OLLAMA_CLOUD_BASE_URL: https://ollama.com/v1
      PROXY_PORT: 8123
      PROXY_HOST: 0.0.0.0
      MAX_CONCURRENT_SLOTS: 3
    ports:
      - "8123:8123"
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8123/health')"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    restart: unless-stopped

  boomerang-queue:
    image: jcharles/boomerang-queue:latest
    container_name: boomerang-queue
    user: "1000:1000"
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    environment:
      MEMINI_DB_URL: ${MEMINI_DB_URL:-postgresql://user:password@localhost:5434/postgres}
      BOOMERANG_TENANT_ID: default
    ports:
      - "8000:8000"
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request, json; urllib.request.urlopen('http://localhost:8000/health')"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    restart: unless-stopped
```

---

## 11. Docker Hub Namespace Strategy

### 11.1 Recommendation: Personal Namespace Initially

```
jcharles/boomerang-proxy
jcharles/boomerang-queue
jcharles/memini-ai-dev
```

**Rationale**: Fastest path to publication. No organization setup needed. Works immediately with existing Docker Hub account.

### 11.2 Future: Boomerang Organization

```
boomerang/boomerang-proxy
boomerang/boomerang-queue
boomerang/memini-ai-dev
```

**Benefits**: Professional branding, shared credential management, team access. Requires creating a Docker Hub organization (`boomerang`) which needs a unique org name.

### 11.3 Docker MCP Registry (`mcp/` Namespace)

If Option A is accepted for boomerang-queue, Docker publishes to:
```
mcp/boomerang-queue
```

This is the `mcp/` namespace on Docker Hub, managed by Docker. We do not control it directly -- it is updated when the `docker/mcp-registry` PR is merged.

---

## 12. memini-ai-dev Considerations

memini-ai-dev is primarily distributed via PyPI (`pip install memini-ai-dev`). A Docker image is secondary but useful for:

- Docker Desktop MCP Toolkit integration
- Isolated deployment without Python toolchain setup
- CI/CD environments that prefer containers

**Recommendation**: Defer Docker Hub publication for memini-ai-dev until:
1. The pip-installable distribution is stabilized (v0.3.0+)
2. The Dockerfile follows the same security hardening as queue/proxy
3. A decision is made on Option A vs Option B for MCP Registry

---

## 13. Implementation Sequence

| Step | Task | Dependencies | Effort |
|------|------|-------------|--------|
| 1 | Create `boomerang-proxy/Dockerfile` (security-hardened) | None | 1 hour |
| 2 | Update `boomerang-queue/Dockerfile` (security-hardened) | None | 30 min |
| 3 | Create `.github/workflows/docker-publish.yml` | Dockerfiles | 1 hour |
| 4 | Configure `DOCKERHUB_USERNAME` + `DOCKERHUB_TOKEN` secrets | Docker Hub account | 15 min |
| 5 | Push to `main`, verify images on Docker Hub | Steps 1-4 | 15 min |
| 6 | Tag `v0.1.0`, verify versioned tags | Step 5 | 15 min |
| 7 | Create `boomerang-queue/server.yaml` for MCP Registry | Step 6 | 30 min |
| 8 | Submit PR to `docker/mcp-registry` (Option A) | Step 7 | 1 hour + review wait |
| 9 | Update `docker-compose.yml` with registry images | Step 6 | 30 min |
| 10 | Deploy memini-ai-dev Docker image (future) | memini-ai-dev stabilization | TBD |

**Total estimated effort**: ~4.5 hours + Docker MCP Registry review time (1-2 weeks).

---

## Appendix A: Quick Reference Commands

### Build locally
```bash
# Proxy
docker build -t boomerang-proxy:local ./boomerang-proxy

# Queue
docker build -t boomerang-queue:local ./boomerang-queue
```

### Run locally
```bash
# Proxy
docker run -p 8123:8123 -e OLLAMA_CLOUD_BASE_URL=https://ollama.com/v1 boomerang-proxy:local

# Queue (needs PostgreSQL)
docker run -p 8000:8000 -e MEMINI_DB_URL=postgresql://user:password@host.docker.internal:5434/postgres boomerang-queue:local
```

### Inspect multi-arch manifest
```bash
docker buildx imagetools inspect jcharles/boomerang-queue:0.1.0
```

### Test health check
```bash
# Proxy
curl http://localhost:8123/health | jq .

# Queue
curl http://localhost:8000/health | jq .
```

### MCP Registry validation (after PR submission)
```bash
# Clone the registry
git clone https://github.com/docker/mcp-registry
cd mcp-registry

# Validate server.yaml
go run ./cmd/mcp-validate servers/boomerang-queue/server.yaml
```

---

## Appendix B: Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-19 | boomerang-queue via Option A (Docker-Built) | Best security posture; MCP Toolkit integration; Docker handles SBOM/signing |
| 2026-05-19 | boomerang-proxy self-published only | Not an MCP server; cannot participate in MCP Registry |
| 2026-05-19 | memini-ai-dev deferred | Pip-installable distribution is primary; Docker is secondary |
| 2026-05-19 | `python:3.11-slim` base image | Same version as existing queue Dockerfile; slim variant reduces attack surface |
| 2026-05-19 | `jcharles/` namespace initially | No Docker Hub organization overhead; fastest path to publication |
| 2026-05-19 | Semver with git SHA tags | Industry standard; immutability via SHA; user-friendly via semver |
| 2026-05-19 | `linux/amd64` + `linux/arm64` only | Covers 99%+ of Docker users; pure Python means no cross-compile issues |
