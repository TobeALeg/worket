import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { CodexAppServerClient, getCodexBinaryCandidates } from "../../dist/adapters/codex/app-server-client.js";

test("Codex discovery connects through modern and legacy desktop bundle layouts", async () => {
  const root = await mkdtemp(join(tmpdir(), "worket-codex-discovery-"));
  try {
    const home = join(root, "home"), applications = join(root, "Applications");
    const candidates = getCodexBinaryCandidates(home, applications);
    for (const location of [applications, join(home, "Applications")]) {
      for (const bundle of ["ChatGPT.app", "Codex.app"]) {
        for (const relativePath of ["codex-cli/bin/codex", "codex"]) {
          const binary = join(location, bundle, "Contents/Resources", relativePath);
          await mkdir(dirname(binary), { recursive: true });
          await writeFile(binary, `#!${process.execPath}
const { createInterface } = require("node:readline");
createInterface({ input: process.stdin }).on("line", line => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  const result = request.method === "thread/list" ? { data: [], nextCursor: null } : {};
  process.stdout.write(JSON.stringify({ id: request.id, result }) + "\\n");
});
`, { mode: 0o700 });
          const client = new CodexAppServerClient(candidates);
          try {
            assert.deepEqual(await client.listThreadPage(1), { threads: [], nextCursor: null }, binary);
          } finally { client.close(); }
          await rm(binary);
        }
      }
    }
    const invalid = join(applications, "ChatGPT.app/Contents/Resources/codex-cli/bin/codex");
    await mkdir(invalid);
    const directoryClient = new CodexAppServerClient(candidates);
    try { await assert.rejects(directoryClient.connect(), /未找到 Codex App Server/); }
    finally { directoryClient.close(); }
    await rm(invalid, { recursive: true });
    await writeFile(invalid, "not executable");
    await chmod(invalid, 0o600);
    const nonExecutableClient = new CodexAppServerClient(candidates);
    try { await assert.rejects(nonExecutableClient.connect(), /未找到 Codex App Server/); }
    finally { nonExecutableClient.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});
