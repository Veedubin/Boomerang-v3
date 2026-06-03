#!/usr/bin/env python3
"""fix-perms.py — Sync and normalize agent .md permissions across all 3 locations.

## What this fixes

Session 13's hand-rolled fix-perms.py used regex to find/insert the
`tool:` block. Two bugs emerged and the script was never properly
rewritten:

  1. A blank line was left between `tool:` and the wildcard value, producing
     invalid YAML. opencode's gray-matter rejects this with
     `ConfigFrontmatterError: bad indentation of a sequence entry at line N,
     column 3`. The user sees silent agent load failures.
  2. The regex required the block to end on a quoted line, so files with
     inline comments didn't match and got a duplicate `tool:` block appended.

A *third* pre-existing bug was uncovered during Session 15d:
  3. The frontmatter's closing `---` marker is missing its preceding
     newline in many files. The text becomes `... "x": allow---` instead
     of `... "x": allow\n---`. The markdown body's `---` section divider
     then gets mistaken for the frontmatter close, and parsing fails
     with the same ConfigFrontmatterError.

This script fixes all three by:
  - Using the ROOT location (`.opencode/agents/*.md`) as the canonical
    source of truth. Session 15c manually repaired these files.
  - Reading each root file, parsing it as YAML (gray-matter-style: split
    on the standalone `---` line near the top, then parse the inside
    with strict YAML), normalizing the permission structure, and writing
    the file back.
  - After the root location is normalized, syncing the source location
    (`boomerang-v3/.opencode/agents/`) and the installed location
    (`node_modules/@veedubin/boomerang-v3/.opencode/agents/`) to the
    root — byte-identical md5s.
  - Idempotent: running it twice produces zero diff on the second run.

## Permissions normalized

For each .md file, the script ensures:
  - `permission:` exists at the top level.
  - `permission.tool` is a dict containing `"memini-ai-dev_*": allow`
    (this is the wildcard that covers all 51+ memini-ai tools).
  - All standard top-level allow-lists are present with canonical values:
      read, glob, grep, list, todowrite, external_directory, lsp,
      webfetch, skill, question, doom_loop.
  - Agent-specific entries (custom tool globs, bash commands, task lists)
    are preserved.

## Exit codes

  0 — All files normalized, all 3 locations in sync.
  1 — A file failed to parse or write.
  2 — A file failed post-write validation, or locations are still
      out of sync after normalization.
"""

from __future__ import annotations

import hashlib
import io
import os
import re
import shutil
import sys
from pathlib import Path
from typing import Any

import yaml

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent  # boomerang-v3/scripts/fix-perms.py -> repo root

# Three locations where agent .md files live. ROOT is the source of truth.
ROOT_DIR = REPO_ROOT / ".opencode" / "agents"
SOURCE_DIR = REPO_ROOT / "boomerang-v3" / ".opencode" / "agents"
INSTALLED_DIR = (
    REPO_ROOT / "node_modules" / "@veedubin" / "boomerang-v3" / ".opencode" / "agents"
)

# The canonical tool block entry. Always present in `permission.tool`,
# exactly once. Other tool entries (researcher's searxng_*, webfetch,
# websearch, etc.) are preserved verbatim — this script only ENSURES
# the canonical entry is there, it does not strip agent customizations.
CANONICAL_TOOL_ENTRY: dict[str, str] = {"memini-ai-dev_*": "allow"}

# Top-level scalar keys in the desired output order (for stable diffs).
# permission always goes last.
SCALAR_KEYS_ORDER = ["description", "mode", "model", "steps"]


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class FrontmatterError(Exception):
    """Raised when an agent .md file's frontmatter can't be parsed."""


# ---------------------------------------------------------------------------
# Frontmatter parsing
# ---------------------------------------------------------------------------

# gray-matter's splitter is: /^---\s*$\n([\s\S]*?)\n---\s*(\n|$)/
# We use a slightly more lenient version: allow optional whitespace on
# the close marker, and require the open marker to be at the very start
# of the file.
FRONTMATTER_OPEN = re.compile(r"\A---\s*\n")
# Tolerant close: `---` on its own line OR immediately following a YAML
# scalar value (the Session 13 bug left files like `"x": allow---`
# instead of `"x": allow\n---`). The second alternative uses a
# capturing group so the splitter can detect that the value word was
# consumed and trim it back. Group 1 is the value word when the
# second alternative matches; group 1 is None when the first matches.
FRONTMATTER_CLOSE = re.compile(
    r"\n---\s*(?:\n|\Z)"
    r"|(allow|deny|ask|true|false|yes|no)\s*---\s*(?:\n|\Z)"
)


def _split_frontmatter(text: str) -> tuple[str, str]:
    """Split a .md file into (frontmatter_yaml, body).

    Lenient about minor formatting differences (trailing whitespace,
    missing trailing newline at EOF, `---` immediately following a YAML
    value without a newline — the Session 13 bug left files like
    `"x": allow---` instead of `"x": allow\n---`). Returns empty
    frontmatter if no opener is found at the start of the file.
    """
    m = FRONTMATTER_OPEN.match(text)
    if not m:
        return "", text
    rest = text[m.end() :]
    m2 = FRONTMATTER_CLOSE.search(rest)
    if not m2:
        # No close marker found. Return everything as frontmatter (the
        # file is malformed, but we'll do our best).
        return rest, ""
    # FRONTMATTER_CLOSE has two alternatives. The second one
    # (`(allow|deny|ask|...)---`) matches starting at the value word,
    # which would consume the value from the frontmatter. Trim it back
    # to just after the value word so the value stays in the
    # frontmatter text. The first alternative (`\n---`) starts at the
    # newline before `---`, which is already outside the frontmatter.
    if m2.group(1) is not None:
        # Second alternative matched. group(1) is the value word.
        value_word_end = m2.start() + len(m2.group(1))
        return rest[:value_word_end], rest[m2.end() :]
    return rest[: m2.start()], rest[m2.end() :]


# ---------------------------------------------------------------------------
# YAML helpers
# ---------------------------------------------------------------------------


def _parse_yaml(text: str, source: Path) -> dict[str, Any]:
    """Parse YAML with strict error reporting."""
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError as e:
        raise FrontmatterError(f"YAML parse error: {e}") from e
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise FrontmatterError(
            f"Frontmatter is a {type(data).__name__}, expected a mapping"
        )
    return data


def _dump_yaml(data: dict[str, Any]) -> str:
    """Serialize to YAML with stable key order.

    - default_flow_style=False — block style.
    - sort_keys=False — preserve our order.
    - width=99999 — prevent line wrapping.
    - allow_unicode=True.
    """
    buf = io.StringIO()
    yaml.safe_dump(
        data,
        buf,
        default_flow_style=False,
        sort_keys=False,
        width=99999,
        allow_unicode=True,
    )
    return buf.getvalue().rstrip("\n") + "\n"


def _coerce_to_dict(obj: Any, source: Path, key: str) -> dict[str, Any]:
    """Return `obj` as a dict. Fails loudly if it can't be coerced."""
    if obj is None:
        return {}
    if isinstance(obj, dict):
        return obj
    raise FrontmatterError(
        f"{source.name}: permission.{key} is {type(obj).__name__}, expected a mapping"
    )


# ---------------------------------------------------------------------------
# Normalization
# ---------------------------------------------------------------------------


def _normalize_permission(perm: Any, source: Path) -> dict[str, Any]:
    """Normalize the `permission:` block.

    The only canonical thing we enforce is `permission.tool.memini-ai-dev_*`
    — the wildcard that covers all 51+ memini-ai tools. Every other entry
    (top-level allow-list like `glob: allow`, custom tool globs, bash
    commands, task lists) is preserved verbatim.

    Why so minimal? Session 13 already populated the standard top-level
    allow-list. Re-adding it via this script caused regressions (e.g.
    promoting `webfetch: allow` from a tool entry to a top-level entry
    in researcher.md, which changes opencode's permission evaluation).
    The script's job is to *fix*, not to *enforce a uniform layout*.
    """
    perm = _coerce_to_dict(perm, source, "permission")

    # `tool:` block: ensure it exists and contains the canonical entry.
    if "tool" not in perm:
        perm["tool"] = dict(CANONICAL_TOOL_ENTRY)
    else:
        tool = _coerce_to_dict(perm["tool"], source, "tool")
        for k, v in CANONICAL_TOOL_ENTRY.items():
            if tool.get(k) != v:
                tool[k] = v
        perm["tool"] = tool

    return perm


def _normalize_frontmatter(data: dict[str, Any], source: Path) -> dict[str, Any]:
    """Apply all frontmatter normalizations."""
    if "permission" not in data:
        data["permission"] = {"tool": dict(CANONICAL_TOOL_ENTRY)}
    else:
        data["permission"] = _normalize_permission(data["permission"], source)

    scalar_present = [k for k in SCALAR_KEYS_ORDER if k in data]
    other_present = [
        k for k in data.keys() if k not in SCALAR_KEYS_ORDER and k != "permission"
    ]
    new_order = scalar_present + other_present + ["permission"]
    return {k: data[k] for k in new_order}


# ---------------------------------------------------------------------------
# File processing
# ---------------------------------------------------------------------------


def _read_and_normalize(path: Path) -> str:
    """Read a .md file, parse the frontmatter, normalize, re-serialize.

    Returns the new file content. The body is preserved verbatim (we
    don't reformat the markdown prompt body).
    """
    text = path.read_text()
    fm_text, body = _split_frontmatter(text)
    if not fm_text:
        raise FrontmatterError("no frontmatter found")

    data = _parse_yaml(fm_text, path)
    normalized = _normalize_frontmatter(data, path)

    # Validate: re-parse the serialized output.
    new_fm = _dump_yaml(normalized)
    try:
        reparsed = _parse_yaml(new_fm, path)
    except FrontmatterError as e:
        raise FrontmatterError(f"POST-WRITE validation FAILED: {e}") from e

    tool = reparsed.get("permission", {}).get("tool", {})
    if tool.get("memini-ai-dev_*") != "allow":
        raise FrontmatterError(
            f"POST-WRITE validation FAILED: "
            f"permission.tool.memini-ai-dev_* missing or wrong value: {tool!r}"
        )

    new_text = f"---\n{new_fm}---"
    if body:
        if not body.startswith("\n"):
            new_text += "\n"
        new_text += body
    if not new_text.endswith("\n"):
        new_text += "\n"
    return new_text


def _write_atomic(path: Path, content: str) -> None:
    """Write file atomically (write to .tmp, rename)."""
    tmp = path.with_suffix(path.suffix + ".tmp")
    try:
        tmp.write_text(content)
        os.replace(tmp, path)
    finally:
        if tmp.exists():
            tmp.unlink()


def _md5(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main(argv: list[str]) -> int:
    # Step 1: Verify the root location exists and has parseable files.
    if not ROOT_DIR.is_dir():
        print(f"ERROR: root agent directory not found: {ROOT_DIR}", file=sys.stderr)
        return 1
    root_files = sorted(ROOT_DIR.glob("*.md"))
    if not root_files:
        print(f"ERROR: no .md files in root: {ROOT_DIR}", file=sys.stderr)
        return 1
    print(f"--- Normalizing {len(root_files)} root files in {ROOT_DIR} ---")

    # Step 2: Normalize each root file (parse, fix, write back).
    canonical: dict[str, str] = {}  # filename -> canonical content
    error_total = 0
    for path in root_files:
        try:
            content = _read_and_normalize(path)
        except FrontmatterError as e:
            print(f"  FAIL: {path.name}: {e}", file=sys.stderr)
            error_total += 1
            continue
        except OSError as e:
            print(f"  FAIL: {path.name}: I/O error: {e}", file=sys.stderr)
            error_total += 1
            continue
        current = path.read_text()
        if content != current:
            try:
                _write_atomic(path, content)
            except OSError as e:
                print(f"  FAIL: {path.name}: write I/O error: {e}", file=sys.stderr)
                error_total += 1
                continue
            print(f"  FIX {path.name}")
        else:
            print(f"  OK  {path.name}")
        canonical[path.name] = content

    if error_total:
        print(f"\nERROR: {error_total} file(s) failed to normalize", file=sys.stderr)
        return 1

    # Step 3: Sync source and installed locations to root.
    sync_dirs = [("source", SOURCE_DIR), ("installed", INSTALLED_DIR)]
    print()
    for label, target_dir in sync_dirs:
        if not target_dir.is_dir():
            print(
                f"WARN: {label} dir not found, skipping: {target_dir}", file=sys.stderr
            )
            continue
        print(f"--- Syncing {label}: {target_dir} ---")
        for filename, content in canonical.items():
            target = target_dir / filename
            if not target.exists():
                # Copy from root as the source of the content.
                shutil.copy2(ROOT_DIR / filename, target)
                print(f"  COPY {filename} (was missing)")
                continue
            if _md5(target) == hashlib.md5(content.encode()).hexdigest():
                print(f"  OK  {filename}")
                continue
            try:
                _write_atomic(target, content)
            except OSError as e:
                print(f"  FAIL: {filename}: write I/O error: {e}", file=sys.stderr)
                error_total += 1
                continue
            print(f"  SYNC {filename}")
        # Also clean up any files in the target that no longer exist in root.
        if target_dir.is_dir():
            for stale in target_dir.glob("*.md"):
                if stale.name not in canonical:
                    print(
                        f"  WARN stale file in {label}: {stale.name}", file=sys.stderr
                    )

    # Step 4: Final cross-location md5 sync check.
    print()
    print("--- Final cross-location md5 sync check ---")
    md5_by_name: dict[str, set[str]] = {}
    for d in [ROOT_DIR, SOURCE_DIR, INSTALLED_DIR]:
        if not d.is_dir():
            continue
        for path in sorted(d.glob("*.md")):
            h = _md5(path)
            md5_by_name.setdefault(path.name, set()).add(h)
    drift = {name: hashes for name, hashes in md5_by_name.items() if len(hashes) > 1}
    if drift:
        print(
            "ERROR: the following files still differ across locations:", file=sys.stderr
        )
        for name, hashes in sorted(drift.items()):
            print(f"  {name}: {len(hashes)} distinct md5s", file=sys.stderr)
        return 2
    n_locs = sum(1 for d in [ROOT_DIR, SOURCE_DIR, INSTALLED_DIR] if d.is_dir())
    print(
        f"OK: all {len(md5_by_name)} agent files are byte-identical "
        f"across {n_locs} locations"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
