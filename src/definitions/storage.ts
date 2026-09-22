import { prepareMaterialPath } from './material-files.js';
import { copySkill, restoreSkill, verifySkill, removeSkill, type SkillBundle } from './skill-materials.js';
import { createHash, randomUUID } from "node:crypto";
import {
  readFileSync,
  lstatSync,
  writeFileSync,
  renameSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { join, basename } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { ensure, LIMITS } from "../contracts/definition.js";
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function hash(value: unknown): string {
  return createHash("sha256")
    .update(
      typeof value === "string" || Buffer.isBuffer(value)
        ? value
        : canonical(value),
    )
    .digest("hex");
}
export function transaction<T>(db: DatabaseSync, operation: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export type Material = {
  bundle?: SkillBundle;
  id: string;
  path: string;
  originalPath: string;
  hash: string;
  size: number;
  role: string;
};
export class MaterialStore {
  constructor(readonly directory: string) {}
  read(path: string, max = LIMITS.maxMaterialBytes): Buffer {
    const stat = lstatSync(path);
    ensure(stat.isFile() && !stat.isSymbolicLink(), "UNSUPPORTED_FILE");
    ensure(stat.size <= max, "INPUT_TOO_LARGE");
    return readFileSync(path);
  }
  copySkill(path: string, role: string): Material { return copySkill(path, this.directory, role); }
  copy(path: string, role: string, preserveFilename = false): Material {
    const bytes = this.read(path);
    const material = this.freeze(bytes, role, path, preserveFilename ? basename(path) : undefined);
    ensure(hash(this.read(path)) === material.hash, "SOURCE_CHANGED");
    return material;
  }
  freeze(bytes: Buffer, role: string, originalPath: string, filename?: string): Material {
    ensure(bytes.length <= LIMITS.maxMaterialBytes, "INPUT_TOO_LARGE");
    const digest = hash(bytes);
    const target = filename ? join(this.directory, digest, basename(filename)) : join(this.directory, digest);
    prepareMaterialPath(this.directory, target);
    let matches = false;
    if (existsSync(target)) {
      const stat = lstatSync(target);
      ensure(stat.isFile() && !stat.isSymbolicLink(), 'INVALID_MATERIAL_PATH');
      try { matches = stat.size === bytes.length && hash(readFileSync(target)) === digest; }
      catch { matches = false; }
    }
    if (!matches) {
      const temporary = `${target}.${randomUUID()}.tmp`;
      try {
        writeFileSync(temporary, bytes, { mode: 0o600, flag: "wx" });
        ensure(hash(readFileSync(temporary)) === digest, "SOURCE_CHANGED");
        renameSync(temporary, target);
      } finally { if (existsSync(temporary)) unlinkSync(temporary); }
    }
    return {
      id: digest,
      path: target,
      originalPath,
      hash: digest,
      size: bytes.length,
      role,
    };
  }
  restore(material: Material, selectedPath: string): void {
    if (material.bundle) { restoreSkill(material, selectedPath, this.directory); return; }
    const bytes = this.read(selectedPath);
    ensure(hash(bytes) === material.hash && bytes.length === material.size, 'MATERIAL_VERSION_MISMATCH', '所选文件与固定版本不同；请选择原版本，更新内容请创建新版本或更换本次输入');
    const flat = join(this.directory, material.hash), named = join(flat, basename(material.path));
    ensure(material.path === flat || material.path === named, 'INVALID_MATERIAL_PATH');
    ensure(hash(this.read(selectedPath)) === material.hash, 'SOURCE_CHANGED');
    this.freeze(bytes, material.role, material.originalPath, material.path === flat ? undefined : basename(material.path));
    this.verify(material);
  }
  verify(material: Material): void {
    if (material.bundle) { verifySkill(material); return; }
    ensure(
      existsSync(material.path) &&
        hash(this.read(material.path)) === material.hash,
      "MATERIAL_MISSING",
      "固定资料副本缺失或校验不符",
    );
  }
  remove(material: Material): void {
    if (material.bundle) { removeSkill(material); return; }
    if (existsSync(material.path)) unlinkSync(material.path);
  }
}
