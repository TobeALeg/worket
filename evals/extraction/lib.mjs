import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : canonical(value)).digest("hex");
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function readJsonl(path) {
  return readFileSync(path, "utf8").split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

export function writeJson(path, value, options = {}) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: options.exclusive ? "wx" : "w", mode: options.mode });
}

export function resolveFrom(root, path) {
  return resolve(root, path);
}

export function safeCase(input) {
  const {
    expected_semantic_assertions: _expected,
    forbidden_inferences: _forbidden,
    related_metamorphic_check: _metamorphic,
    ...caseData
  } = structuredClone(input);
  return caseData;
}

export function runId(prefix = "run") {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/gu, "-")}-${randomUUID().slice(0, 8)}`;
}

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

export function environmentSnapshot(root) {
  return {
    captured_at: new Date().toISOString(),
    git: {
      branch: git(root, ["branch", "--show-current"]),
      commit: git(root, ["rev-parse", "HEAD"]),
      status: git(root, ["status", "--short"]),
    },
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    files: Object.fromEntries([
      "package-lock.json",
      "server/workflow.mjs",
      "src/extractor/openai-compatible-extractor.ts",
    ].map((path) => [path, sha256(readFileSync(resolve(root, path)))])),
  };
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const values = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) throw new Error(`未知参数：${token}`);
    const key = token.slice(2).replaceAll("-", "_");
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) values[key] = true;
    else { values[key] = next; index += 1; }
  }
  return { command, values };
}
