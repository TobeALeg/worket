import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { WorkBuddyDesktopClient } from "../../dist/adapters/workbuddy/desktop-client.js";
import { createWorkBuddyExecutor } from "../../dist/adapters/workbuddy/executor.js";
import { ExecutorNotRunningError } from "../../dist/executors/errors.js";
import { AppService } from "../../dist/app/app-service.js";

test("absent WorkBuddy has no source warning, recovers on startup, and preserves live protocol failures", async () => {
  const directory = await mkdtemp(join(tmpdir(), "worket-buddy-"));
  const socketPath = join(directory, "buddy.sock");
  const client = new WorkBuddyDesktopClient(socketPath, async () => false);
  const app = new AppService({
    databasePath: ":memory:",
    executors: [createWorkBuddyExecutor({ workbuddy: client, launcher: { async openNewConversation() {} } })],
  });
  let protocol = 1;
  let failRead = false;
  const server = createServer(socket => socket.once("data", data => {
    const { method } = JSON.parse(String(data));
    socket.end(JSON.stringify(failRead ? { error: "历史读取失败" } : {
      result: method === "status" ? { protocol } : { threads: [{
        id: "conversation", title: "真实来源", preview: "", cwd: "/tmp",
        updatedAt: "2026-10-09T00:00:00Z", status: "idle",
      }], nextCursor: null },
    }));
  }));
  try {
    assert.deepEqual(await app.listRecentConversations(), { threads: [], errors: [] });
    assert.deepEqual(await app.listExecutors(), []);
    assert.deepEqual(await app.listConversationHistory("workbuddy", "2"), { threads: [], nextCursor: null });
    await assert.rejects(client.readThread("recorded"), ExecutorNotRunningError);

    server.listen(socketPath);
    await once(server, "listening");
    assert.equal((await app.listExecutors())[0]?.available, true);
    assert.equal((await app.listRecentConversations()).threads[0]?.id, "conversation");
    protocol = 2;
    const executor = (await app.listExecutors())[0]!;
    assert.equal(executor.available, false);
    assert.match(executor.error!, /版本不兼容/);
    failRead = true;
    assert.match((await app.listRecentConversations()).errors[0]!, /历史读取失败/);
  } finally {
    app.close();
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

test("a stale socket is absent only when WorkBuddy is not running", async () => {
  const directory = await mkdtemp(join(tmpdir(), "worket-buddy-"));
  const socketPath = join(directory, "buddy.sock");
  const endpoint = spawn(process.execPath, ["--input-type=module", "-e",
    'import {createServer} from "node:net"; createServer().listen(process.argv[1], () => process.stdout.write("ready"));', socketPath]);
  try {
    await once(endpoint.stdout, "data");
    const exited = once(endpoint, "exit");
    endpoint.kill("SIGKILL");
    await exited;
    await assert.rejects(new WorkBuddyDesktopClient(socketPath, async () => false).inspect(), ExecutorNotRunningError);
    for (const path of [socketPath, join(directory, "missing.sock")]) {
      await assert.rejects(new WorkBuddyDesktopClient(path, async () => true).inspect(), error => {
        assert.equal(error instanceof ExecutorNotRunningError, false);
        assert.match(String(error), /接入不可用/);
        return true;
      });
    }
  } finally {
    if (endpoint.exitCode === null && endpoint.signalCode === null) endpoint.kill("SIGKILL");
    await rm(directory, { recursive: true, force: true });
  }
});
