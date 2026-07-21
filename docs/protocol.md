# The 8-Step Boomerang Protocol

The Boomerang Protocol is **MANDATORY**. It enforces an 8-step state
machine on every task and blocks execution if required steps are
missing.

## State machine

```
IDLE
  -> MEMORY_QUERY     (query memini-ai FIRST)
  -> SEQUENTIAL_THINK (add_thought for complex tasks)
  -> PLAN             (create plan or delegate to architect)
  -> DELEGATE         (OpenCode executes selected agent)
  -> GIT_CHECK        (verify working tree state)
  -> QUALITY_GATES    (lint -> typecheck -> test)
  -> DOC_UPDATE       (track via DocTracker, update at handoff)
  -> MEMORY_SAVE      (save to memory when complete)
  -> COMPLETE
```

| Component | Purpose |
|-----------|---------|
| **ProtocolStateMachine** | Tracks state transitions for logging |
| **ProtocolAdvisor** | Enforces steps and blocks execution if required steps are missing |
| **TaskRunner** | Prompt builder only (no subprocess execution) |
| **DocTracker** | Tracks documentation changes via SHA-256 hash comparison |

## The 8 steps

### 1. Memory Query

MUST call `memini-ai-dev_query_memories` first. No waiver.

### 2. Sequential Thinking

MUST call `memini-ai-dev_add_thought` for complex tasks. No waiver for
complex tasks.

### 3. Plan

MUST create a plan or delegate to the architect for build tasks.
Waiver phrases: `skip planning`, `just do it`, `no plan needed`.

Simple tasks (handoff, status checks, single-file docs) may skip
planning. Build/create/implement tasks ALWAYS require planning.

### 4. Delegate

OpenCode handles agent execution with the Context Package built by the
orchestrator.

### 5. Git Check

MUST verify working tree state before code changes. Waiver: `git is
fine`.

### 6. Quality Gates

MUST run lint → typecheck → test before completion. Waiver: `skip
tests`, `skip gates`.

### 7. Doc Update

MUST update documentation. Waiver: `no docs needed`. Track via
DocTracker; update at handoff.

### 8. Memory Save

MUST save to memory when complete. No waiver.

## Step 0: Pre-Question Rule (Architect Research First)

**The orchestrator MUST NOT ask the user a clarifying question until
the architect has been dispatched to research and design first.**

When a user request is ambiguous, underspecified, or admits multiple
valid approaches:

1. Build a complete Context Package with: the user's verbatim request,
   relevant memini-ai memories, the current code/files in question,
   the user's prior statements of intent (from `HANDOFF.md` /
   `AGENTS.md`), and any constraints.
2. Dispatch `boomerang-architect` with a clear research/design brief
   (read-only, no code changes).
3. Architect returns a written assessment with: (a) what the current
   state actually is, (b) options A/B/C with tradeoffs, (c) a
   recommended option with justification, (d) an implementation plan
   for the next agent.
4. Only then may the orchestrator ask the user a question — and the
   question should be informed by the architect's assessment, not a
   fresh "what do you want?" prompt.

**Rationale:** The user's time is the most expensive resource in the
loop. Asking "what do you want me to do?" without first researching
what already exists, what the code currently does, and what the best
2-3 options are wastes the user's time and produces worse outcomes.

### When this rule applies

- User gives a directive that is open to interpretation ("fix the
  bootstrapper", "make it work better", "I want to be able to...")
- User expresses frustration or confusion about what's been built
  ("WTF did you build?", "I have no idea what this is")
- User asks "how should we do X?" without specifying the approach
- Multiple files / sub-projects are involved and the scope is unclear

### When this rule does NOT apply

- User gives a precise, unambiguous command ("commit this", "delete
  line 42", "run pytest")
- User has already done the design work in a previous turn and we're
  just executing
- The user explicitly says "just ask me" or "I want to decide myself"
- A waiver phrase is in effect

## Strictness levels

| Level | Behaviour |
|-------|----------|
| **lenient** | Log suggestions, auto-fix logged |
| **standard** | Log warnings and suggestions (default) |
| **strict** | BLOCK execution if required steps are missing |

v3.0.0 **blocks execution** if mandatory steps are missing in strict
mode.

## Enforcement matrix

| Step | Requirement | Waiver Phrase |
|------|-------------|---------------|
| 0. Pre-Question Architect | MUST dispatch architect before asking user clarifying questions | "just ask me", "I'll decide", user already specified the approach |
| 1. Memory Query | MUST query memory first | None (always required) |
| 2. Sequential Thinking | MUST think for complex tasks | None (always required for complex) |
| 3. Planning | MUST plan or delegate to architect | "skip planning", "just do it", "no plan needed" |
| 4. Delegate | OpenCode executes | None |
| 5. Git Check | MUST verify working tree | "git is fine" |
| 6. Quality Gates | MUST run lint/typecheck/test | "skip tests", "skip gates" |
| 7. Doc Update | MUST update documentation | "no docs needed" |
| 8. Memory Save | MUST save to memory | None (always required) |

## Waiver phrases (escape hatches)

| Phrase | Effect |
|--------|--------|
| `skip planning` | Skip planning for this turn |
| `just do it` | Skip planning and execute immediately |
| `no plan needed` | Skip planning for simple tasks |
| `skip tests` | Skip running tests |
| `skip gates` | Skip quality gates |
| `git is fine` | Skip git check |
| `--force` | Skip all checks (emergency) |
| `no docs needed` | Skip documentation update |

## Context passing

The orchestrator builds a complete Context Package with:

1. Original user request (verbatim)
2. Task background
3. Relevant files
4. Code snippets
5. Previous decisions & constraints
6. Expected output format
7. Scope boundaries (IN vs OUT of scope)
8. Error handling

### memini-ai Hub

- Query memini-ai BEFORE answering the user
- Save to memini-ai AFTER answering the user
- Pass context DIRECTLY to sub-agents (don't tell them to query memory)
- Sub-agents save detailed work to memory, return thin summaries