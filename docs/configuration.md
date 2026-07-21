# Configuration

Boomerang v3 is configured through `.opencode/opencode.json`. This page
covers the LLM provider block, the memini-ai MCP server block, and the
environment variables that control memini-ai's behaviour.

## Provider block

The default provider is **Ollama Cloud**. The minimum block:

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
        "kimi-k2.6":        { "name": "Kimi K2.6 (Cloud)" },
        "glm-5.2":          { "name": "GLM 5.2 (Cloud)" },
        "deepseek-v4-pro":  { "name": "DeepSeek V4 Pro (Cloud)" },
        "devstral-2:123b":  { "name": "Devstral 2 123B (Cloud)" },
        "deepseek-v4-flash":{ "name": "DeepSeek V4 Flash (Cloud)" },
        "qwen3-coder-next": { "name": "Qwen3 Coder Next (Cloud)" },
        "minimax-m3":       { "name": "MiniMax M3 (Cloud)" },
        "mistral-large-3:675b": { "name": "Mistral Large 3 675B (Cloud)" },
        "qwen3.5":          { "name": "Qwen3.5 (Cloud)" },
        "devstral-small-2:24b": { "name": "Devstral Small 2 24B (Cloud)" }
      }
    }
  }
}
```

Set the API key in your shell (never commit it):

```bash
export OLLAMA_API_KEY="your-ollama-cloud-key"
```

### Switching providers

To switch to a different provider — local Ollama, Docker Model Runner,
OpenAI, Anthropic, Google, OpenRouter, or any OpenAI-compatible
endpoint — see the canonical provider-switching guide at
[`docs/providers.md`](https://github.com/Veedubin/MCP-Servers/blob/main/docs/providers.md)
in the workspace root. It covers 5 recipes, a quick-reference for just
changing which Ollama Cloud model each agent uses, a 6-step migration
checklist, and a troubleshooting table for the common
`ProviderModelNotFoundError`, `Provider not found`, and `401
Unauthorized` errors.

### Quick reference: change which model each agent uses

If the model already exists in `provider.ollama.models`, a single `sed`
pass over `.opencode/agents/*.md` swaps the model:

```bash
sed -i 's/ollama\/kimi-k2.6/ollama\/glm-5.2/g' .opencode/agents/*.md
```

## memini-ai MCP server block

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

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MEMINI_DB_URL` | PostgreSQL connection URL | Set via `.env` (see `.env.example`) |
| `MEMINI_PROJECT_ID` | Project namespace | auto-generated |
| `MEMINI_EMBEDDING_DIM` | 1024 or 384 | 1024 |
| `MEMINI_DEVICE` | `auto`, `gpu`, or `cpu` | auto |
| `TRUST_ENGINE` | Enable trust scoring | false |
| `MEMORY_GRAPH` | Enable memory graph | false |
| `KG_ENABLED` | Enable knowledge graph | false |
| `TIERED_LOADING` | Enable L0/L1/L2 tiered loading | false |
| `AUTO_EXTRACT` | Auto-extract patterns from conversation | false |
| `PRECOMPRESS` | Capture context before compaction | false |
| `USER_MODELING` | Build a user profile | false |
| `DECAY_ENABLED` | Enable memory trust decay | false |
| `MULTI_PEER_ENABLED` | Enable multi-peer memory sharing | false |
| `DIALECTIC_ENABLED` | Enable dialectic resolution | false |
| `THOUGHT_CHAINS` | Enable structured reasoning chains | false |
| `OLLAMA_API_KEY` | Ollama Cloud API key | (required for Ollama Cloud) |

## Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Build TypeScript to `dist/` |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Run ESLint |
| `npx vitest run` | Run test suite |
| `npm run fix-perms` | Normalise agent `.md` frontmatter (idempotent) |