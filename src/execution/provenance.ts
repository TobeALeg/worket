import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Capture when this module is loaded, so a later rebuild cannot relabel a running process.
const loadedBuild = (() => {
  try { return JSON.parse(readFileSync(new URL('../build-info.json', import.meta.url), 'utf8')); }
  catch { return { status: 'unavailable' }; }
})();

/** Observations, not a claim that untracked files or the whole project were frozen. */
export function executionProvenance(directory: string): { worketBuild: Record<string, unknown>; projectVersion: Record<string, unknown> } {
  const worketBuild = { ...loadedBuild, executable: process.execPath, node: process.versions.node, electron: process.versions.electron ?? null };
  let projectVersion: Record<string, unknown> = { status: 'not-recorded', scope: 'selected-files-only' };
  const git = (...args: string[]) => execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try { projectVersion = { commit: git('rev-parse', 'HEAD'), dirty: !!git('status', '--porcelain'), scope: 'selected-files-only' }; } catch { /* Non-Git projects are supported. */ }
  return { worketBuild, projectVersion };
}
