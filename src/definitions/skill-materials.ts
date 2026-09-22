import { createHash } from 'node:crypto';
import { lstatSync, realpathSync, readdirSync, readFileSync, mkdirSync, mkdtempSync, writeFileSync, renameSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { ensure, LIMITS } from '../contracts/definition.js';
import type { Material } from './storage.js';

export type SkillFile = { path: string; hash: string; size: number; executable: boolean };
export type SkillBundle = { entrypoint: 'SKILL.md'; files: SkillFile[]; directories: string[] };
const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');

function tree(root: string) {
  ensure(lstatSync(root).isDirectory() && !lstatSync(root).isSymbolicLink(), 'UNSUPPORTED_FILE', '请选择真实技能目录');
  const files: SkillFile[] = [], directories: string[] = [], contents = new Map<string, Buffer>();
  let total = 0, entries = 0;
  const visit = (directory: string) => {
    for (const name of readdirSync(directory).sort()) {
      ensure(++entries <= LIMITS.maxSkillFiles, 'INPUT_TOO_LARGE', '技能目录文件过多');
      const path = join(directory, name), stat = lstatSync(path);
      ensure(!stat.isSymbolicLink(), 'UNSUPPORTED_FILE', '技能目录中的符号链接须先替换为实际文件');
      if (stat.isDirectory()) { directories.push(relative(root, path).split(sep).join('/')); visit(path); continue; }
      ensure(stat.isFile(), 'UNSUPPORTED_FILE');
      total += stat.size;
      ensure(total <= LIMITS.maxMaterialBytes, 'INPUT_TOO_LARGE');
      const bytes = readFileSync(path);
      ensure(bytes.length === stat.size, 'SOURCE_CHANGED');
      const local = relative(root, path).split(sep).join('/');
      files.push({ path: local, hash: digest(bytes), size: bytes.length, executable: !!(stat.mode & 0o111) });
      contents.set(local, bytes);
    }
  };
  visit(root);
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  directories.sort((a, b) => a.localeCompare(b, 'en'));
  ensure(files.some(f => f.path === 'SKILL.md' && f.size > 0), 'SKILL_ENTRY_MISSING', '目录需要非空 SKILL.md');
  return { files, directories, contents, total, hash: digest(JSON.stringify({ files, directories })) };
}

/** Freeze only the explicitly selected directory; never follow external links or run scripts. */
export function copySkill(directory: string, storeDirectory: string, role: string): Material {
  const root = realpathSync(resolve(directory)), source = tree(root);
  mkdirSync(storeDirectory, { recursive: true, mode: 0o700 });
  const target = join(storeDirectory, `skill-${source.hash}`);
  const material: Material = { id: `skill:${source.hash}`, path: join(target, 'SKILL.md'), originalPath: root, role,
    hash: source.hash, size: source.total, bundle: { entrypoint: 'SKILL.md', files: source.files, directories: source.directories } };
  if (!existsSync(target)) {
    const temporary = mkdtempSync(join(storeDirectory, '.skill-'));
    try {
      for (const directory of source.directories) mkdirSync(join(temporary, directory), { recursive: true, mode: 0o700 });
      for (const file of source.files) {
        const path = join(temporary, file.path);
        mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
        writeFileSync(path, source.contents.get(file.path)!, { mode: file.executable ? 0o700 : 0o600, flag: 'wx' });
      }
      ensure(tree(root).hash === source.hash, 'SOURCE_CHANGED');
      ensure(tree(temporary).hash === source.hash, 'SOURCE_CHANGED');
      renameSync(temporary, target);
    } finally { if (existsSync(temporary)) rmSync(temporary, { recursive: true }); }
  }
  ensure(tree(root).hash === source.hash, 'SOURCE_CHANGED');
  verifySkill(material);
  return material;
}

export function verifySkill(material: Material): void {
  try {
    const actual = tree(dirname(material.path));
    ensure(material.bundle?.entrypoint === 'SKILL.md' && material.hash === actual.hash &&
      material.size === actual.total && JSON.stringify(material.bundle.files) === JSON.stringify(actual.files) && JSON.stringify(material.bundle.directories) === JSON.stringify(actual.directories), 'MATERIAL_MISSING');
  } catch { ensure(false, 'MATERIAL_MISSING', '技能固定副本缺失、损坏或文件发生变化'); }
}

export function removeSkill(material: Material): void {
  if (existsSync(dirname(material.path))) rmSync(dirname(material.path), { recursive: true });
}
