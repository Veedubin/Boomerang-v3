# Getting Started

This guide walks through installing Boomerang v3, configuring the
Ollama Cloud (or alternative) LLM provider, and wiring up the
memini-ai memory server.

## Prerequisites

- **Node.js** 18+ (22+ recommended)
- **Python** 3.11+ (for memini-ai)
- **PostgreSQL** with [pgvector](https://github.com/pgvector/pgvector)
  (or use the bundled Docker Compose stack from `memini-ai-dev`)
- An **Ollama Cloud** API key, or any OpenAI-compatible endpoint

## Step 1 — Install the plugin

```bash
npm install @veedubin/boomerang-v3
npx @veedubin/boomerang-v3 --setup
```

The `--setup` script (`scripts/install-boomerang.js`) writes:

- `~/.opencode/opencode.json` — global defaults (provider, base agents,
  base MCP servers)
- `./.opencode/opencode.json` — project-specific overrides (agent
  personas, project-specific MCP servers)

This mirrors OpenCode's inheritance model: project config wins on
conflicts, merges otherwise.

### Customising models

By default every agent uses an Ollama Cloud model. To swap models:

```bash
npx @veedubin/boomerang-v3 --setup --primary=kimi-k2.6 --secondary=glm-5.2
```

Or edit `.opencode/opencode.json` directly — every agent `.md` file
references models as `ollama/<model>` (no `:cloud` suffix).

## Step 2 — Configure the LLM provider

The default provider is **Ollama Cloud** (`https://ollama.com/v1`). To
use a different provider — local Ollama, Docker Model Runner, OpenAI,
Anthropic, Google, OpenRouter, or any OpenAI-compatible endpoint — see
the canonical provider-switching guide at
[`docs/providers.md`](https://github.com/Veedubin/MCP-Servers/blob/main/docs/providers.md)
in the workspace root.

The minimum Ollama Cloud block in `.opencode/opencode.json`:

```json
{
  "provider": {
    "ollama": {
      "name": "Ollama Cloud",
      "api": "openai",
      "options": {
        "baseURL": "https://ollama.com/v1",
        "apiKey": "{env:OLLAMA_API_KEY}"
      },
      "models": {
        "kimi-k2.6": { "name": "Kimi K2.6 (Cloud)" },
        "glm-5.2":   { "name": "GLM 5.2 (Cloud)" }
      }
    }
  }
}
```

Set the API key in your shell (never commit it):

```bash
export OLLAMA_API_KEY="your-ollama-cloud-key"
```

### Alternative provider recipes (summary)

The full guide covers five recipes; the headline commands are:

| Provider | baseURL | Notes |
|----------|---------|-------|
| Local Ollama | `http://localhost:11434/v1` | No API key needed |
| Docker Model Runner | `http://localhost:8080/v1` | Local OpenAI-compatible |
| OpenAI | `https://api.openai.com/v1` | `OPENAI_API_KEY` env var |
| OpenRouter | `https://openrouter.ai/api/v1` | One key, many models |
| Custom endpoint | any `…/v1` URL | OpenAI-compatible |

See the
[troubleshooting table](https://github.com/Veedubin/MCP-Servers/blob/main/docs/providers.md#troubleshooting)
for `ProviderModelNotFoundError`, `Provider not found`, and
`401 Unauthorized` errors.

## Step 3 — Wire up memini-ai

memini-ai is a Python FastMCP server with a PostgreSQL/pgvector
backend. Add it to `.opencode/opencode.json`:

```json
{
  "mcp": {
    "memini-ai-dev": {
      "type": "local",
      "command": ["uvx", "--from", "memini-ai-dev", "memini-ai", "--stdio"],
      "environment": {
        "MEMINI_DB_URL": "{env:MEMINI_DB_URL}",
        "MEMINI_EMBEDDING_DIM": "384",
        "TRUST_ENGINE": "true",
        "MEMORY_GRAPH": "true",
        "KG_ENABLED": "true",
        "TIERED_LOADING": "true",
        "AUTO_EXTRACT": "true",
        "PRECOMPRESS": "true",
        "USER_MODELING": "true",
        "DECAY_ENABLED": "true",
        "MULTI_PEER_ENABLED": "true",
        "DIALECTIC_ENABLED": "true",
        "THOUGHT_CHAINS": "true"
      },
      "timeout": 60000,
      "enabled": true
    }
  }
}
```

> **Note**: use the canonical env-var names (`TRUST_ENGINE`,
> `MEMORY_GRAPH`, `THOUGHT_CHAINS`) — not the `MEMINI_*`-prefixed
> names. The pydantic-settings aliases ignore the prefixed form.

### Start PostgreSQL with pgvector

```bash
docker run -d --name postgres-test \
  -e POSTGRES_PASSWORD=password \
  -p 5434:5432 \
  timescale/timescaledb:latest-pg15
```

Then point memini-ai at it:

```bash
export MEMINI_DB_URL="postgresql://postgres:password@localhost:5434/postgres"
```

## Step 4 — Verify

```bash
npm run build
npm run typecheck
npm run lint
npx vitest run
```

All four should pass cleanly. See [Configuration](configuration.md) for
the full env-var reference.

## Next steps

- [Agents](agents.md) — the 13-agent roster and routing matrix
- [Protocol](protocol.md) — the 8-step mandatory protocol
- [Memory](memory.md) — trust engine, memory graph, tiered loading