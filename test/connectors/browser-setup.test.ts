import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { BrowserSetup } from "../../dist/integrations/browser-setup.js";
import { WorkPetHttpBridge } from "../../dist/bridge/http-bridge.js";
import { WebTransfer } from "../../dist/connectors/web-transfer.js";
import { postToWorkPet } from "../../integrations/workbuddy-marketplace/plugins/workpet/bridge/config.mjs";

test("browser setup prepares extension, pairs exact ID and checks the registered native host against live bridge", async () => {
  const root = await mkdtemp(join(tmpdir(), "worket browser's setup-"));
  const bridgeConfig = join(root, "bridge.json");
  const bridge = new WorkPetHttpBridge({ configPath: bridgeConfig, mcp: {} as any, onHook: async () => ({}) });
  const setup = new BrowserSetup({ root: join(root, "Worket"), home: root, resourceRoot: resolve("."), runtime: process.execPath, bridgeConfig, platform: "darwin" });
  try {
    assert.equal((await setup.status("chrome")).paired, false);
    await assert.rejects(setup.pair("chrome", "bad id"), /32 位/);
    await assert.rejects(setup.pair("other", "a".repeat(32)), /Chrome 或 Edge/);
    await bridge.start();
    const status = await setup.pair("chrome", "a".repeat(32));
    assert.equal(status.paired, true); assert.equal(status.connected, true);
    const manifest = JSON.parse(await readFile(join(root, "Library/Application Support/Google/Chrome/NativeMessagingHosts/site.dandi.worket.selected.json"), "utf8"));
    assert.deepEqual(manifest.allowed_origins, [`chrome-extension://${"a".repeat(32)}/`]);
    const catalog = await readFile(join(status.directory, "catalog.js"), "utf8");
    assert.match(catalog, /chatgpt-web/);
    assert.equal((await setup.status("edge")).paired, false, "pairing is scoped to selected browser");
    await bridge.close();
    assert.equal((await setup.status("chrome")).connected, false, "files alone do not prove a working connection");
  } finally { await bridge.close(); await rm(root, { recursive: true, force: true }); }
});

test("unprepared transfer preserves its actionable reason and error code through HTTP client", async () => {
  const root = await mkdtemp(join(tmpdir(), "worket-bridge-error-"));
  const bridgeConfig = join(root, "bridge.json");
  const previous = process.env.WORKPET_BRIDGE_CONFIG;
  const transfer = new WebTransfer();
  const bridge = new WorkPetHttpBridge({ configPath: bridgeConfig, mcp: {} as any, onHook: async () => ({}), onWebTransfer: payload => transfer.handle(payload) });
  try {
    await bridge.start(); process.env.WORKPET_BRIDGE_CONFIG = bridgeConfig;
    await assert.rejects(postToWorkPet("/web/transfer", { action: "preview", url: "https://chatgpt.com/" }), (error: any) => {
      assert.equal(error.status, 400); assert.equal(error.code, "TRANSFER_NOT_PREPARED");
      assert.match(error.message, /请先在 Worket 复制工作包或交接到网页/);
      return true;
    });
  } finally {
    if (previous === undefined) delete process.env.WORKPET_BRIDGE_CONFIG; else process.env.WORKPET_BRIDGE_CONFIG = previous;
    await bridge.close(); await rm(root, { recursive: true, force: true });
  }
});
