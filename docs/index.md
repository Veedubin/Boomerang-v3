# Boomerang v3

Intelligent multi-agent orchestration for [OpenCode](https://opencode.ai),
backed by trust-weighted [memini-ai](https://github.com/Veedubin/memini-ai-dev)
memory.

## Why Boomerang

- **Trust-weighted memory** — every memory carries a 0.0-1.0 trust score
  adjusted by agent and user feedback.
- **Mandatory routing matrix** — code-level enforced task-to-agent
  routing that prevents wasted tokens and duplicate work.
- **8-step protocol** — a mandatory state machine
  (query → think → plan → delegate → git → gates → docs → save) that
  every agent follows on every task.
- **Parallel dispatch** — independent tasks are launched concurrently
  (e.g. linter + tester, coder + writer).
- **13 specialist agents** — orchestrator, architect, coder, explorer,
  tester, linter, git, writer, scraper, release, agent-builder,
  researcher, mcp-specialist — each with an explicit allow-list of
  tools.

## Quickstart

```bash
npm install @veedubin/boomerang-v3
npx @veedubin/boomerang-v3 --setup
```

Then add the plugin to `.opencode/opencode.json`:

```json
{
  "plugin": ["@veedubin/boomerang-v3"],
  "mcp": {
    "memini-ai-dev": {
      "type": "local",
      "command": ["uvx", "--from", "memini-ai-dev", "memini-ai", "--stdio"],
      "enabled": true
    }
  }
}
```

See [Getting Started](getting-started.md) for full bootstrap, provider
config, and env vars.

## Explore

- [Agents](agents.md) — the 13-agent roster and routing matrix
- [Protocol](protocol.md) — the 8-step mandatory protocol
- [Memory](memory.md) — memini-ai trust engine, graph, tiered loading
- [Configuration](configuration.md) — opencode.json provider setup
- [Architecture](architecture.md) — orchestrator-as-decision-layer
- [Concurrency](concurrency.md) — the 3-slot Ollama Cloud bottleneck
- [Changelog](changelog.md) — release history