#!/usr/bin/env node

/**
 * install-boomerang.js — Zero-dependency ESM bootstrap script for Boomerang v3
 *
 * Copies agents, skills, AGENTS.md, and deep-merges opencode.json
 * with idempotent SHA-256 checksums.
 *
 * Exit codes: 0 = success, 1 = error, 2 = cancelled
 */

import { readFile, writeFile, mkdir, readdir, stat, rename, rm } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// ─── ANSI Colors ────────────────────────────────────────────

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

const ICON = {
  ok: `${ANSI.green}✅${ANSI.reset}`,
  warn: `${ANSI.yellow}⚠️${ANSI.reset}`,
  err: `${ANSI.red}❌${ANSI.reset}`,
  info: `${ANSI.cyan}ℹ️${ANSI.reset}`,
};

// ─── Provider Presets ────────────────────────────────────────

// Burn-OK Ollama Cloud API key. Safe to ship; rotate via OLLAMA_API_KEY env var if needed.
// Source: /home/jcharles/Projects/MCP-Servers/.opencode/opencode.json
const DEFAULT_OLLAMA_API_KEY = 'YOUR_OLLAMA_CLOUD_API_KEY';

const PROVIDERS = {
  'ollama-cloud': {
    providerId: 'ollama',  // OpenCode provider key (matches root .opencode/opencode.json)
    name: 'Ollama Cloud',
    api: 'openai',
    options: {
      baseURL: 'https://ollama.com/v1',
      apiKey: process.env.OLLAMA_API_KEY || DEFAULT_OLLAMA_API_KEY,
    },
    needsProxy: false,  // 2026-05-27: Ollama Cloud does not enforce the advertised 3-slot limit; proxy is deprecated
    models: {
      'kimi-k2.6': { name: 'Kimi K2.6 (Cloud)' },
      'minimax-m3': { name: 'minimax-m3 (Cloud)' },
      'glm-5.1': { name: 'GLM 5.1 (Cloud)' },
      'deepseek-v4-pro': { name: 'DeepSeek V4 Pro (Cloud)' },
      'deepseek-v4-flash': { name: 'DeepSeek V4 Flash (Cloud)' },
      'minimax-m2.7': { name: 'MiniMax M2.7 (Cloud)' },
      'gemma4:31b': { name: 'Gemma 4 31B (Cloud)' },
      'gemma3:4b': { name: 'Gemma 3 4B (Cloud)' },
      'glm-4.6': { name: 'GLM 4.6 (Cloud)' },
      'qwen3-vl:235b-instruct': { name: 'Qwen3 VL 235B Instruct (Cloud)' },
      'qwen3-coder:480b': { name: 'Qwen3 Coder 480B (Cloud)' },
      'deepseek-v3.2': { name: 'DeepSeek V3.2 (Cloud)' },
      'deepseek-v3.1:671b': { name: 'DeepSeek V3.1 671B (Cloud)' },
      'gemma3:12b': { name: 'Gemma 3 12B (Cloud)' },
      'gemma3:27b': { name: 'Gemma 3 27B (Cloud)' },
      'rnj-1:8b': { name: 'RNJ 1 8B (Cloud)' },
      'glm-4.7': { name: 'GLM 4.7 (Cloud)' },
      'qwen3-next:80b': { name: 'Qwen3 Next 80B (Cloud)' },
      'kimi-k2.5': { name: 'Kimi K2.5 (Cloud)' },
      'kimi-k2-thinking': { name: 'Kimi K2 Thinking (Cloud)' },
      'mistral-large-3:675b': { name: 'Mistral Large 3 675B (Cloud)' },
      'gemini-3-flash-preview': { name: 'Gemini 3 Flash Preview (Cloud)' },
      'qwen3.5:397b': { name: 'Qwen 3.5 397B (Cloud)' },
      'cogito-2.1:671b': { name: 'Cogito 2.1 671B (Cloud)' },
      'gpt-oss:20b': { name: 'GPT-OSS 20B (Cloud)' },
      'gpt-oss:120b': { name: 'GPT-OSS 120B (Cloud)' },
      'minimax-m2.5': { name: 'MiniMax M2.5 (Cloud)' },
      'minimax-m2.1': { name: 'MiniMax M2.1 (Cloud)' },
      'minimax-m2': { name: 'MiniMax M2 (Cloud)' },
      'nemotron-3-super': { name: 'Nemotron 3 Super (Cloud)' },
      'nemotron-3-nano:30b': { name: 'Nemotron 3 Nano 30B (Cloud)' },
      'glm-5': { name: 'GLM 5 (Cloud)' },
      'ministral-3:3b': { name: 'Ministral 3 3B (Cloud)' },
      'ministral-3:8b': { name: 'Ministral 3 8B (Cloud)' },
      'ministral-3:14b': { name: 'Ministral 3 14B (Cloud)' },
      'glm-5.2': { name: 'GLM 5.2 (Cloud)' },
      'kimi-k2.7-code': { name: 'Kimi K2.7 Code (Cloud)' },
      'nemotron-3-ultra': { name: 'Nemotron 3 Ultra (Cloud)' },
    },
  },
  openai: {
    providerId: 'openai',
    npm: 'openai',
    name: 'OpenAI',
    options: { baseURL: 'https://api.openai.com/v1' },
    needsProxy: false,
    models: {
      'gpt-4o': { name: 'GPT-4o' },
      'gpt-4o-mini': { name: 'GPT-4o Mini' },
    },
  },
};

// ─── MCP Server Templates ────────────────────────────────────

// memini-ai env vars use pydantic-settings `Field(alias=...)` for everything EXCEPT
// MEMINI_DB_URL and MEMINI_EMBEDDING_DIM. The canonical names do NOT have a MEMINI_
// prefix (e.g. `TRUST_ENGINE`, not `MEMINI_TRUST_ENGINE`). Previous versions of this
// script used the MEMINI_-prefixed form, which pydantic silently ignored, so most
// feature flags shipped in the OFF state. See memini-ai-dev/src/memini_ai/config.py
// for the canonical alias list.
const MCP_TEMPLATES = {
  'memini-ai-dev': {
    type: 'local',
    command: ['uv', 'run', '--directory', process.env.MEMINI_AI_DIR || '/home/jcharles/Projects/MCP-Servers/memini-ai-dev', 'memini-ai', '--stdio'],
    environment: {
      MEMINI_DB_URL: process.env.MEMINI_DB_URL || 'postgresql://postgres:password@localhost:5434/postgres',
      MEMINI_EMBEDDING_DIM: '384',
      MEMINI_PROJECT_ID: process.env.MEMINI_PROJECT_ID || 'boomerang-v3-install',
      DB_SSLMODE: 'disable',
      TRUST_ENGINE: 'true',
      MEMORY_GRAPH: 'true',
      KG_ENABLED: 'true',
      TIERED_LOADING: 'true',
      AUTO_EXTRACT: 'true',
      PRECOMPRESS: 'true',
      USER_MODELING: 'true',
      DECAY_ENABLED: 'true',
      MULTI_PEER_ENABLED: 'true',
      DIALECTIC_ENABLED: 'true',
      THOUGHT_CHAINS: 'true',
      LLM_PROVIDER: 'ollama-cloud',
      LLM_BASE_URL: 'https://ollama.com/v1',
      LLM_API_KEY: process.env.OLLAMA_API_KEY || DEFAULT_OLLAMA_API_KEY,
      LLM_URL: 'https://ollama.com/v1',
      LLM_MODEL: 'minimax-m3',
      DIALECTIC_LLM_PROVIDER: 'ollama-cloud',
      DIALECTIC_LLM_MODEL: 'minimax-m3',
    },
    timeout: 60000,
    enabled: true,
  },

};

// ─── Default opencode.json Values ───────────────────────────

const DEFAULT_OPENCODE = {
  plugin: ['@veedubin/boomerang-v3'],
  lsp: {
    typescript: { disabled: false, command: ['npx', 'typescript-language-server', '--stdio'] },
    pyright: { disabled: false, command: ['npx', 'pyright-langserver', '--stdio'] },
  },
  formatter: {
    ruff: { command: ['uvx', 'ruff', 'format', '$FILE'] },
    prettier: { disabled: false },
  },
  instructions: ['AGENTS.md'],
  compaction: { auto: true, prune: true, reserved: 10000 },
};

// ─── Utility Functions ───────────────────────────────────────

/**
 * Compute SHA-256 hash of string content (sync, internal use).
 * @param {string} content
 * @returns {string}
 */
function _sha256Sync(content) {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Compute SHA-256 hash of a file (async, for external/testing use).
 * @param {string} filePath - Path to the file
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
async function sha256(filePath) {
  const content = await readFile(filePath, 'utf-8');
  return _sha256Sync(content);
}

/**
 * Recursively deep-merge source into target.
 * - Arrays: concat + dedup (by JSON.stringify)
 * - Objects: recursive merge
 * - Primitives: target value is PRESERVED if it already exists
 * @param {object|null} target
 * @param {object|null} source
 * @returns {object}
 */
function deepMerge(target, source) {
  const t = target && typeof target === 'object' && !Array.isArray(target) ? target : {};
  const s = source && typeof source === 'object' && !Array.isArray(source) ? source : {};

  const result = { ...t };

  for (const key of Object.keys(s)) {
    const targetVal = result[key];
    const sourceVal = s[key];

    if (Array.isArray(sourceVal) && Array.isArray(targetVal)) {
      // Dedup by .name property for objects, or by JSON.stringify for primitives
      const getNameKey = (item) => {
        if (item && typeof item === 'object' && item.name !== undefined) return `__name__:${item.name}`;
        return JSON.stringify(item);
      };

      const seen = new Set(targetVal.map(getNameKey));
      const merged = [...targetVal];
      for (const item of sourceVal) {
        const sig = getNameKey(item);
        if (!seen.has(sig)) {
          seen.add(sig);
          merged.push(item);
        }
      }
      result[key] = merged;
    } else if (sourceVal && typeof sourceVal === 'object' && !Array.isArray(sourceVal) &&
               targetVal && typeof targetVal === 'object' && !Array.isArray(targetVal)) {
      result[key] = deepMerge(targetVal, sourceVal);
    } else if (targetVal !== undefined) {
      // Target already has this key — preserve it
      result[key] = targetVal;
    } else {
      // Target doesn't have this key — add from source
      result[key] = sourceVal;
    }
  }

  return result;
}

/**
 * Config-specific deep merge that follows opencode.json merge rules:
 * - Existing keys are preserved (target wins for primitives)
 * - Arrays are concatenated and deduplicated
 * - Nested objects are recursively merged
 */
function deepMergeConfig(target, source) {
  return deepMerge(target, source);
}

// ─── Flag Parsing ────────────────────────────────────────────

/**
 * Parse CLI arguments into a flags object.
 * Kebab-case flags (e.g. --dry-run) are stored with hyphenated keys.
 * @param {string[]} argv - process.argv or similar
 * @param {string} [cwd] - current working directory (for resolveSource)
 * @returns {object} Parsed flags
 */
function parseFlags(argv, cwd) {
  const flags = {
    provider: undefined,
    primary: undefined,
    secondary: undefined,
    exclude: undefined,
    docker: false,
    'dry-run': false,
    yes: false,
    target: undefined,
    source: undefined,
    help: false,
    init: false,
    upgrade: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--provider':
        flags.provider = argv[++i];
        break;
      case '--primary':
        flags.primary = argv[++i];
        break;
      case '--secondary':
        flags.secondary = argv[++i];
        break;
      case '--exclude':
        flags.exclude = argv[++i]?.split(',').map(s => s.trim()) ?? [];
        break;
      case '--docker':
        flags.docker = true;
        break;
      case '--dry-run':
        flags['dry-run'] = true;
        break;
      case '--yes':
      case '-y':
        flags.yes = true;
        break;
      case '--target':
        flags.target = argv[++i];
        break;
      case '--source':
        flags.source = argv[++i];
        break;
      case '--init':
        flags.init = true;
        break;
      case '--upgrade':
        flags.upgrade = true;
        break;
      case '--help':
      case '-h':
        flags.help = true;
        break;
    }
  }

  return flags;
}

// ─── Source Resolution ───────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolve source directory containing boomerang-v3 files.
 * Priority: --source flag > CWD + /boomerang-v3 > import.meta.url resolution
 * Accepts either a flags object { source?: string } or a plain string path.
 * Returns a fallback path if source cannot be found (does not throw).
 * @param {object|string} flagsOrSource - Parsed flags object or source path string
 * @param {string} [cwd] - Current working directory override
 * @returns {string} Resolved source directory path
 */
function resolveSource(flagsOrSource, cwd) {
  // Extract source path from flags object or use string directly
  const sourcePath = flagsOrSource && typeof flagsOrSource === 'object'
    ? (flagsOrSource.source || null)
    : (typeof flagsOrSource === 'string' ? flagsOrSource : null);

  const workDir = cwd || process.cwd();

  // 1. Explicit source path
  if (sourcePath) {
    const resolved = sourcePath.startsWith('/') ? sourcePath : join(workDir, sourcePath);
    if (existsSync(resolved)) {
      return resolved;
    }
    // Return the path even if it doesn't exist (caller will handle)
    return resolved;
  }

  // 2. CWD + /boomerang-v3
  const cwdSource = join(workDir, 'boomerang-v3');
  if (existsSync(cwdSource) && existsSync(join(cwdSource, '.opencode'))) {
    return cwdSource;
  }

  // 3. import.meta.url resolution (we're in boomerang-v3/scripts/)
  const metaSource = join(__dirname, '..');
  if (existsSync(metaSource) && existsSync(join(metaSource, '.opencode'))) {
    return metaSource;
  }

  // 4. Fallback: return __dirname parent even if .opencode dir is missing
  // This allows tests to proceed without a valid boomerang-v3 layout
  return join(__dirname, '..');
}

// ─── Console Helpers ─────────────────────────────────────────

function logOk(msg) { console.log(`${ICON.ok} ${msg}`); }
function logWarn(msg) { console.log(`${ICON.warn} ${ANSI.yellow}${msg}${ANSI.reset}`); }
function logErr(msg) { console.error(`${ICON.err} ${ANSI.red}${msg}${ANSI.reset}`); }
function logInfo(msg) { console.log(`${ICON.info} ${ANSI.cyan}${msg}${ANSI.reset}`); }

// ─── File Operations (idempotent) ───────────────────────────

/**
 * Back up a file to a timestamped directory.
 * @param {string} filePath - File to back up
 * @param {string} backupDir - Root backup directory
 * @param {string} relPath - Relative path inside the backup directory
 * @returns {Promise<string>} Full backup path
 */
async function backupFile(filePath, backupDir, relPath) {
  const backupPath = join(backupDir, relPath);
  await mkdir(dirname(backupPath), { recursive: true });
  await rename(filePath, backupPath);
  return backupPath;
}

/**
 * Copy a file with SHA-256 idempotency check.
 * @returns {'CREATED'|'SKIPPED'|'UPDATED'}
 */
async function copyFileIdempotent(src, dest, dryRun, backupDir) {
  const srcContent = await readFile(src, 'utf-8');
  const srcHash = _sha256Sync(srcContent);

  if (existsSync(dest)) {
    const destContent = await readFile(dest, 'utf-8');
    const destHash = _sha256Sync(destContent);

    if (srcHash === destHash) {
      return 'SKIPPED';
    }

    // Different content → backup then overwrite
    if (!dryRun) {
      if (backupDir) {
        const rel = relative(dirname(dest), dest) || basename(dest);
        await backupFile(dest, backupDir, rel);
      } else {
        await rename(dest, dest + '.bak');
      }
      await writeFile(dest, srcContent, 'utf-8');
    }
    return 'UPDATED';
  }

  // File missing → create
  if (!dryRun) {
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, srcContent, 'utf-8');
  }
  return 'CREATED';
}

/**
 * Format a UTC timestamp safe for directory names.
 * @returns {string}
 */
function formatBackupTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

// ─── AGENTS.md Merge ────────────────────────────────────────

/**
 * Merge source AGENTS.md into target. If target exists, append boomerang section;
 * otherwise copy the full file.
 * @param {string} targetPath - Path to the target AGENTS.md
 * @param {string} sourcePath - Path to the source AGENTS.md
 * @returns {Promise<void>}
 */
async function mergeAgentsMd(targetPath, sourcePath) {
  const srcContent = await readFile(sourcePath, 'utf-8');
  const srcHash = _sha256Sync(srcContent);

  if (!existsSync(targetPath)) {
    // Target doesn't exist — copy source as-is
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, srcContent, 'utf-8');
    return;
  }

  const destContent = await readFile(targetPath, 'utf-8');
  const destHash = _sha256Sync(destContent);

  if (destHash === srcHash) {
    // Identical — nothing to do
    return;
  }

  // Check if target already has boomerang content — skip if so
  if (destContent.includes('Boomerang') || destContent.includes('boomerang')) {
    // Already has boomerang content — leave unchanged
    return;
  }

  // Append boomerang section with separator
  const merged = destContent.trimEnd() + '\n\n---\n\n' + srcContent;
  await writeFile(targetPath, merged, 'utf-8');
}

// ─── opencode.json Deep Merge ────────────────────────────────

/**
 * Deep-merge opencode.json with provider preset, MCP servers, and defaults.
 * Merge rules:
 *   - $schema: preserve existing
 *   - provider: deep merge by provider name (add new models, preserve existing)
 *   - mcp: shallow merge by server name (skip if in exclude list)
 *   - plugin: concat + dedup
 *   - lsp: shallow merge
 *   - formatter: shallow merge
 *   - instructions: concat + dedup
 *   - compaction: set only if absent
 *   - small_model: set only if absent
 *   - server: set only if absent
 *   - tool_output: set only if absent
 */
function mergeOpencodeConfig(existing, providerName, primary, secondary, exclude) {
  const provider = PROVIDERS[providerName];
  if (!provider) {
    throw new Error(`Unknown provider: ${providerName}. Available: ${Object.keys(PROVIDERS).join(', ')}`);
  }

  // Start with existing or empty object
  const result = existing ? JSON.parse(JSON.stringify(existing)) : {};

  // 1. $schema — preserve existing
  if (!result.$schema) {
    result.$schema = 'https://opencode.ai/config.json';
  }

  // 2. provider — deep merge by provider name
  result.provider = result.provider || {};
  const providerEntry = {
    name: provider.name,
    options: provider.options,
    models: { ...(provider.models) },
  };
  // Only include `npm` for providers that ship a dedicated SDK package
  if (provider.npm) providerEntry.npm = provider.npm;
  // Only include `api` for providers that declare a non-default API style
  if (provider.api) providerEntry.api = provider.api;

  // If --primary or --secondary, mark those specially
  if (primary) {
    // Ensure primary model exists in models list
    if (!providerEntry.models[primary]) {
      providerEntry.models[primary] = { name: primary };
    }
  }
  if (secondary) {
    if (!providerEntry.models[secondary]) {
      providerEntry.models[secondary] = { name: secondary };
    }
  }

  // Deep merge: preserve existing provider entries, add/merge our provider
  const providerKey = provider.providerId || providerName;
  result.provider[providerKey] = deepMerge(result.provider[providerKey] || {}, providerEntry);

  // 3. mcp — shallow merge by server name, skip excluded
  //    Support short names: "queue" matches "boomerang-queue", "memini" matches "memini-ai-dev"
  result.mcp = result.mcp || {};
  for (const [serverName, serverConfig] of Object.entries(MCP_TEMPLATES)) {
    if (exclude.includes(serverName) ||
        exclude.includes(serverName.replace(/-/g, '_')) ||
        exclude.some(ex => serverName.includes(ex))) {
      continue;
    }
    // Shallow merge: preserve existing, add new
    result.mcp[serverName] = result.mcp[serverName] || serverConfig;
  }

  // 4. plugin — concat + dedup
  result.plugin = dedupArray([...(result.plugin || []), ...(DEFAULT_OPENCODE.plugin || [])]);

  // 5. lsp — deep merge (existing wins over defaults)
  result.lsp = deepMerge(result.lsp || {}, DEFAULT_OPENCODE.lsp);

  // 6. formatter — deep merge (existing wins over defaults)
  result.formatter = deepMerge(result.formatter || {}, DEFAULT_OPENCODE.formatter);

  // 7. instructions — concat + dedup
  result.instructions = dedupArray([...(result.instructions || []), ...(DEFAULT_OPENCODE.instructions || [])]);

  // 8. compaction — set only if absent
  result.compaction = result.compaction || DEFAULT_OPENCODE.compaction;

  // 9. small_model — set only if absent
  result.small_model = result.small_model || `${providerKey}/${secondary || primary || Object.keys(provider.models)[0]}`;

  // 10. server — set only if absent
  result.server = result.server || { port: 4096 };

  // 11. tool_output — set only if absent
  result.tool_output = result.tool_output || { max_lines: 10000, max_bytes: 512000 };

  return result;
}

/**
 * Dedup an array using name-based or JSON.stringify comparison.
 * For objects with a .name property, dedup by name.
 * Otherwise dedup by JSON.stringify.
 * @param {Array} arr
 * @returns {Array}
 */
function dedupArray(arr) {
  const seen = new Set();
  const result = [];
  for (const item of arr) {
    const sig = item && typeof item === 'object' && item.name !== undefined
      ? `__name__:${item.name}`
      : JSON.stringify(item);
    if (!seen.has(sig)) {
      seen.add(sig);
      result.push(item);
    }
  }
  return result;
}

// ─── Docker Check (Phase 1 — placeholder) ───────────────────

async function dockerCheck() {
  try {
    const version = execSync('docker --version', { encoding: 'utf-8' }).trim();
    logInfo(`Docker found: ${version}`);
    return true;
  } catch {
    logWarn('Docker not found. Install Docker to use containerized services.');
    return false;
  }
}

function printDockerInstructions() {
  console.log();
  logInfo('Docker Compose Instructions:');
  console.log(`${ANSI.dim}  1. Ensure docker-compose.yml exists in your project root`);
  console.log(`  2. Run: docker compose up -d`);
  console.log(`  3. Verify: docker ps${ANSI.reset}`);
  console.log();
  logWarn('Phase 2 will add automatic docker-compose launch support.');
}

// ─── Help Text ──────────────────────────────────────────────

function printHelp() {
  console.log(`
${ANSI.bold}boomerang install${ANSI.reset} — Bootstrap script for Boomerang v3

${ANSI.bold}USAGE${ANSI.reset}
  node install-boomerang.js [options]

${ANSI.bold}OPTIONS${ANSI.reset}
  --provider <name>     Provider preset: ollama-cloud (default), openai
  --primary <model>     Primary model (e.g., kimi-k2.6)
  --secondary <model>   Secondary model (e.g., glm-5.2)
  --exclude <list>      Comma-separated services to skip: memini-ai-dev
  --docker              Check Docker and print compose instructions
  --dry-run             Preview changes without writing files
  --yes, -y             Skip confirmation prompts
  --target <path>       Target project directory (default: CWD)
  --source <path>       Source boomerang-v3 directory (auto-detected)
  --help, -h            Show this help message

${ANSI.bold}EXIT CODES${ANSI.reset}
  0  Success
  1  Error
  2  Cancelled by user

${ANSI.bold}PROVIDERS${ANSI.reset}
  ollama-cloud   10 models, needsProxy=false, baseURL=https://ollama.com/v1
  openai          2 models, needsProxy=false

${ANSI.bold}EXAMPLES${ANSI.reset}
  node install-boomerang.js                    # Install with defaults
  node install-boomerang.js --dry-run          # Preview changes
  node install-boomerang.js --provider openai   # Use OpenAI provider
  node install-boomerang.js --exclude memini-ai-dev  # Skip memini-ai-dev MCP
  node install-boomerang.js --yes              # Non-interactive
`);
}

// ─── Main Install Logic ─────────────────────────────────────

async function main() {
  const flags = parseFlags(process.argv.slice(2));

  if (flags.help) {
    printHelp();
    process.exit(0);
  }

  console.log(`\n${ANSI.bold}${ANSI.cyan}🪃 Boomerang v3 Installer${ANSI.reset}\n`);

  // ── Resolve source ──
  const sourceDir = resolveSource(flags);
  logOk(`Source: ${sourceDir}`);

  // ── Resolve target ──
  const targetDir = flags.target
    ? (flags.target.startsWith('/') ? flags.target : join(process.cwd(), flags.target))
    : process.cwd();
  logInfo(`Target: ${targetDir}`);

  // ── Validate provider ──
  const providerName = flags.provider || 'ollama-cloud';
  if (!PROVIDERS[providerName]) {
    logErr(`Unknown provider: ${providerName}. Available: ${Object.keys(PROVIDERS).join(', ')}`);
    process.exit(1);
  }
  logInfo(`Provider: ${providerName}`);

  // ── Choose mode ──
  const mode = flags.upgrade ? 'upgrade' : 'init';

  // ── Confirm (unless --yes or --dry-run) ──
  if (!flags.yes && !flags['dry-run']) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const verb = mode === 'upgrade' ? 'Upgrade' : 'Install';
    const answer = await rl.question(`\n${verb} boomerang-v3 in ${targetDir}? [y/N] `);
    rl.close();
    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      logWarn(`${verb} cancelled.`);
      process.exit(2);
    }
  }

  if (flags['dry-run']) {
    logInfo(`${ANSI.bold}DRY RUN MODE${ANSI.reset} — no files will be written.\n`);
  }

  // ── Run the selected mode ──
  let summary;
  if (mode === 'upgrade') {
    summary = await runUpgrade(sourceDir, targetDir, providerName, flags);
  } else {
    summary = await runInit(sourceDir, targetDir, providerName, flags);
  }

  // ── Docker check (Phase 1 — informational only) ──
  if (flags.docker) {
    logInfo('Checking Docker...');
    const dockerAvailable = await dockerCheck();
    if (dockerAvailable) {
      printDockerInstructions();
    }
  }

  // ── Print Summary ──
  printSummary(summary, flags, mode);

  process.exit(summary.errors.length > 0 ? 1 : 0);
}

/**
 * Run a fresh init (default) install.
 */
async function runInit(sourceDir, targetDir, providerName, flags) {
  const summary = emptySummary();

  const agentsSrcDir = join(sourceDir, '.opencode', 'agents');
  const agentsDestDir = join(targetDir, '.opencode', 'agents');
  const skillsSrcDir = join(sourceDir, '.opencode', 'skills');
  const skillsDestDir = join(targetDir, '.opencode', 'skills');
  const agentsMdSrc = join(sourceDir, 'AGENTS.md');
  const agentsMdDest = join(targetDir, 'AGENTS.md');
  const opencodeJsonDest = join(targetDir, '.opencode', 'opencode.json');

  await installAgents(agentsSrcDir, agentsDestDir, flags['dry-run'], summary);
  await installSkills(skillsSrcDir, skillsDestDir, flags['dry-run'], summary);
  await installAgentsMdInit(agentsMdSrc, agentsMdDest, flags['dry-run'], summary);
  await installOpencodeJsonInit(opencodeJsonDest, providerName, flags, summary);

  const verificationPassed = await verifyInstall(agentsDestDir, skillsDestDir, opencodeJsonDest, summary, flags);
  summary.verificationPassed = verificationPassed;

  return summary;
}

/**
 * Run an upgrade: idempotent hash checks, timestamped backups, replace strategy for AGENTS.md.
 */
async function runUpgrade(sourceDir, targetDir, providerName, flags) {
  const summary = emptySummary();
  const backupTimestamp = formatBackupTimestamp();
  const backupDir = join(targetDir, '.opencode', '.boomerang-backup', backupTimestamp);
  summary.backupDir = backupDir;

  const agentsSrcDir = join(sourceDir, '.opencode', 'agents');
  const agentsDestDir = join(targetDir, '.opencode', 'agents');
  const skillsSrcDir = join(sourceDir, '.opencode', 'skills');
  const skillsDestDir = join(targetDir, '.opencode', 'skills');
  const agentsMdSrc = join(sourceDir, 'AGENTS.md');
  const agentsMdDest = join(targetDir, 'AGENTS.md');
  const opencodeJsonDest = join(targetDir, '.opencode', 'opencode.json');

  await upgradeAgents(agentsSrcDir, agentsDestDir, flags['dry-run'], summary, backupDir);
  await upgradeSkills(skillsSrcDir, skillsDestDir, flags['dry-run'], summary, backupDir);
  await upgradeAgentsMd(agentsMdSrc, agentsMdDest, flags['dry-run'], summary, backupDir);
  await upgradeOpencodeJson(opencodeJsonDest, providerName, flags, summary, backupDir);

  // Upgrades do not verify counts; just validate JSON
  if (existsSync(opencodeJsonDest) && !flags['dry-run']) {
    try {
      const raw = await readFile(opencodeJsonDest, 'utf-8');
      JSON.parse(raw);
      logOk('opencode.json: valid JSON');
    } catch (e) {
      summary.errors.push(`opencode.json: INVALID JSON — ${e.message}`);
      logErr(`opencode.json: INVALID JSON — ${e.message}`);
    }
  }

  return summary;
}

function emptySummary() {
  return {
    agents: { created: 0, skipped: 0, updated: 0, total: 0 },
    skills: { created: 0, skipped: 0, updated: 0, total: 0 },
    agentsMd: '',
    opencodeJson: '',
    errors: [],
    verificationPassed: true,
    backupDir: undefined,
  };
}

async function installAgents(agentsSrcDir, agentsDestDir, dryRun, summary) {
  logInfo('Installing agent files...');
  try {
    const agentFiles = await readdir(agentsSrcDir);
    const mdFiles = agentFiles.filter(f => f.endsWith('.md'));
    summary.agents.total = mdFiles.length;

    for (const file of mdFiles) {
      const src = join(agentsSrcDir, file);
      const dest = join(agentsDestDir, file);
      try {
        const result = await copyFileIdempotent(src, dest, dryRun);
        summary.agents[result.toLowerCase()]++;
        if (dryRun) {
          console.log(`  ${result === 'CREATED' ? ICON.info : result === 'SKIPPED' ? ICON.ok : ICON.warn} [DRY] ${file}: ${result}`);
        } else {
          logOk(`Agent ${file}: ${result}`);
        }
      } catch (e) {
        summary.errors.push(`Agent ${file}: ${e.message}`);
        logErr(`Failed to copy agent ${file}: ${e.message}`);
      }
    }
  } catch (e) {
    summary.errors.push(`Agents directory: ${e.message}`);
    logErr(`Cannot read agents directory: ${e.message}`);
  }
}

async function upgradeAgents(agentsSrcDir, agentsDestDir, dryRun, summary, backupDir) {
  logInfo('Upgrading agent files...');
  try {
    const agentFiles = await readdir(agentsSrcDir);
    const mdFiles = agentFiles.filter(f => f.endsWith('.md'));
    summary.agents.total = mdFiles.length;

    for (const file of mdFiles) {
      const src = join(agentsSrcDir, file);
      const dest = join(agentsDestDir, file);
      try {
        const result = await copyFileIdempotent(src, dest, dryRun, backupDir);
        summary.agents[result.toLowerCase()]++;
        if (dryRun) {
          console.log(`  ${result === 'CREATED' ? ICON.info : result === 'SKIPPED' ? ICON.ok : ICON.warn} [DRY] ${file}: ${result}`);
        } else {
          logOk(`Agent ${file}: ${result}`);
        }
      } catch (e) {
        summary.errors.push(`Agent ${file}: ${e.message}`);
        logErr(`Failed to upgrade agent ${file}: ${e.message}`);
      }
    }
  } catch (e) {
    summary.errors.push(`Agents directory: ${e.message}`);
    logErr(`Cannot read agents directory: ${e.message}`);
  }
}

async function installSkills(skillsSrcDir, skillsDestDir, dryRun, summary) {
  logInfo('Installing skill files...');
  try {
    const skillDirs = await readdir(skillsSrcDir);
    let skillCount = 0;

    for (const skillDir of skillDirs) {
      const skillSrcPath = join(skillsSrcDir, skillDir);
      const skillStat = await stat(skillSrcPath);

      if (!skillStat.isDirectory()) continue;

      const skillFileSrc = join(skillSrcPath, 'SKILL.md');
      if (!existsSync(skillFileSrc)) continue;

      skillCount++;
      const skillFileDest = join(skillsDestDir, skillDir, 'SKILL.md');

      try {
        const result = await copyFileIdempotent(skillFileSrc, skillFileDest, dryRun);
        summary.skills[result.toLowerCase()]++;
        if (dryRun) {
          console.log(`  ${result === 'CREATED' ? ICON.info : result === 'SKIPPED' ? ICON.ok : ICON.warn} [DRY] ${skillDir}/SKILL.md: ${result}`);
        } else {
          logOk(`Skill ${skillDir}/SKILL.md: ${result}`);
        }
      } catch (e) {
        summary.errors.push(`Skill ${skillDir}: ${e.message}`);
        logErr(`Failed to copy skill ${skillDir}: ${e.message}`);
      }
    }
    summary.skills.total = skillCount;
  } catch (e) {
    summary.errors.push(`Skills directory: ${e.message}`);
    logErr(`Cannot read skills directory: ${e.message}`);
  }
}

async function upgradeSkills(skillsSrcDir, skillsDestDir, dryRun, summary, backupDir) {
  logInfo('Upgrading skill files...');
  try {
    const skillDirs = await readdir(skillsSrcDir);
    let skillCount = 0;

    for (const skillDir of skillDirs) {
      const skillSrcPath = join(skillsSrcDir, skillDir);
      const skillStat = await stat(skillSrcPath);

      if (!skillStat.isDirectory()) continue;

      const skillFileSrc = join(skillSrcPath, 'SKILL.md');
      if (!existsSync(skillFileSrc)) continue;

      skillCount++;
      const skillFileDest = join(skillsDestDir, skillDir, 'SKILL.md');

      try {
        const result = await copyFileIdempotent(skillFileSrc, skillFileDest, dryRun, backupDir);
        summary.skills[result.toLowerCase()]++;
        if (dryRun) {
          console.log(`  ${result === 'CREATED' ? ICON.info : result === 'SKIPPED' ? ICON.ok : ICON.warn} [DRY] ${skillDir}/SKILL.md: ${result}`);
        } else {
          logOk(`Skill ${skillDir}/SKILL.md: ${result}`);
        }
      } catch (e) {
        summary.errors.push(`Skill ${skillDir}: ${e.message}`);
        logErr(`Failed to upgrade skill ${skillDir}: ${e.message}`);
      }
    }
    summary.skills.total = skillCount;
  } catch (e) {
    summary.errors.push(`Skills directory: ${e.message}`);
    logErr(`Cannot read skills directory: ${e.message}`);
  }
}

async function installAgentsMdInit(agentsMdSrc, agentsMdDest, dryRun, summary) {
  logInfo('Installing AGENTS.md...');
  try {
    if (existsSync(agentsMdSrc)) {
      if (dryRun) {
        if (existsSync(agentsMdDest)) {
          summary.agentsMd = 'PRESENT';
          logOk('AGENTS.md: PRESENT (dry run)');
        } else {
          summary.agentsMd = 'CREATED';
          logOk('AGENTS.md: CREATED (dry run)');
        }
      } else {
        await mergeAgentsMd(agentsMdDest, agentsMdSrc);
        summary.agentsMd = 'OK';
        logOk('AGENTS.md: updated');
      }
    } else {
      logWarn('Source AGENTS.md not found, skipping.');
    }
  } catch (e) {
    summary.errors.push(`AGENTS.md: ${e.message}`);
    logErr(`Failed to process AGENTS.md: ${e.message}`);
  }
}

async function upgradeAgentsMd(agentsMdSrc, agentsMdDest, dryRun, summary, backupDir) {
  logInfo('Upgrading AGENTS.md...');
  try {
    if (!existsSync(agentsMdSrc)) {
      logWarn('Source AGENTS.md not found, skipping.');
      return;
    }

    const srcContent = await readFile(agentsMdSrc, 'utf-8');
    const srcHash = _sha256Sync(srcContent);

    if (!existsSync(agentsMdDest)) {
      if (!dryRun) {
        await mkdir(dirname(agentsMdDest), { recursive: true });
        await writeFile(agentsMdDest, srcContent, 'utf-8');
      }
      summary.agentsMd = 'CREATED';
      logOk('AGENTS.md: CREATED');
      return;
    }

    const destContent = await readFile(agentsMdDest, 'utf-8');
    const destHash = _sha256Sync(destContent);

    if (destHash === srcHash) {
      summary.agentsMd = 'SKIPPED';
      logOk('AGENTS.md: SKIPPED (identical)');
      return;
    }

    if (!dryRun) {
      await backupFile(agentsMdDest, backupDir, 'AGENTS.md');
      await writeFile(agentsMdDest, srcContent, 'utf-8');
    }
    summary.agentsMd = 'UPDATED';
    logOk('AGENTS.md: UPDATED');
  } catch (e) {
    summary.errors.push(`AGENTS.md: ${e.message}`);
    logErr(`Failed to process AGENTS.md: ${e.message}`);
  }
}

async function installOpencodeJsonInit(opencodeJsonDest, providerName, flags, summary) {
  logInfo('Merging opencode.json...');
  try {
    let existing = {};
    if (existsSync(opencodeJsonDest)) {
      const raw = await readFile(opencodeJsonDest, 'utf-8');
      existing = JSON.parse(raw);
    }

    const merged = mergeOpencodeConfig(existing, providerName, flags.primary, flags.secondary, flags.exclude || []);
    const mergedJson = JSON.stringify(merged, null, 2) + '\n';

    if (existsSync(opencodeJsonDest)) {
      const existingRaw = await readFile(opencodeJsonDest, 'utf-8');
      if (_sha256Sync(existingRaw) === _sha256Sync(mergedJson)) {
        summary.opencodeJson = 'SKIPPED';
        logOk('opencode.json: SKIPPED (identical)');
      } else {
        if (!flags['dry-run']) {
          await rename(opencodeJsonDest, opencodeJsonDest + '.bak');
          await mkdir(dirname(opencodeJsonDest), { recursive: true });
          await writeFile(opencodeJsonDest, mergedJson, 'utf-8');
        }
        summary.opencodeJson = 'UPDATED';
        logOk('opencode.json: UPDATED');
      }
    } else {
      if (!flags['dry-run']) {
        await mkdir(dirname(opencodeJsonDest), { recursive: true });
        await writeFile(opencodeJsonDest, mergedJson, 'utf-8');
      }
      summary.opencodeJson = 'CREATED';
      logOk('opencode.json: CREATED');
    }
  } catch (e) {
    summary.errors.push(`opencode.json: ${e.message}`);
    logErr(`Failed to process opencode.json: ${e.message}`);
  }
}

async function upgradeOpencodeJson(opencodeJsonDest, providerName, flags, summary, backupDir) {
  logInfo('Upgrading opencode.json...');
  try {
    let existing = {};
    if (existsSync(opencodeJsonDest)) {
      const raw = await readFile(opencodeJsonDest, 'utf-8');
      existing = JSON.parse(raw);
    }

    const merged = mergeOpencodeConfig(existing, providerName, flags.primary, flags.secondary, flags.exclude || []);
    const mergedJson = JSON.stringify(merged, null, 2) + '\n';

    if (existsSync(opencodeJsonDest)) {
      const existingRaw = await readFile(opencodeJsonDest, 'utf-8');
      if (_sha256Sync(existingRaw) === _sha256Sync(mergedJson)) {
        summary.opencodeJson = 'SKIPPED';
        logOk('opencode.json: SKIPPED (identical)');
      } else {
        if (!flags['dry-run']) {
          await backupFile(opencodeJsonDest, backupDir, join('.opencode', 'opencode.json'));
          await mkdir(dirname(opencodeJsonDest), { recursive: true });
          await writeFile(opencodeJsonDest, mergedJson, 'utf-8');
        }
        summary.opencodeJson = 'UPDATED';
        logOk('opencode.json: UPDATED');
      }
    } else {
      if (!flags['dry-run']) {
        await mkdir(dirname(opencodeJsonDest), { recursive: true });
        await writeFile(opencodeJsonDest, mergedJson, 'utf-8');
      }
      summary.opencodeJson = 'CREATED';
      logOk('opencode.json: CREATED');
    }
  } catch (e) {
    summary.errors.push(`opencode.json: ${e.message}`);
    logErr(`Failed to process opencode.json: ${e.message}`);
  }
}

async function verifyInstall(agentsDestDir, skillsDestDir, opencodeJsonDest, summary, flags) {
  logInfo('Verifying installation...');
  let verificationPassed = true;

  if (existsSync(agentsDestDir) && !flags['dry-run']) {
    try {
      const destAgents = (await readdir(agentsDestDir)).filter(f => f.endsWith('.md'));
      if (destAgents.length !== summary.agents.total) {
        logWarn(`Agent count mismatch: expected ${summary.agents.total}, found ${destAgents.length}`);
        verificationPassed = false;
      }
    } catch { /* directory might not exist in dry run */ }
  }

  if (existsSync(skillsDestDir) && !flags['dry-run']) {
    let skillDirCount = 0;
    try {
      const dirs = await readdir(skillsDestDir);
      for (const d of dirs) {
        if (existsSync(join(skillsDestDir, d, 'SKILL.md'))) skillDirCount++;
      }
      if (skillDirCount !== summary.skills.total) {
        logWarn(`Skill count mismatch: expected ${summary.skills.total}, found ${skillDirCount}`);
        verificationPassed = false;
      }
    } catch { /* directory might not exist in dry run */ }
  }

  if (existsSync(opencodeJsonDest) && !flags['dry-run']) {
    try {
      const raw = await readFile(opencodeJsonDest, 'utf-8');
      JSON.parse(raw);
      logOk('opencode.json: valid JSON');
    } catch (e) {
      logErr(`opencode.json: INVALID JSON — ${e.message}`);
      verificationPassed = false;
    }
  }

  return verificationPassed;
}

function printSummary(summary, flags, mode) {
  const title = mode === 'upgrade' ? 'Upgrade Summary' : 'Installation Summary';
  console.log(`\n${ANSI.bold}━━━ ${title} ━━━${ANSI.reset}\n`);

  console.log(`  ${ANSI.bold}Component${ANSI.reset}          ${ANSI.bold}Created${ANSI.reset}  ${ANSI.bold}Skipped${ANSI.reset}  ${ANSI.bold}Updated${ANSI.reset}  ${ANSI.bold}Total${ANSI.reset}`);
  console.log(`  ${'─'.repeat(55)}`);
  console.log(`  Agent files         ${summary.agents.created.toString().padStart(5)}  ${summary.agents.skipped.toString().padStart(5)}  ${summary.agents.updated.toString().padStart(5)}  ${summary.agents.total.toString().padStart(5)}`);
  console.log(`  Skill files         ${summary.skills.created.toString().padStart(5)}  ${summary.skills.skipped.toString().padStart(5)}  ${summary.skills.updated.toString().padStart(5)}  ${summary.skills.total.toString().padStart(5)}`);
  console.log(`  AGENTS.md               ${summary.agentsMd ? '✓' : '-'}                        `);
  console.log(`  opencode.json           ${summary.opencodeJson ? '✓' : '-'}                        `);

  if (summary.backupDir && (summary.agents.updated > 0 || summary.skills.updated > 0 || summary.agentsMd === 'UPDATED' || summary.opencodeJson === 'UPDATED')) {
    console.log(`\n  ${ANSI.cyan}Backups saved to: ${summary.backupDir}${ANSI.reset}`);
  }

  if (summary.errors.length > 0) {
    console.log(`\n  ${ANSI.red}${ANSI.bold}Errors:${ANSI.reset}`);
    for (const err of summary.errors) {
      console.log(`  ${ICON.err} ${err}`);
    }
  }

  console.log();
  if (flags['dry-run']) {
    logInfo('This was a dry run. No files were modified.');
  } else if (summary.verificationPassed !== false && summary.errors.length === 0) {
    logOk(mode === 'upgrade' ? 'Upgrade complete!' : 'Installation complete!');
  } else if (summary.verificationPassed === false) {
    logWarn('Installation completed with verification issues.');
  }

  console.log();
}

// ── Run ──
main().catch(err => {
  logErr(`Unexpected error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});

// ─── Additional Test-Helpers ─────────────────────────────────

/**
 * Return provider presets map with model name arrays for testing.
 * @returns {Record<string, {models: string[]}>}
 */
function getProviderPresets() {
  const result = {};
  for (const [name, config] of Object.entries(PROVIDERS)) {
    result[name] = {
      models: Object.keys(config.models),
    };
  }
  return result;
}

/**
 * Return full provider preset configs (for testing internal fields like providerId).
 * @returns {object} Map of preset name → full config (including providerId, models, options, etc.)
 */
function getProviderPresetsRaw() {
  return PROVIDERS;
}

/**
 * Filter MCP server config by excluding specified service names.
 * @param {object} config - Config object with mcpServers or mcp key
 * @param {string[]} exclude - Service names to exclude
 * @returns {object} Filtered config
 */
function filterExcluded(config, exclude) {
  if (!config || typeof config !== 'object') return config;
  const result = JSON.parse(JSON.stringify(config));

  // Filter mcpServers or mcp keys
  const mcpKey = result.mcpServers ? 'mcpServers' : (result.mcp ? 'mcp' : null);
  if (mcpKey && result[mcpKey]) {
    for (const key of Object.keys(result[mcpKey])) {
      if (exclude.some(ex => key.includes(ex) || ex.includes(key))) {
        delete result[mcpKey][key];
      }
    }
  }

  // Filter plugins array by name
  if (Array.isArray(result.plugins)) {
    result.plugins = result.plugins.filter(p => {
      const name = typeof p === 'object' ? p.name : p;
      return !exclude.some(ex => name.includes(ex));
    });
  }

  return result;
}

/**
 * Check if two config strings differ.
 * @param {string} target - Target config JSON string
 * @param {string} source - Source config JSON string
 * @returns {boolean} true if configs differ
 */
function checkConfigMismatch(target, source) {
  try {
    return JSON.stringify(JSON.parse(target)) !== JSON.stringify(JSON.parse(source));
  } catch {
    return true; // If parsing fails, treat as mismatch
  }
}

// ─── Exports for testing ────────────────────────────────────

export {
  parseFlags,
  resolveSource,
  deepMerge,
  deepMergeConfig,
  sha256,
  getProviderPresets,
  getProviderPresetsRaw,
  filterExcluded,
  mergeAgentsMd,
  checkConfigMismatch,
  PROVIDERS,
};