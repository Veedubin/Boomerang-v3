/**
 * Boomerang Asset Loader v3.0.0
 * 
 * Loads agents and skills from the bundled directories.
 * Self-contained - no cross-package imports.
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { AgentDefinition, SkillDefinition } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cache for loaded assets
let agentsCache: AgentDefinition[] | null = null;
let skillsCache: SkillDefinition[] | null = null;

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): Record<string, string> {
  const frontmatter: Record<string, string> = {};
  const match = content.match(/^---\n([\s\S]*?)\n---/);

  if (!match) {
    return frontmatter;
  }

  const lines = match[1].split('\n');
  let currentKey = '';
  let currentValue = '';
  let inMultiline = false;

  for (const line of lines) {
    if (inMultiline) {
      if (line.startsWith('    ') || line.startsWith('\t')) {
        currentValue += '\n' + line.replace(/^[ ]{4}|^\t/, '');
      } else {
        frontmatter[currentKey] = currentValue.trim();
        inMultiline = false;
      }
    }

    const keyMatch = line.match(/^(\w+):\s*(.*)/);
    if (keyMatch) {
      currentKey = keyMatch[1];
      currentValue = keyMatch[2];

      if (currentValue === '' || currentValue === '|') {
        inMultiline = true;
      } else {
        frontmatter[currentKey] = currentValue.trim();
      }
    }
  }

  return frontmatter;
}

/**
 * Extract content after frontmatter (the main body)
 */
function extractContent(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)/);
  return match ? match[1].trim() : content;
}

/**
 * Parse skills array from frontmatter value
 */
function parseSkillsArray(frontmatterValue: string): string[] {
  const skillsMatch = frontmatterValue.match(/\[([\s\S]*?)\]/);
  if (!skillsMatch) {
    return [];
  }

  const skillsContent = skillsMatch[1];
  return skillsContent
    .split('\n')
    .map(s => s.replace(/^\s*["']|["']\s*$/g, '').trim())
    .filter(s => s.length > 0);
}

/**
 * Load all agents from the agents/ directory
 */
export function loadAgents(): AgentDefinition[] {
  if (agentsCache) {
    return agentsCache;
  }

  const agents: AgentDefinition[] = [];
  const agentsDir = join(__dirname, '..', 'agents');

  try {
    const files = readdirSync(agentsDir).filter(f => f.endsWith('.md'));

    for (const file of files) {
      const filePath = join(agentsDir, file);
      const content = readFileSync(filePath, 'utf-8');
      const frontmatter = parseFrontmatter(content);
      const systemPrompt = extractContent(content);

      const name = file.replace(/\.md$/, '');
      const skills = frontmatter.skills ? parseSkillsArray(frontmatter.skills) : [];

      agents.push({
        name,
        description: frontmatter.description || '',
        systemPrompt,
        skills
      });
    }
  } catch (error) {
    console.error('Error loading agents:', error);
  }

  agentsCache = agents;
  return agents;
}

/**
 * Load all skills from the skills/ subdirectories
 */
export function loadSkills(): SkillDefinition[] {
  if (skillsCache) {
    return skillsCache;
  }

  const skills: SkillDefinition[] = [];
  const skillsDir = join(__dirname, '..', 'skills');

  try {
    const skillDirs = readdirSync(skillsDir).filter(f => {
      try {
        return readdirSync(join(skillsDir, f)).some(file => file === 'SKILL.md');
      } catch {
        return false;
      }
    });

    for (const dir of skillDirs) {
      const skillPath = join(skillsDir, dir, 'SKILL.md');
      const content = readFileSync(skillPath, 'utf-8');
      const frontmatter = parseFrontmatter(content);
      const instructions = extractContent(content);
      const name = frontmatter.name || dir;

      skills.push({
        name,
        description: frontmatter.description || '',
        instructions
      });
    }
  } catch (error) {
    console.error('Error loading skills:', error);
  }

  skillsCache = skills;
  return skills;
}

/**
 * Get a specific agent by name
 */
export function getAgent(name: string): AgentDefinition | undefined {
  const agents = loadAgents();
  return agents.find(a => a.name === name);
}

/**
 * Get a specific skill by name
 */
export function getSkill(name: string): SkillDefinition | undefined {
  const skills = loadSkills();
  return skills.find(s => s.name === name);
}

/**
 * Clear the cache (useful for testing)
 */
export function clearCache(): void {
  agentsCache = null;
  skillsCache = null;
}

/**
 * List available agents
 */
export function listAvailableAgents(): string[] {
  return loadAgents().map(a => a.name);
}

/**
 * List available skills
 */
export function listAvailableSkills(): string[] {
  return loadSkills().map(s => s.name);
}