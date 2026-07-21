# Memory — memini-ai Integration

Boomerang v3 uses [memini-ai](https://github.com/Veedubin/memini-ai-dev)
for memory — a Python FastMCP server with a PostgreSQL/pgvector backend.

| Integration | Description |
|-------------|-------------|
| **Built-in** | Direct memini-ai integration via Python subprocess |
| **MCP (External)** | Standalone MCP server for non-boomerang users |

## How memini-ai works

- memini-ai is a Python FastMCP server with PostgreSQL/pgvector backend
- Boomerang communicates via MCP protocol to `memini-ai-dev` tools
- All memory operations are async via MCP tool calls
- Trust scoring, knowledge graph, and tiered loading are built-in

## Memory operations

All agents SHOULD:

1. **Query memory FIRST** — `memini-ai-dev_query_memories` before work
2. **Use thought chains** — `memini-ai-dev_add_thought` for complex
   tasks
3. **Save results** — `memini-ai-dev_add_memory` when complete

## Trust engine

Every memory starts at `trust=0.5` and is adjusted based on feedback:

| Signal | Trust Adjustment |
|--------|------------------|
| `agent_used` | +0.05 |
| `user_confirmed` | +0.10 |
| `agent_ignored` | -0.05 |
| `user_corrected` | -0.10 |

When saving:

- **Routine work** (logs, quick fixes, explorations): standard
  `memini-ai-dev_add_memory`
- **High-value work** (architectural decisions, session summaries,
  verified successes): `memini-ai-dev_add_memory` with a descriptive
  `project` tag in metadata

When searching:

- Default searches use the configured strategy automatically
- For explicit control: `memini-ai-dev_query_memories` with `strategy`
  parameter (`tiered`, `vector_only`, or `text_only`)

## Memory graph

memini-ai tracks relationships between memories:

| Relationship | Description |
|-------------|-------------|
| `SUPERSEDES` | New memory replaces old one |
| `RELATED_TO` | Memories are semantically related |
| `CONTRADICTS` | Memories conflict |
| `DERIVED_FROM` | Memory was derived from another |

Tools for working with the graph:

| Tool | When to use |
|------|-------------|
| `memini-ai-dev_find_related_memories` | Find memories linked to a decision |
| `memini-ai-dev_create_relationship` | Link a new memory to related ones |
| `memini-ai-dev_get_relationship_summary` | See all connections for a memory |
| `memini-ai-dev_find_contradictions` | Detect conflicting memories before acting |
| `memini-ai-dev_resolve_contradiction` | Synthesise a resolution for two conflicting memories |
| `memini-ai-dev_challenge_memory` | Submit a counter-argument to a memory |
| `memini-ai-dev_get_dialectic_history` | View argument history for a memory |

## Tiered loading

memini-ai supports tiered memory loading for efficient context use:

| Tier | Description | Use Case |
|------|-------------|----------|
| **L0 Summary** | ~100 tokens, high-trust memories only | Session start |
| **L1 Key Decisions** | ~2K tokens, trust >= 0.8 | Planning |
| **L2 Full Context** | All memories | Deep research |

| Tool | When to use |
|------|-------------|
| `memini-ai-dev_get_tier0_summary` | Session start — quick context |
| `memini-ai-dev_get_tier1_summary` | Planning tasks — key decisions |
| `memini-ai-dev_trigger_extraction` | Auto-extract patterns from conversation |
| `memini-ai-dev_preconpress_extraction` | Capture context before compaction squeeze |

## Knowledge graph

memini-ai includes a knowledge graph for tracking entities and
relationships:

| Tool | Purpose |
|------|---------|
| `memini-ai-dev_query_kg` | Execute formal KG queries |
| `memini-ai-dev_extract_entities` | Extract entities from a memory |
| `memini-ai-dev_get_entity_graph` | Get all connections for an entity |
| `memini-ai-dev_get_inference_chain` | Find inference paths between two entities |
| `memini-ai-dev_search_entities` | Search for entities by name |

## Thought chains

| Tool | When to use |
|------|-------------|
| `memini-ai-dev_add_thought` | Add a reasoning step for complex tasks |
| `memini-ai-dev_start_thought_chain` | Begin a new reasoning chain |
| `memini-ai-dev_get_thought_chain` | Retrieve a chain by ID |
| `memini-ai-dev_get_related_chains` | Find similar reasoning chains |

## Project indexing

| Tool | When to use |
|------|-------------|
| `memini-ai-dev_index_project` | Trigger indexing of the current project |
| `memini-ai-dev_search_project` | Semantic search over indexed code |
| `memini-ai-dev_get_file_contents` | Reconstruct a file from indexed chunks |

## Multi-peer

| Tool | When to use |
|------|-------------|
| `memini-ai-dev_list_peers` | List all known peers |
| `memini-ai-dev_add_peer` | Register a new peer |
| `memini-ai-dev_switch_peer_context` | Switch to a different peer's memory view |
| `memini-ai-dev_share_memory` | Share a memory with another peer |
| `memini-ai-dev_get_peer_memories` | Query another peer's memories (if access) |
| `memini-ai-dev_get_shared_memories` | Get all memories shared with current peer |

## Optional: live visualisation

memini-ai includes a live D3.js visualisation for the knowledge graph:

```bash
cd memini-ai-dev
export MEMINI_DB_URL="postgresql://user:password@localhost:5432/postgres"
uvx --from memini-ai-dev memini-ai --server --port 8000
```

Then open `http://localhost:8000` for the interactive graph
visualisation.