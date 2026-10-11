import assert from "node:assert/strict";
import test from "node:test";
import { fork } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkBuddyDesktopClient } from "../../dist/adapters/workbuddy/desktop-client.js";

test("WorkBuddy client and extension communicate over native IPC with an isolated home", async () => {
  const home = await mkdtemp(join(tmpdir(), "wb-ipc-"));
  const child = fork("integrations/workbuddy-extension/server/index.cjs", [], {
    execArgv: [], stdio: ["ignore", "ignore", "pipe", "ipc"],
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  const socket = process.platform === "win32"
    ? `\\\\.\\pipe\\workpet-workbuddy-${createHash("sha256").update(home).digest("hex").slice(0, 12)}`
    : join(home, ".workpet", "workbuddy.sock");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Extension IPC startup timed out")), 5000);
      child.once("error", reject);
      child.once("exit", code => reject(new Error(`Extension exited: ${code}`)));
      child.on("message", (message: any) => {
        if (message.type === "wb-extension-ready") resolve();
        if (message.type === "invoke:request") {
          assert.equal(message.channel, "wb:conversations:list");
          child.send({ type: "invoke:response", requestId: message.requestId,
            result: { items: [{ id: "fixture", title: "中文 IPC", updatedAt: Date.now(), state: "completed" }], total: 1 } });
        }
      });
    });
    clearTimeout(timer);
    const client = new WorkBuddyDesktopClient(socket);
    await client.inspect();
    const page = await client.listThreadPage();
    assert.equal(page.threads[0].title, "中文 IPC");
    assert.equal(page.nextCursor, null);
    assert.equal(new WorkBuddyDesktopClient().socketPath.startsWith("\\\\.\\pipe\\"), process.platform === "win32");
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
    await rm(home, { recursive: true, force: true });
  }
});
