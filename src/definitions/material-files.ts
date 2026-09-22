import { existsSync, lstatSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensure } from '../contracts/definition.js';

/** Writes stay below the owned store, without traversing substituted directory links. */
export function prepareMaterialPath(directory: string, target: string): void {
  const root = resolve(directory), local = relative(root, resolve(target));
  ensure(local && local !== '..' && !local.startsWith(`..${sep}`) && !local.startsWith(sep), 'INVALID_MATERIAL_PATH');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const parts = relative(root, dirname(resolve(target))).split(sep).filter(Boolean);
  let parent = root;
  for (const part of ['', ...parts]) {
    if (part) parent = join(parent, part);
    if (!existsSync(parent)) mkdirSync(parent, { mode: 0o700 });
    const stat = lstatSync(parent);
    ensure(stat.isDirectory() && !stat.isSymbolicLink(), 'INVALID_MATERIAL_PATH', '固定资料目录被替换，请恢复资料目录后重试');
  }
}

/** Same-parent rename, with rollback if replacing a directory fails. */
export function replaceMaterialDirectory(temporary: string, target: string): void {
  const backup = `${target}.repair-${randomUUID()}`;
  let moved = false;
  if (existsSync(target)) {
    const stat = lstatSync(target);
    ensure(stat.isDirectory() && !stat.isSymbolicLink(), 'INVALID_MATERIAL_PATH');
    renameSync(target, backup); moved = true;
  }
  try { renameSync(temporary, target); }
  catch (error) { if (moved) renameSync(backup, target); throw error; }
  if (moved) rmSync(backup, { recursive: true, force: true });
}
