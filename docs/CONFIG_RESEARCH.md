# OpenCode Feature Evaluation for boomerang-v3

**Date**: 2026-05-19
**Author**: boomerang-architect (deepseek-v4-pro:cloud)
**Context**: Evaluating 3 OpenCode features identified in the compliance audit for potential integration into boomerang-v3.

---

## 1. Plugin Hooks

### Summary
OpenCode plugins support 25+ lifecycle hooks via TypeScript/JS modules in `.opencode/plugins/`. Boomerang-v3 is already loaded as a plugin (`@veedubin/boomerang-v3` in `opencode.json`). Adding hooks is incremental — just export them from the existing plugin structure. Key hooks: `tool.execute.before`, `tool.execute.after`, `experimental.session.compacting`, `session.compacted`, `session.created`, `file.edited`.

### Pros
- **Compaction hook solves context loss**: `experimental.session.compacting` fires before the LLM compaction prompt is generated, letting us inject boomerang state (task graph, slot usage, queued jobs) that survives context pruning. This directly addresses the context preservation problem from our earlier design work.
- **Routing validation**: `tool.execute.before` can enforce the mandatory routing matrix (e.g., block `general` from editing code, block `explorer` from doing research).
- **No new infrastructure**: Already running as a plugin; hooks are just additional exports.
- **Audit trail**: `tool.execute.after` enables comprehensive tool call logging.

### Cons
- **`experimental.session.compacting` is unstable API**: The `experimental` prefix means the hook signature may break between OpenCode versions. Requires version-pinning and defensive coding.
- **Hook ordering undefined**: Multiple plugins' hooks run in load order; we can't guarantee ours runs first.
- **`tool.execute.before` can't see routing context**: The hook receives raw tool input/output but doesn't have access to the orchestrator's decision state.

### Recommendation: **IMPLEMENT (selectively)**

| Hook | Priority | Use Case |
|------|----------|----------|
| `experimental.session.compacting` | HIGH | Inject boomerang state summary before compaction |
| `tool.execute.before` | HIGH | Validate routing rules |
| `tool.execute.after` | MEDIUM | Log all tool calls for debugging |
| `session.created` | LOW | Initialize boomerang session state |

### Effort Estimate
**4-6 hours** — Add 4 hook exports to existing plugin, test compaction scenarios, verify routing enforcement. ~150 lines of code.

---

## 2. Structured Output (JSON Schema)

### Summary
The `@opencode-ai/sdk` supports `format: { type: "json_schema", schema, retryCount? }` for enforcing structured JSON output from the model. The model uses a `StructuredOutput` tool that retries on validation failure (default 2 retries). Results are accessible via `result.data.info.structured_output`.

### Pros
- **Guaranteed structure**: Validated JSON matching a schema, eliminating parsing errors.
- **SDK-native**: No additional dependencies.
- **Retry mechanism**: `retryCount` handles transient format failures.

### Cons
- **Model adherence varies**: We use 10 Ollama Cloud models with different JSON adherence rates. Retry overhead compounds at our scale (15 sub-agents).
- **Architecture mismatch**: Agent contracts are thin summaries; the rich data (decisions, trade-offs, research) is stored in memini-ai's PostgreSQL backend — already structured.
- **Schema maintenance burden**: 15 agents × 1 output schema each = 15 schemas to define, version, and update as agents evolve.
- **Added latency**: Each retry is an additional round-trip to the model. At 2 retries × 60s avg, worst-case adds 2 minutes per agent call.
- **Markdown convention works**: Our current "## Architectural Plan:" header-based parsing is human-readable and sufficient for orchestrator dispatch.

### Recommendation: **SKIP (revisit Q3 2026)**

The cost-benefit doesn't justify structured output given our architecture. Agent outputs are thin signals; structured data lives in memini-ai. Revisit when Ollama Cloud models have more consistent JSON adherence or when OpenCode adds provider-level structured output enforcement.

### Effort Estimate
**0 hours now**. If revisited: ~8-10 hours for 15 schemas + validation + retry tuning.

---

## 3. Dynamic MCP Registration (POST /mcp)

### Summary
OpenCode server exposes `POST /mcp` to dynamically register MCP servers at runtime, accepting `{ name, config }` with the same schema as static `opencode.json` MCP entries. `GET /mcp` returns status for all registered servers.

### Pros
- **Runtime flexibility**: Could register/unregister MCP servers based on task type.
- **Health-check integration**: Could auto-restart failed MCP servers.
- **Auto-detection**: Could probe for `uvx` path and auto-configure `memini-ai-dev`.

### Cons
- **No current need**: memini-ai-dev is statically configured and working. All 7 MCP servers are stable.
- **uvx path is stable**: The `uvx --from memini-ai-dev memini-ai --stdio` command hasn't changed. Auto-detection solves a non-problem.
- **Adds complexity**: Dynamic registration means managing server lifecycle, reconnection logic, and state synchronization — all for servers that never change.
- **Static config is simpler**: The `opencode.json` approach is declarative, auditable, and version-controlled.
- **If boomerang-queue goes MCP**: Static config is still the right approach — add it to opencode.json, not register at runtime.

### Recommendation: **SKIP**

No current use case justifies dynamic registration. Static config provides audit trail, version control, and simplicity. The one defensible use case (health-check-driven restart) is a separate concern from registration and would require a health-check plugin, not the `POST /mcp` endpoint.

### Effort Estimate
**0 hours**. If a use case emerges: ~3-4 hours for registration logic + tests.

---

## Decision Summary

| Feature | Recommendation | Effort | Rationale |
|---------|---------------|--------|-----------|
| Plugin Hooks | IMPLEMENT (selectively) | 4-6h | Direct value: compaction context preservation + routing enforcement |
| Structured Output | SKIP | 0h | Architecture mismatch; rich data already in memini-ai |
| Dynamic MCP | SKIP | 0h | No use case; static config is simpler and auditable |

### Priority Order
1. Implement `experimental.session.compacting` hook (context preservation)
2. Implement `tool.execute.before` hook (routing validation)
3. Implement `tool.execute.after` hook (audit logging)
4. Revisit structured output when Ollama Cloud JSON adherence improves
5. Keep dynamic MCP on watchlist for health-check integration
