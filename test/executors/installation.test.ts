import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IntegrationInstaller } from "../../dist/integrations/installer.js";
import { AppService } from "../../dist/app/app-service.js";
import { createDefaultExecutors } from "../../dist/executors/defaults.js";
import { desktopExecutorInstalled, installationPathExists } from "../../dist/executors/installation.js";

test("absent desktop executors skip history; installed read failures remain visible and refresh recovers", async () => {
  let installed = false, broken = true, reads = 0;
  const adapters = createDefaultExecutors({ launcher: { async openNewConversation() { return "opened"; } } })
    .filter(adapter => ["codex", "workbuddy", "zcode", "antigravity"].includes(adapter.id));
  for (const adapter of adapters) {
    assert.equal(typeof adapter.isInstalled, "function", adapter.id);
    adapter.isInstalled = async () => installed;
    adapter.source = {
      async listThreadPage() {
        reads++;
        if (broken) throw new Error(`${adapter.name}: history unavailable`);
        return { threads: [], nextCursor: null };
      },
      async readThread() { throw new Error("not used"); },
      close() {},
    };
    adapter.inspect = async () => { await adapter.source!.listThreadPage!(); };
  }
  const service = new AppService({ databasePath: ":memory:", executors: adapters });
  try {
    for (const adapter of adapters)
      assert.deepEqual(await service.listConversationHistory(adapter.id, "30", "search"), { threads: [], nextCursor: null });
    assert.deepEqual(await service.listRecentConversations(), { threads: [], errors: [] });
    assert.deepEqual(await service.listExecutors(), []);
    assert.equal(reads, 0, "uninstalled applications must never open their databases or App Server");
    installed = true;
    for (const adapter of adapters)
      await assert.rejects(service.listConversationHistory(adapter.id), /history unavailable/);
    assert.equal((await service.listRecentConversations()).errors.length, 4);
    assert.equal((await service.listExecutors()).filter(view => view.error).length, 4);
    broken = false;
    assert.deepEqual(await service.listRecentConversations(), { threads: [], errors: [] });
    assert.equal((await service.listExecutors()).every(view => view.available), true);
  } finally { service.close(); }
});

test("installation checks accept registered custom application paths independently of history files", async () => {
  const root = await mkdtemp(join(tmpdir(), "worket-installation-"));
  try {
    const executable = join(root, "custom-app");
    await writeFile(executable, "application fixture");
    for (const id of ["codex", "workbuddy", "zcode", "antigravity"])
      assert.equal(await desktopExecutorInstalled(id, async () => executable), true);
    assert.equal(await installationPathExists(join(root, "missing")), false);
    await assert.rejects(desktopExecutorInstalled("workbuddy", async () => { throw new Error("permission denied"); }), /permission denied/);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test("automatic setup does not create integration configuration for an absent application", async () => {
  let installed = false, installs = 0;
  const adapter = createDefaultExecutors({ launcher: { async openNewConversation() { return "opened"; } } })[0]!;
  adapter.isInstalled = async () => installed;
  adapter.install = async () => { installs++; return "installed"; };
  const installer = new IntegrationInstaller("/fixture/worket", [adapter]);
  assert.deepEqual(await installer.install(), { codex: "not-installed" });
  assert.equal(installs, 0);
  installed = true;
  assert.deepEqual(await installer.install(), { codex: "installed" });
  assert.equal(installs, 1);
});
