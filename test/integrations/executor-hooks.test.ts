import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

test("installed hook executable forwards minimal executor-specific notifications without changing model control flow", async () => {
  const directory = await mkdtemp(join(tmpdir(), "worket-hook-test-"));
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const server = createServer(async (req, res) => {
    let text = ""; for await (const chunk of req) text += chunk;
    calls.push({ path: req.url!, body: JSON.parse(text) });
    res.setHeader("Content-Type", "application/json"); res.end('{"accepted":true}');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const config = join(directory, "bridge.json");
  await writeFile(config, JSON.stringify({ host: "127.0.0.1", port: (server.address() as { port: number }).port, token: "synthetic" }));
  try {
    for (const executor of ["zcode", "antigravity"]) {
      const child = spawn(process.execPath, [resolve("integrations/executor-hooks/hook-proxy.mjs"), executor, executor === "zcode" ? "UserPromptSubmit" : "Stop"], { env: { ...process.env, WORKPET_BRIDGE_CONFIG: config } });
      let stdout = ""; child.stdout.on("data", chunk => { stdout += chunk; });
      child.stdin.end(JSON.stringify({ session_id: "z-session", conversationId: "a-session", prompt: "synthetic prompt", thinking: "must not forward", transcriptPath: "/private/unrelated" }));
      assert.equal(await new Promise(resolve => child.on("close", resolve)), 0);
      assert.deepEqual(JSON.parse(stdout), {});
    }
    assert.deepEqual(calls, [
      { path: "/hooks/zcode", body: { session_id: "z-session", hook_event_name: "UserPromptSubmit", prompt: "synthetic prompt" } },
      { path: "/hooks/antigravity", body: { session_id: "a-session", hook_event_name: "ConversationUpdated" } },
    ]);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); }
});
