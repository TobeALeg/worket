import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createManagedService } from "../../server/managed.mjs";
import { AutomaticConnection, type ServiceConfig } from "../../dist/ai-service/connection.js";
import { WorketAIClient } from "../../dist/ai-service/client.js";

test("automatic users: stable account, recovery across devices, renewal, revocation and upload ownership", async () => {
  const directory = mkdtempSync(join(tmpdir(), "worket-auto-"));
  const service = createManagedService({ directory, automaticEnrollment: true });
  service.store.setup("123456");
  await new Promise<void>(r => service.server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(service.server.address() as any).port}`;
  let config: ServiceConfig = { url: "", token: "" };
  const store = { read: () => ({ ...config, development: true }), write: (c: ServiceConfig) => { config = structuredClone(c); } };
  let connection = new AutomaticConnection(store, url);
  const client = new WorketAIClient(store.read, () => connection.ready());
  try {
    connection.initialize();
    const identity = client.improvementIdentity();
    await Promise.all([connection.ready(), connection.ready(), client.capabilities()]);
    assert.equal(service.store.view().clients.length, 1);
    assert.equal(service.store.view().users.length, 1);
    assert.ok(config.token);
    assert.ok(config.recoveryCode);
    assert.ok(config.userId);
    assert.ok(config.deviceId);
    assert.equal(client.improvementIdentity(), identity);
    assert.ok(!JSON.stringify(service.store.view()).includes(config.installationSecret!));
    assert.ok(!readFileSync(join(directory, "settings.json"), "utf8").includes(config.installationSecret!));
    assert.ok(!JSON.stringify(service.store.view()).includes(config.recoveryCode!));
    assert.ok(!readFileSync(join(directory, "settings.json"), "utf8").includes(config.recoveryCode!));
    const userId = config.userId;
    const deviceId = config.deviceId;
    connection = new AutomaticConnection(store, url);
    await connection.ready();
    config.expiresAt = new Date(0).toISOString();
    await connection.ready();
    assert.equal(config.userId, userId);
    assert.equal(service.store.view().clients.length, 1);
    assert.equal(client.improvementIdentity(), identity);
    let recoveredConfig: ServiceConfig = { url, token: "", development: true,
      installationSecret: "b".repeat(64), recoveryCode: config.recoveryCode };
    const recoveredStore = { read: () => recoveredConfig, write: (c: ServiceConfig) => { recoveredConfig = structuredClone(c); } };
    const recoveredConnection = new AutomaticConnection(recoveredStore);
    await recoveredConnection.ready();
    assert.equal(recoveredConfig.userId, userId);
    assert.notEqual(recoveredConfig.deviceId, deviceId);
    assert.equal(service.store.view().users.length, 1);
    assert.equal(service.store.view().clients.length, 2);
    const isolated = await fetch(`${url}/v1/installations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: "c".repeat(64), recoveryCode: "d".repeat(43) }) }).then(r => r.json());
    assert.notEqual(isolated.userId, userId);
    const upload: any = { schemaVersion: 1, sampleId: "isolated", consent: { version: "worket-improvement-v1", at: new Date().toISOString(), scope: "REUSE" }, event: { id: "e1", kind: "REUSE", at: new Date().toISOString(), data: { content: "test" } } };
    await client.uploadSample(upload);
    const recovered = new WorketAIClient(recoveredStore.read);
    const other = new WorketAIClient(() => ({ url, token: isolated.token, development: true }));
    await other.deleteSample("isolated");
    await recovered.deleteSample("isolated");
    service.store.revoke(deviceId!);
    await assert.rejects(() => client.capabilities(), /AUTH_EXPIRED/);
    await recovered.capabilities();
    config.expiresAt = new Date(0).toISOString();
    await assert.rejects(() => connection.ready(), /已被撤销/);
    assert.equal(service.store.view().clients.length, 3);
  } finally { await service.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("unconfigured installations stay local and request a service configuration", async () => {
  const config: ServiceConfig = { url: "", token: "" };
  const store = { read: () => config, write: () => { assert.fail("No default service should be saved"); } };
  const connection = new AutomaticConnection(store);
  connection.initialize();
  await connection.ready();
  const client = new WorketAIClient(store.read, () => connection.ready());
  await assert.rejects(() => client.capabilities(), /请先配置 Worket 服务/);
});

test("automatic connection preserves manual configuration and rejects plaintext public endpoints", async () => {
  let config: ServiceConfig = { url: "https://manual.example", token: "manual-token" };
  const store = { read: () => config, write: (c: ServiceConfig) => { config = c; } };
  const connection = new AutomaticConnection(store);
  await connection.ready();
  assert.deepEqual(config, { url: "https://manual.example", token: "manual-token" });
  config = { url: "http://203.0.113.1", token: "", installationSecret: "c".repeat(64), development: true };
  await assert.rejects(() => connection.ready(), /INVALID_SERVICE_URL/);
});

test("installation enrollment is opt-in for server deployments and bounds request size and rate", async () => {
  const directory = mkdtempSync(join(tmpdir(), "worket-enrollment-limits-"));
  const service = createManagedService({ directory, automaticEnrollment: true });
  service.store.setup("123456");
  await new Promise<void>(r => service.server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(service.server.address() as any).port}/v1/installations`;
  const send = (body: string) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  try {
    assert.equal((await send("x".repeat(1100))).status, 400);
    assert.equal((await send('{"secret":"bad"}')).status, 400);
    for (let i = 0; i < 58; i++) assert.equal((await send(JSON.stringify({ secret: "a".repeat(64), recoveryCode: "r".repeat(43) }))).status, 200);
    assert.equal((await send(JSON.stringify({ secret: "a".repeat(64), recoveryCode: "r".repeat(43) }))).status, 429);
    assert.equal(service.store.view().clients.length, 1);
  } finally { await service.close(); rmSync(directory, { recursive: true, force: true }); }
});
