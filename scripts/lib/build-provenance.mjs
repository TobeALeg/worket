import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const root = new URL('../../', import.meta.url);
const dist = new URL('dist/', root);
const digest = createHash('sha256');
async function scan(directory, prefix = '') {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = join(prefix, entry.name), path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) await scan(path, relative);
    else if (entry.name !== 'build-info.json') { digest.update(relative); digest.update('\0'); digest.update(await readFile(path)); }
  }
}
await scan(dist);
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
let source = { sourceCommit: null, sourceDirty: null };
try { source = { sourceCommit: git('rev-parse', 'HEAD'), sourceDirty: !!git('status', '--porcelain') }; } catch {}
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
await writeFile(new URL('build-info.json', dist), JSON.stringify({ version: pkg.version, ...source, buildDigest: digest.digest('hex'), builtAt: new Date().toISOString() }, null, 2));
