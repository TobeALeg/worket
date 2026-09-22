import { copySkill, verifySkill, removeSkill, type SkillBundle } from './skill-materials.js';
import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  lstatSync,
  writeFileSync,
  renameSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { join, basename, dirname } from "node:path";
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
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const target = filename ? join(this.directory, digest, basename(filename)) : join(this.directory, digest);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    if (!existsSync(target)) {
      const temporary = `${target}.${randomUUID()}.tmp`;
      writeFileSync(temporary, bytes, { mode: 0o600, flag: "wx" });
      ensure(hash(readFileSync(temporary)) === digest, "SOURCE_CHANGED");
      renameSync(temporary, target);
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
