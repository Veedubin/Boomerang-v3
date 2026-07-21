# Changelog

All notable changes to `@veedubin/boomerang-v3` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.6.5] - 2026-07-21

### Changed
- **README Rewrite**: Replaced changelog-first README with elevator pitch + quickstart + features + architecture. Moved version history to CHANGELOG.md. Updated to reflect boomerang-v3 as the orchestrator layer in the ecosystem.

## [0.6.2] - 2026-07-13

### Fixed
- **`scripts/bumpversion` — neuralgentics marker_file fix**
  The `marker_file` for `@veedubin/neuralgentics` was pointing at
  `neuralgentics/package.json` (the root package), but the GitHub Actions
  `release.yml` publishes from `overlay/packages/opencode/package.json`.
  This caused `--audit` to read the wrong file and miss drift between the
  two package.json files (root drifted to 0.9.0 while overlay was at 0.12.1
  during the Session 45 recovery).
  - Fix: `marker_file` and `canonical_file` now point at
    `neuralgentics/overlay/packages/opencode/package.json`.
  - Also: removed the unused `@neuralgentics/root` fallback entry (dead code
    in production — the actual NPM name is `@veedubin/neuralgentics`).

## [0.6.1] - 2026-07-13

### Fixed
- **`videre-mcp` install method**: switched from a broken local-path install
  to PyPI via `uvx`, fixing the MCP server startup failure.

## [0.6.0] - 2026-07-13

### Added
- **`scripts/bumpversion` — multi-target version bumper (NEW)**
  A single CLI to bump versions, audit drift, and validate consistency across
  PyPI + NPM + GitHub release targets for every release repo in this workspace.
  - Supports 10 release repos: memini-ai-dev, boomerang-queue, boomerang-proxy,
    doc2png, `@veedubin/boomerang-v3`, `@veedubin/neuralgentics`,
    `@veedubin/super-memory-ts`, `@fangjunjie/ssh-mcp-server`, attacklm-dataset,
    attacklm.
  - Modes: `--patch`, `--minor`, `--major`, `--apply`, `--check`, `--list`,
    `--audit`, `--no-network`, `--force-dirty`, `--force-drift`.
  - Drift detection: refuses to bump if any version-tracking file disagrees,
    refuses to run on a dirty tree (unless `--force-dirty`), refuses if files
    are missing.
  - Pre/post-publish audit: compares local `package.json`/`pyproject.toml` vs
    git tag vs PyPI vs NPM and exits non-zero on drift.
  - 29 Python tests in `tests_python/test_bumpversion.py` (533 LOC) covering
    every repo, every mode, drift detection, audit, force flags, edge cases.
  - **Why this exists**: prevents the recurring "I forgot to tag again" failure
    mode that bit memini-ai-dev v0.7.8→v0.7.9 and the related "drift between
    package.json and the tag" bugs across multiple repos. Closes the
    release-discipline gap.
  - **`scripts/bumpversion`** is the compiled bootstrap entry point;
    `scripts/bumpversion.py` is the source (993 LOC, ruff + mypy --strict clean).
- **Step 0: Pre-Question Rule (NEW mandatory protocol step)**
  The orchestrator MUST NOT ask the user a clarifying question until the
  architect has been dispatched to research and design first. Documented in
  `AGENTS.md` under the 8-Step Protocol section, with an explicit
  Enforcement Matrix row.
  - **Rationale**: The user's time is the most expensive resource in the loop.
    Asking "what do you want?" without first researching what already exists
    wastes time and produces worse outcomes.
  - **When this applies**: ambiguous directives, user frustration about what's
    been built, "how should we do X?" without a specified approach, multi-file
    scope.
  - **When this does NOT apply**: precise commands ("commit this"),
    user-specified approaches, "just ask me" / "I'll decide" waivers.
- **`@veedubin/boomerang-release` skill updated** to point at the new
  `bumpversion` CLI. The skill now uses `bumpversion --audit --no-network`
  for pre-commit checks, `bumpversion --list` for repo introspection, and
  `bumpversion --patch --apply` / `--minor` / `--major --apply` for the
  actual bump (instead of hand-editing `package.json` or `pyproject.toml`).

### Changed
- **Agent reasoning budget: `steps: 50` → `steps: 500` across all 14 agents**
  (architect, coder, explorer, tester, linter, git, writer, handoff, init,
  release, scraper, agent-builder, mcp-specialist, researcher). 10x headroom
  for complex multi-file tasks. No code change; metadata-only.
- **`.opencode/opencode.json` cleanup**: removed redundant
  `MEMINI_MODEL_NAME=BAAI/bge-m3` and `MEMINI_ENABLE_RRF=true` env vars from
  the memini-ai-dev block. Both are now auto-detected / always-on (see
  memini-ai-dev v0.7.7: `MEMINI_AUTO_DETECT_MODEL=true`,
  `MEMINI_ENABLE_RRF` is now hard-coded `true`).

### Quality gates
- `npx vitest run` → **131/131 PASS**
- `npx tsc --noEmit` → **0 errors**
- `npx eslint .` → 13 pre-existing errors in `packages/opencode-plugin/` and
  `tests/install-boomerang.test.ts` + `tests/memini-client.test.ts`; **same
  baseline as v0.5.4** (verified by `git stash` + re-lint). Not introduced
  by this release.
- `python3 -m pytest tests_python/` → **29/29 PASS** (new for v0.6.0)
- `ruff check scripts/bumpversion.py` → clean
- `mypy --strict scripts/bumpversion.py` → clean
- `scripts/bumpversion --audit --no-network` → `Local version 0.6.0,
  Git tag: (pending)`. Audit will re-verify post-tag.

### Process notes
- bumpversion was extended from a Python-only script (from the
  `reverse_engineering` workspace) to cover all 10 release repos in this
  workspace, with drift detection + audit + GH release tracking. The
  `boomerang-release` skill was extended to point at the new tool.
- Background: 2026-07-10 (Session 43) the user noted the "I forgot to tag
  again" failure mode and demanded the discipline be made mechanical. v0.6.0
  ships the tool that makes it mechanical.

## [0.5.4] - 2026-06-07

### Fixed
- **Auth/embed fix**: install script was shipping a broken memini-ai config
  (Postgres user `user` instead of `postgres` → `password authentication
  failed for user "user"`) and 10/11 of memini's boolean feature flags were
  ignored because they used the `MEMINI_*`-prefixed name instead of the
  pydantic-settings canonical alias (e.g. `MEMINI_TRUST_ENGINE` → silently
  ignored; `TRUST_ENGINE` → applied). Provider `ollama` was missing
  `api: "openai"` + `apiKey` (Ollama Cloud would 401), and the bundled
  10-model list was missing the 29 other Ollama Cloud models.
- **Fix**: (1) `MCP_TEMPLATES['memini-ai-dev']` switched to canonical env-var
  names + correct `postgresql://postgres:password@…` + added
  `LLM_*/DIALECTIC_LLM_*/MEMINI_PROJECT_ID/DB_SSLMODE/THOUGHT_CHAINS`.
  (2) `PROVIDERS['ollama-cloud']` got `api: "openai"` + `apiKey: <burn-OK
  Ollama key>` + 39 models. (3) Bundled `.opencode/opencode.json` synced to
  match working MCP-Servers config.
- 131/131 vitest pass, 0 typecheck errors, 0 lint errors.

## [0.5.0] - 2026-05-21

### Changed
- **Agent permission overhaul v0.5.0**: replaced wildcard tool patterns
  with explicit allow-lists per agent role. Security improvements:
  `boomerang-release` local-only (no `github-mcp` tools), `boomerang-git`
  gets remote `github-mcp` tools. ~57-73% token reduction per request.

## [0.4.3] - 2026-05-20

### Fixed
- Critical env var mismatch for thought chains: `MEMINI_THOUGHT_CHAINS_ENABLED`
  → `THOUGHT_CHAINS`. The memini-ai server uses `alias="THOUGHT_CHAINS"`
  (not `MEMINI_THOUGHT_CHAINS_ENABLED`). Requires OpenCode restart to load
  the corrected config.

## [0.4.2] - 2026-05-20

### Changed
- Removed deprecated `sequential-thinking` references from README, skills,
  and orchestrator SKILL.md. Added `MEMINI_THOUGHT_CHAINS_ENABLED: "true"`
  to root `opencode.json` (later corrected to `THOUGHT_CHAINS` in v0.4.3).

## [0.4.1] - 2026-05-19

### Changed
- Documentation refreshed, stale version references updated across monorepo.
  `package.json` bumped from v0.4.0 → v0.4.1.

## [0.4.0] - 2026-05-19

### Added
- Lint fixes (13 ESLint errors), context buffer added, telemetry client
  added. 127/127 tests passing, 0 lint errors. Git tag `v0.4.0` pushed.
  npm publish failed: invalid/missing `NPM_PUBLISH_TOKEN` in GitHub Actions
  secrets.

## [0.3.2] - 2026-05-19

### Changed
- Agent bash permissions expanded: `basename`, `diff`, `cp`, `which` added.
  Orchestrator clarified: CAN edit docs, delegates code. Parallel execution
  guidance added. All 30 agent files synced between `.opencode/agents/`
  and `boomerang-v3/.opencode/agents/`.

## [0.3.1] - 2026-05-19

### Added
- Added common bash commands (`ls`, `head`, `tail`, `cat`, `grep`, `find`,
  `cd`, `echo`) to 7 agent permission files. Tag `v0.3.1` pushed to GitHub.

## [0.3.0] - 2026-05-19

### Changed
- Agent permissions overhaul: `mode: subagent` + comprehensive tool
  permissions for all 30 agent files. SQL injection fix in boomerang-queue.
  Phase 3 Ollama Cloud Proxy design doc created. Tag `v0.3.0` pushed to
  GitHub.

## [0.2.8] - 2026-05-19

### Changed
- Ruff formatting pass (isort, whitespace, imports) across 30 files in
  memini-ai-dev. No functional changes. Tag `v0.2.8` pushed to GitHub.

## [3.0.0] - 2026-05-18

### Added
- memini-ai integration: Trust engine, knowledge graph, tiered loading.
  PostgreSQL with pgvector backend. 645 tests passing in memini-ai.

[Unreleased]: https://github.com/VeeDubin/Boomerang-v3/compare/v0.6.5...HEAD
[0.6.5]: https://github.com/VeeDubin/Boomerang-v3/compare/v0.6.2...v0.6.5
[0.6.2]: https://github.com/VeeDubin/Boomerang-v3/compare/v0.6.1...v0.6.2
[0.6.1]: https://github.com/VeeDubin/Boomerang-v3/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/VeeDubin/Boomerang-v3/compare/v0.5.4...v0.6.0
[0.5.4]: https://github.com/VeeDubin/Boomerang-v3/compare/v0.5.0...v0.5.4
[0.5.0]: https://github.com/VeeDubin/Boomerang-v3/compare/v0.4.3...v0.5.0
[0.4.3]: https://github.com/VeeDubin/Boomerang-v3/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/VeeDubin/Boomerang-v3/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/VeeDubin/Boomerang-v3/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/VeeDubin/Boomerang-v3/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/VeeDubin/Boomerang-v3/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/VeeDubin/Boomerang-v3/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/VeeDubin/Boomerang-v3/compare/v0.2.8...v0.3.0
[3.0.0]: https://github.com/VeeDubin/Boomerang-v3/releases/tag/v3.0.0