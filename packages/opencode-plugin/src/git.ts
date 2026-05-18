import { GitStatus, GitCommitResult } from './types.js';

export async function checkGitStatus(
  $: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>
): Promise<GitStatus> {
  try {
    const statusResult = await $`git status --porcelain`;
    const files = (statusResult as { stdout: string }).stdout
      .split('\n')
      .filter((line: string) => line.trim().length > 0)
      .map((line: string) => line.slice(3));
    const branchResult = await $`git branch --show-current`;
    const branch = (branchResult as { stdout: string }).stdout.trim();
    return {
      isDirty: files.length > 0,
      files,
      branch,
      ahead: 0,
      behind: 0,
    };
  } catch {
    return { isDirty: false, files: [], branch: '', ahead: 0, behind: 0 };
  }
}

export async function commitCheckpoint(
  $: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>,
  message = 'wip: checkpoint'
): Promise<GitCommitResult> {
  try {
    await $`git add -A`;
    const result = await $`git commit -m ${message}`;
    const hashMatch = (result as { stdout: string }).stdout.match(/\[.+?\s+([a-f0-9]+)\]/);
    return {
      success: true,
      hash: hashMatch?.[1],
      message,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function commitWithMessage(
  $: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>,
  message: string
): Promise<GitCommitResult> {
  try {
    await $`git add -A`;
    const result = await $`git commit -m ${message}`;
    const hashMatch = (result as { stdout: string }).stdout.match(/\[.+?\s+([a-f0-9]+)\]/);
    return {
      success: true,
      hash: hashMatch?.[1],
      message,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function generateCommitMessage(prompt: string): string {
  const lower = prompt.toLowerCase();
  let prefix = 'feat:';
  if (lower.includes('fix') || lower.includes('bug')) prefix = 'fix:';
  else if (lower.includes('test')) prefix = 'test:';
  else if (lower.includes('doc')) prefix = 'docs:';
  else if (lower.includes('refactor')) prefix = 'refactor:';
  const summary = prompt.split('\n')[0].slice(0, 72);
  return `${prefix} ${summary}`;
}