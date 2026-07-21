# Agents

Boomerang v3 ships **13 specialist agents**. Each agent has an explicit
allow-list of tools (no wildcards) and a tightly scoped job.

## Roster

| Agent | Skill | Recommended Ollama Cloud Model | Technical Justification |
|-------|-------|------------------------------|------------------------|
| **boomerang** | boomerang-orchestrator | `kimi-k2.6` | Swarm-based task orchestration and proactive autonomous delegation. |
| **boomerang-coder** | boomerang-coder | `glm-5.2` | Flagship for agentic engineering; SOTA on SWE-Bench Pro for complex multi-file generation. |
| **boomerang-architect** | boomerang-architect | `deepseek-v4-pro` | Frontier reasoning with dedicated "thinking modes" for architectural trade-offs. |
| **boomerang-explorer** | boomerang-explorer | `deepseek-v4-flash` | Designed to navigate codebases, trace dependencies, map repo structures. |
| **boomerang-tester** | boomerang-tester | `deepseek-v4-flash` | Massive 1M context window for ingesting deep error logs and codebase context. |
| **boomerang-linter** | boomerang-linter | `qwen3.5:397b` | Optimised for agentic coding workflows; fast syntax formatting and style checks. |
| **boomerang-git** | boomerang-git | `minimax-m3` | Fast and reliable for structured terminal commands. |
| **boomerang-writer** | boomerang-writer | `mistral-large-3:675b` | Frontier instruction following; clean readable Markdown. |
| **boomerang-scraper** | boomerang-scraper | `qwen3.5` | Lightweight generalist with excellent tool-use for data extraction. |
| **boomerang-release** | boomerang-release | `minimax-m3` | Fast 24B model for version bumps and changelogs. |
| **boomerang-agent-builder** | boomerang-agent-builder | `glm-5.2` | Long-horizon tasks and ambiguous problems; ideal for new agent logic. |
| **researcher** | researcher | `kimi-k2.6` | Long-horizon research, data synthesis, multi-step tool execution. |
| **mcp-specialist** | mcp-specialist | `glm-5.2` | SOTA on Terminal-Bench 2.0; best for debugging servers and tool protocols. |

> **Note**: Models are configurable. Use
> `install-agents.js --primary=<model> --secondary=<model>` to customise.
> Model names in agent files use `ollama/<model>` format (no ``
> suffix).

### Lifecycle skills

| Skill | Purpose | Model |
|-------|---------|-------|
| **boomerang-init** | Initialise and personalise agents for a project | `kimi-k2.6` |
| **boomerang-handoff** | Wrap-up session. Updates docs, saves context | `kimi-k2.6` |
| **boomerang-agent-builder** | Build new skills and sub-agents from patterns | `glm-5.2` |

## Mandatory routing matrix

The orchestrator MUST delegate based on these rules. **Code-level
enforced.** No exceptions.

| Task Type | Primary Agent | When to Use | NEVER delegate to |
|-----------|--------------|-------------|-------------------|
| Code implementation | `boomerang-coder` | Writing/editing code, tests, config | `general`, `boomerang-explorer` |
| Architecture/design | `boomerang-architect` | System design, trade-offs, research | `general`, `boomerang-coder` |
| File finding | `boomerang-explorer` | ONLY glob/find operations | Everything else |
| Testing | `boomerang-tester` | Test writing, test execution | `general`, `boomerang-coder` |
| Linting/formatting | `boomerang-linter` | Code style enforcement | Everything else |
| Git operations | `boomerang-git` | Commits, branches, tags | Everything else |
| Documentation | `boomerang-writer` | Markdown, README, docs | `general` |
| Web scraping | `boomerang-scraper` | URL fetching, data extraction | `general` |
| MCP/server debug | `mcp-specialist` | MCP protocol, server issues | `general` |
| Release automation | `boomerang-release` | Version bumps, changelogs | Everything else |

### Enforcement rules

1. **NEVER use `general` agent for code** — `general` is ONLY for
   research/info tasks.
2. **NEVER delegate research to `boomerang-explorer`** — explorer is
   file-finding only.
3. **ALWAYS prefer specialist over generalist** — coder > general for
   code.
4. **If unsure, query memini-ai** — ask memory for which agent handled
   similar tasks.

### Consequences of wrong routing

| Violation | Consequence | Severity |
|-----------|-------------|----------|
| Code to `general` | Context loss, no memory integration, suboptimal code | HIGH |
| Research to `explorer` | Superficial analysis, no knowledge graph, wasted tokens | HIGH |
| Tests to `coder` | Missing coverage, no test infrastructure awareness | MEDIUM |
| Style to `coder` | Inconsistent formatting, linter config ignored | LOW |
| File finding to `architect` | Wasted reasoning cycles on trivial glob operations | LOW |

> Routing errors compound — wrong agent → wrong context → wrong output
> → retry loop. Correct routing on first dispatch saves 2-5x tokens
> and time.

## Agent scope boundaries

| Agent | Scope |
|-------|-------|
| boomerang-explorer | Find files by name/glob ONLY |
| boomerang-architect | Design + Research + Code analysis |
| boomerang-coder | Code implementation |
| boomerang-tester | Test writing |
| boomerang-linter | Quality enforcement |

### Why this matters

- Prevents duplicate work (explorer finds file, architect analyses).
- Ensures proper context for design decisions.
- Uses memini-ai search for efficient research.

## Orchestrator permissions (v3.0.0)

The orchestrator provides **intelligent routing and context building** —
it primarily delegates to sub-agents but CAN edit documentation files
directly (`TASKS.md`, `AGENTS.md`, `CONTEXT.md`, `HANDOFF.md`).

**Orchestrator does:**

- Analyse request and detect task type
- Query memini-ai for relevant context
- Select appropriate agent based on task
- Build rich Context Package with all necessary information
- Edit documentation and todo lists directly
- Return `{agent, systemPrompt, contextPackage, suggestions}` to OpenCode

**Orchestrator delegates:**

- Agent execution → OpenCode (native)
- Code implementation → boomerang-coder
- Testing → boomerang-tester
- Linting → boomerang-linter
- Git operations → boomerang-git
- Multi-file changes → sub-agents
- Complex implementation → boomerang-coder
- Architecture decisions → boomerang-architect

### Parallel execution is mandatory

The orchestrator MUST launch multiple sub-agents simultaneously when
tasks have no dependencies. Examples:

- Linter + Tester for independent validation
- Coder + Writer for code + documentation
- Multiple Coders for unrelated file changes

### Decision threshold

```
Task Size <= 1 file AND <= 20 lines AND deterministic
    -> Orchestrator handles directly

Task Size >  1 file OR  > 20 lines OR  needs analysis
    -> Delegate to appropriate sub-agent
```