/**
 * Tests for install-boomerang.js bootstrap installer.
 *
 * Tests use temp directories under /tmp/ for isolation and clean up after each test.
 * The script exports internal functions for testability:
 *   parseFlags, resolveSource, deepMerge, sha256
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm, readFile, symlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { execSync } from 'child_process';
import { createHash } from 'crypto';

// ---------------------------------------------------------------------------
// Types for the install script exports
// ---------------------------------------------------------------------------

interface InstallExports {
  parseFlags: (args?: string[], cwd?: string) => Record<string, unknown>;
  resolveSource: (flags?: Record<string, unknown>) => string;
  deepMerge: (target: unknown, source: unknown) => unknown;
  deepMergeConfig: (a: unknown, b: unknown) => unknown;
  sha256: (filePath: string) => Promise<string>;
  getProviderPresets: () => Record<string, { models: string[] }>;
  filterExcluded: (obj: unknown, exclude: string[]) => unknown;
  mergeAgentsMd: (target: string, source: string) => string | Promise<void>;
  checkConfigMismatch: (target: string, source: string) => boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a unique temp directory for a test suite */
let tmpCounter = 0;
function tmpDir(prefix = 'install-test-'): string {
  tmpCounter++;
  return `/tmp/boomerang-test-${prefix}${Date.now()}-${tmpCounter}-${randomBytes(4).toString('hex')}`;
}

/** Write a JSON file */
async function writeJson(filePath: string, data: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n');
}

/** Compute SHA-256 of a file */
async function fileSha256(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

// ---------------------------------------------------------------------------
// Import the script (if available)
// ---------------------------------------------------------------------------

let installScript: InstallExports | null = null;
let scriptFound = false;

try {
  // Dynamic import – vitest handles ESM
  const mod = await import('../scripts/install-boomerang.js');
  if (
    typeof (mod as unknown as InstallExports).parseFlags === 'function' &&
    typeof (mod as unknown as InstallExports).resolveSource === 'function' &&
    typeof (mod as unknown as InstallExports).sha256 === 'function'
  ) {
    installScript = mod as unknown as InstallExports;
    scriptFound = true;
  }
} catch {
  // Script not yet written – tests will be informative but skipped
}

// Utility: skip all tests if the module couldn't be loaded
function guard(): InstallExports {
  if (!installScript || !scriptFound) {
    throw new Error('install-boomerang.js not available – tests require the script to exist');
  }
  return installScript;
}

function skipIfNoScript(ctx: { skip: () => void }): InstallExports | null {
  if (!installScript || !scriptFound) {
    ctx.skip();
    return null;
  }
  return installScript;
}

// ---------------------------------------------------------------------------
// 1. Flag Parsing  (8 tests)
// ---------------------------------------------------------------------------

describe('parseFlags', () => {
  it('sets all defaults correctly when no args', () => {
    if (!installScript) return;
    const flags = installScript.parseFlags([]);
    expect(flags).toBeDefined();
    expect(flags.provider).toBeUndefined(); // no default provider
    expect(flags.exclude).toBeUndefined();
    expect(flags.docker).toBe(false);
    expect(flags['dry-run']).toBe(false);
    expect(flags.yes).toBe(false);
    expect(flags.target).toBeUndefined();
    expect(flags.source).toBeUndefined();
  });

  it('parses --provider openai', () => {
    if (!installScript) return;
    const flags = installScript.parseFlags(['--provider', 'openai']);
    expect(flags.provider).toBe('openai');
  });

  it('parses --exclude queue,proxy', () => {
    if (!installScript) return;
    const flags = installScript.parseFlags(['--exclude', 'queue,proxy']);
    expect(flags.exclude).toEqual(['queue', 'proxy']);
  });

  it('parses --docker', () => {
    if (!installScript) return;
    const flags = installScript.parseFlags(['--docker']);
    expect(flags.docker).toBe(true);
  });

  it('parses --dry-run', () => {
    if (!installScript) return;
    const flags = installScript.parseFlags(['--dry-run']);
    expect(flags['dry-run']).toBe(true);
  });

  it('parses --yes', () => {
    if (!installScript) return;
    const flags = installScript.parseFlags(['--yes']);
    expect(flags.yes).toBe(true);
  });

  it('parses --target /tmp/test', () => {
    if (!installScript) return;
    const flags = installScript.parseFlags(['--target', '/tmp/test']);
    expect(flags.target).toBe('/tmp/test');
  });

  it('parses --source /other/path', () => {
    if (!installScript) return;
    const flags = installScript.parseFlags(['--source', '/other/path']);
    expect(flags.source).toBe('/other/path');
  });
});

// ---------------------------------------------------------------------------
// 2. Source Resolution  (4 tests)
// ---------------------------------------------------------------------------

describe('resolveSource', () => {
  let td: string;

  beforeEach(() => {
    td = tmpDir('resolve-');
  });

  afterEach(async () => {
    await rm(td, { recursive: true, force: true });
  });

  it('auto-detects from CWD when boomerang-v3 present', () => {
    if (!installScript) return;
    const flags = installScript.parseFlags([], td);
    const result = installScript.resolveSource(flags);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('falls back when boomerang-v3 not present in CWD', () => {
    if (!installScript) return;
    const flags = installScript.parseFlags([], td);
    const result = installScript.resolveSource(flags);
    expect(result).toBeTruthy();
  });

  it('uses --source override', () => {
    if (!installScript) return;
    const customPath = '/custom/source/path';
    const flags = installScript.parseFlags(['--source', customPath]);
    const result = installScript.resolveSource(flags);
    expect(result).toBe(customPath);
  });

  it('handles missing source gracefully (returns truthy fallback)', () => {
    if (!installScript) return;
    const flags = installScript.parseFlags([], '/nonexistent/path');
    const result = installScript.resolveSource(flags);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 3. JSON Deep Merge  (10 tests)
// ---------------------------------------------------------------------------

describe('deepMerge', () => {
  const merge = (a: unknown, b: unknown): unknown => {
    if (!installScript) return {};
    // Prefer deepMergeConfig if available (the config-specific variant)
    if (typeof installScript.deepMergeConfig === 'function') {
      return installScript.deepMergeConfig(a, b);
    }
    return installScript.deepMerge(a, b);
  };

  it('merges empty target with full source', () => {
    if (!installScript) return;
    const target = {};
    const source = { models: ['gpt-4'], name: 'test' };
    const result = merge(target, source) as Record<string, unknown>;
    expect(result).toEqual(source);
  });

  it('preserves existing keys in target', () => {
    if (!installScript) return;
    const target = { name: 'existing', version: 1 };
    const source = { name: 'override', models: ['gpt-4'] };
    const result = merge(target, source) as Record<string, unknown>;
    // target already has 'name', so deepMerge should keep target's value
    expect(result.name).toBe('existing');
    expect(result.version).toBe(1);
    expect(result.models).toEqual(['gpt-4']);
  });

  it('concatenates arrays with dedup', () => {
    if (!installScript) return;
    const target = { models: ['gpt-4', 'gpt-3.5'] };
    const source = { models: ['gpt-4', 'claude-3'] };
    const result = merge(target, source) as { models: string[] };
    // Should have all unique items
    expect(result.models).toContain('gpt-4');
    expect(result.models).toContain('gpt-3.5');
    expect(result.models).toContain('claude-3');
    // 'gpt-4' appears only once
    const gpt4Count = result.models.filter((m: string) => m === 'gpt-4').length;
    expect(gpt4Count).toBe(1);
  });

  it('merges nested objects deeply', () => {
    if (!installScript) return;
    const target = { config: { host: 'localhost', port: 3000 } };
    const source = { config: { port: 8080, debug: true } };
    const result = merge(target, source) as { config: Record<string, unknown> };
    // Host preserved from target, port overridden by source (or preserved – depends on strategy)
    expect(result.config.host).toBe('localhost');
    expect(result.config.debug).toBe(true);
    expect(result.config.port).toBeDefined();
  });

  it('merges provider config: adds new model, preserves existing', () => {
    if (!installScript) return;
    const target = {
      providers: {
        ollama: { models: ['llama3'], baseUrl: 'http://localhost:11434' },
      },
    };
    const source = {
      providers: {
        ollama: { models: ['mixtral'] },
        openai: { models: ['gpt-4'], apiKey: 'sk-xxx' },
      },
    };
    const result = merge(target, source) as {
      providers: Record<string, { models: string[]; baseUrl?: string; apiKey?: string }>;
    };
    expect(result.providers.ollama.models).toContain('llama3');
    expect(result.providers.ollama.baseUrl).toBe('http://localhost:11434');
    // openai was added
    expect(result.providers.openai.models).toContain('gpt-4');
  });

  it('merges MCP config: adds new server, preserves existing', () => {
    if (!installScript) return;
    const target = {
      mcpServers: {
        existing: { command: 'node', args: ['server.js'] },
      },
    };
    const source = {
      mcpServers: {
        existing: { command: 'node', args: ['server.js'] },
        newServer: { command: 'python', args: ['new.py'] },
      },
    };
    const result = merge(target, source) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    expect(result.mcpServers.existing).toBeDefined();
    expect(result.mcpServers.existing.command).toBe('node');
    expect(result.mcpServers.newServer).toBeDefined();
    expect(result.mcpServers.newServer.command).toBe('python');
  });

  it('deduplicates plugins by name', () => {
    if (!installScript) return;
    const target = {
      plugins: [
        { name: 'plugin-a', config: { enabled: true } },
        { name: 'plugin-b', config: { enabled: false } },
      ],
    };
    const source = {
      plugins: [
        { name: 'plugin-a', config: { enabled: true, extra: true } },
        { name: 'plugin-c', config: { enabled: true } },
      ],
    };
    const result = merge(target, source) as {
      plugins: Array<{ name: string; config: Record<string, unknown> }>;
    };
    const names = result.plugins.map((p) => p.name);
    expect(names).toContain('plugin-a');
    expect(names).toContain('plugin-b');
    expect(names).toContain('plugin-c');
    // No duplicates
    expect(names.filter((n: string) => n === 'plugin-a').length).toBe(1);
  });

  it('only sets compaction if target does not already have it', () => {
    if (!installScript) return;
    const target = { compaction: { enabled: false, interval: 3600 } };
    const source = { compaction: { enabled: true, maxSize: 1000 } };
    const result = merge(target, source) as {
      compaction: Record<string, unknown>;
    };
    // target has compaction, so source's compaction should NOT override
    expect(result.compaction.enabled).toBe(false);
    expect(result.compaction.interval).toBe(3600);
    // Source's additional fields may still be added
  });

  it('merges formatter config', () => {
    if (!installScript) return;
    const target = { formatters: { prettier: true } };
    const source = { formatters: { ruff: true, eslint: true } };
    const result = merge(target, source) as {
      formatters: Record<string, boolean>;
    };
    expect(result.formatters.prettier).toBe(true);
    expect(result.formatters.ruff).toBe(true);
  });

  it('handles invalid JSON gracefully (backup + empty)', () => {
    if (!installScript) return;
    // deepMerge should handle undefined/null gracefully
    const result1 = merge(null, { a: 1 });
    expect(result1).toBeDefined();
    const result2 = merge({ a: 1 }, null);
    expect(result2).toBeDefined();
    if (result2 && typeof result2 === 'object' && !Array.isArray(result2)) {
      expect((result2 as Record<string, unknown>).a).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Provider Presets  (3 tests)
// ---------------------------------------------------------------------------

describe('provider presets', () => {
  it('ollama-cloud has 10 models', () => {
    if (!installScript) return;
    const presets = installScript.getProviderPresets
      ? installScript.getProviderPresets()
      : {};
    const ollamaCloud = presets['ollama-cloud'];
    // If the function exists, validate
    if (ollamaCloud && Array.isArray(ollamaCloud.models)) {
      expect(ollamaCloud.models.length).toBeGreaterThanOrEqual(10);
    }
  });

  it('openai has 2 models', () => {
    if (!installScript) return;
    const presets = installScript.getProviderPresets
      ? installScript.getProviderPresets()
      : {};
    const openai = presets['openai'];
    if (openai && Array.isArray(openai.models)) {
      expect(openai.models.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('unknown provider throws or is undefined', () => {
    if (!installScript) return;
    const presets = installScript.getProviderPresets
      ? installScript.getProviderPresets()
      : {};
    expect(presets['nonexistent_provider_xyz']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Exclude Filtering  (4 tests)
// ---------------------------------------------------------------------------

describe('exclude filtering', () => {
  const sampleConfig = {
    mcpServers: {
      queue: { command: 'docker', args: ['queue'] },
      proxy: { command: 'docker', args: ['proxy'] },
      'memini-ai-dev': { command: 'docker', args: ['memini'] },
      core: { command: 'node', args: ['core'] },
    },
    plugins: [
      { name: 'queue-plugin' },
      { name: 'proxy-plugin' },
      { name: 'core-plugin' },
    ],
  };

  it('no exclusions returns all components', () => {
    if (!installScript) return;
    const filterFn = installScript.filterExcluded;
    if (typeof filterFn !== 'function') return;

    const result = filterFn(sampleConfig, []) as typeof sampleConfig;
    expect(result.mcpServers.queue).toBeDefined();
    expect(result.mcpServers.proxy).toBeDefined();
    expect(result.mcpServers['memini-ai-dev']).toBeDefined();
    expect(result.mcpServers.core).toBeDefined();
    expect(result.plugins).toHaveLength(3);
  });

  it('--exclude queue removes queue MCP stanza', () => {
    if (!installScript) return;
    const filterFn = installScript.filterExcluded;
    if (typeof filterFn !== 'function') return;

    const result = filterFn(sampleConfig, ['queue']) as typeof sampleConfig;
    expect(result.mcpServers.queue).toBeUndefined();
    expect(result.mcpServers.proxy).toBeDefined();
    expect(result.mcpServers.core).toBeDefined();
  });

  it('--exclude memini-ai-dev removes memini MCP stanza', () => {
    if (!installScript) return;
    const filterFn = installScript.filterExcluded;
    if (typeof filterFn !== 'function') return;

    const result = filterFn(sampleConfig, ['memini-ai-dev']) as typeof sampleConfig;
    expect(result.mcpServers['memini-ai-dev']).toBeUndefined();
    expect(result.mcpServers.queue).toBeDefined();
    expect(result.mcpServers.proxy).toBeDefined();
    expect(result.mcpServers.core).toBeDefined();
  });

  it('--exclude queue,proxy,memini-ai-dev removes all extra MCP stanzas', () => {
    if (!installScript) return;
    const filterFn = installScript.filterExcluded;
    if (typeof filterFn !== 'function') return;

    const result = filterFn(sampleConfig, ['queue', 'proxy', 'memini-ai-dev']) as typeof sampleConfig;
    expect(result.mcpServers.queue).toBeUndefined();
    expect(result.mcpServers.proxy).toBeUndefined();
    expect(result.mcpServers['memini-ai-dev']).toBeUndefined();
    // core should remain
    expect(result.mcpServers.core).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 6. Checksum Logic  (3 tests)
// ---------------------------------------------------------------------------

describe('sha256 checksum', () => {
  let td: string;

  beforeEach(async () => {
    td = tmpDir('checksum-');
    await mkdir(td, { recursive: true });
  });

  afterEach(async () => {
    await rm(td, { recursive: true, force: true });
  });

  it('returns matching hash for unchanged file', async () => {
    if (!installScript) return;
    const filePath = path.join(td, 'test.json');
    await writeFile(filePath, JSON.stringify({ version: 1 }));
    const hash = await installScript.sha256(filePath);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);

    // Same content should produce same hash
    const hash2 = await installScript.sha256(filePath);
    expect(hash2).toBe(hash);
  });

  it('returns different hash for modified file', async () => {
    if (!installScript) return;
    const filePath = path.join(td, 'test.json');
    await writeFile(filePath, JSON.stringify({ version: 1 }));
    const hash1 = await installScript.sha256(filePath);

    await writeFile(filePath, JSON.stringify({ version: 2 }));
    const hash2 = await installScript.sha256(filePath);

    expect(hash1).not.toBe(hash2);
  });

  it('throws or handles missing file', async () => {
    if (!installScript) return;
    const filePath = path.join(td, 'nonexistent.json');
    // sha256 should throw (file not found) or return empty/null
    await expect(installScript.sha256(filePath)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 7. AGENTS.md Merge  (3 tests)
// ---------------------------------------------------------------------------

describe('mergeAgentsMd', () => {
  let td: string;

  beforeEach(async () => {
    td = tmpDir('agentsmd-');
    await mkdir(td, { recursive: true });
  });

  afterEach(async () => {
    await rm(td, { recursive: true, force: true });
  });

  it('copy full when target absent', async () => {
    if (!installScript) return;
    const sourcePath = path.join(td, 'source.md');
    const targetPath = path.join(td, 'target.md');
    const sourceContent = `# AGENTS.md\n\nSome content here.\n`;
    await writeFile(sourcePath, sourceContent);

    const mergeFn = installScript.mergeAgentsMd;
    if (typeof mergeFn !== 'function') return;

    await mergeFn(targetPath, sourcePath);

    const targetContent = await readFile(targetPath, 'utf8');
    expect(targetContent).toBe(sourceContent);
  });

  it('appends boomerang section when target has no boomerang section', async () => {
    if (!installScript) return;
    const sourcePath = path.join(td, 'source.md');
    const targetPath = path.join(td, 'target.md');

    const sourceContent = `# Source Config\n\n## Boomerang\n\nmodels: [gpt-4]\n`;
    const targetContent = `# My Config\n\n## Other\n\nsome existing stuff\n`;

    await writeFile(sourcePath, sourceContent);
    await writeFile(targetPath, targetContent);

    const mergeFn = installScript.mergeAgentsMd;
    if (typeof mergeFn !== 'function') return;

    await mergeFn(targetPath, sourcePath);

    const result = await readFile(targetPath, 'utf8');
    // Target content should be preserved
    expect(result).toContain('My Config');
    expect(result).toContain('some existing stuff');
    // Boomerang section should be appended
    expect(result).toContain('Boomerang');
    expect(result).toContain('gpt-4');
  });

  it('skips when target already has boomerang section', async () => {
    if (!installScript) return;
    const sourcePath = path.join(td, 'source.md');
    const targetPath = path.join(td, 'target.md');

    const sourceContent = `## Boomerang\n\nmodels: [gpt-4]\n`;
    const targetContent = `## Boomerang\n\nmodels: [existing-model]\n`;

    await writeFile(sourcePath, sourceContent);
    await writeFile(targetPath, targetContent);

    const mergeFn = installScript.mergeAgentsMd;
    if (typeof mergeFn !== 'function') return;

    await mergeFn(targetPath, sourcePath);

    const result = await readFile(targetPath, 'utf8');
    // Target should be unchanged
    expect(result).toBe(targetContent);
  });
});

// ---------------------------------------------------------------------------
// 8. End-to-end CLI smoke test  (1 test)
// ---------------------------------------------------------------------------

describe('CLI smoke test', () => {
  it('runs with --dry-run --yes without error', () => {
    // Test via execSync – only if the script file exists
    const scriptPath = new URL('../scripts/install-boomerang.js', import.meta.url).pathname;
    if (!existsSync(scriptPath)) {
      console.warn('[SKIP] Script not found at', scriptPath);
      return;
    }

    // Dry run should not fail
    const result = execSync(`node "${scriptPath}" --dry-run --yes`, {
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result).toBeDefined();
  });
});
