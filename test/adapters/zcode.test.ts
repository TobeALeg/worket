import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ZCodeSource } from "../../dist/adapters/zcode/source.js";
import { installZCodeIntegration } from "../../dist/adapters/zcode/install.js";
import { writeConfig } from "../../dist/integrations/json-config.js";
import { deliverViaClipboard } from "../../dist/executors/manual-delivery.js";

test("ZCode reads selected static history, excludes hidden/in-flight content and keeps completed tool records", async () => {
  const root = await mkdtemp(join(tmpdir(), "worket-zcode-"));
  try {
    await mkdir(join(root, "v2")); await mkdir(join(root, "cli/db"), { recursive: true });
    const index = new DatabaseSync(join(root, "v2/tasks-index.sqlite"));
    index.exec(`CREATE TABLE tasks(task_id TEXT, title TEXT, workspace_path TEXT, created_at INTEGER, updated_at INTEGER, task_status TEXT, deleted INTEGER, provider TEXT);
      INSERT INTO tasks VALUES('s1','One','/tmp',1000,2000,'idle',0,'glm'),('s2','Two','/tmp',1000,3000,'idle',0,'glm'),('gone','Deleted','/tmp',1000,4000,'idle',1,'glm');`);
    index.close();
    const db = new DatabaseSync(join(root, "cli/db/db.sqlite"));
    db.exec(`CREATE TABLE session(id TEXT); INSERT INTO session VALUES('s1');
      CREATE TABLE message(id TEXT, session_id TEXT, time_created INTEGER, sequence INTEGER, data TEXT);
      CREATE TABLE part(id TEXT, message_id TEXT, session_id TEXT, time_created INTEGER, sequence INTEGER, data TEXT);`);
    const add = (id: string, seq: number, message: object, parts: object[]) => {
      db.prepare("INSERT INTO message VALUES(?,?,?,?,?)").run(id, "s1", 1000, seq, JSON.stringify(message));
      parts.forEach((p, i) => db.prepare("INSERT INTO part VALUES(?,?,?,?,?,?)").run(`${id}-${i}`, id, "s1", 1000, i, JSON.stringify(p)));
    };
    add("user", 1, { role: "user" }, [{ type: "text", text: "请继续" }]);
    add("hidden", 2, { role: "user", semantics: { uiVisibility: "hidden" } }, [{ type: "text", text: "hidden reminder" }]);
    add("answer", 3, { role: "assistant", time: { completed: 1500 } }, [
      { type: "reasoning", text: "secret thought" }, { type: "text", text: "已完成" },
      { type: "tool", tool: "Read", callID: "call-1", state: { status: "completed", input: { path: "/tmp/a" }, output: "file content" } },
    ]);
    add("stream", 4, { role: "assistant", time: {} }, [{ type: "text", text: "partial" }]);
    const source = new ZCodeSource(root);
    const page = await source.listThreadPage(1);
    assert.equal(page.threads[0]!.id, "s2");
    assert.equal((await source.listThreadPage(1, page.nextCursor!)).threads[0]!.id, "s1");
    const first = await source.readThread("s1");
    assert.deepEqual(first.events.map(e => e.kind), ["user.prompt", "agent.response", "tool.call", "tool.result"]);
    assert.doesNotMatch(JSON.stringify(first), /secret thought|hidden reminder|partial/);
    db.prepare("UPDATE message SET data=? WHERE id='stream'").run(JSON.stringify({ role: "assistant", time: { completed: 2000 } }));
    const second = await source.readThread("s1");
    assert.equal(second.events.length, 5);
    assert.deepEqual(second.events.slice(0, 4), first.events);
    await assert.rejects(source.readThread("gone"), /不存在/);
    await assert.rejects(source.listThreadPage(10, "-1"), /游标/);
    db.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("ZCode config preserves existing MCP and hooks, is idempotent and respects disabled hooks", async () => {
  const parent = await mkdtemp(join(tmpdir(), "worket-config-")), root = join(parent, ".zcode");
  try {
    await writeConfig(join(root, "cli/config.json"), { other: 42, hooks: { enabled: false, events: { Stop: [{ custom: true }] } } });
    await writeConfig(join(parent, ".agents/mcp.json"), { mcpServers: { existing: { command: "existing" } } });
    await installZCodeIntegration("/tmp/app with spaces", root);
    const path = join(root, "cli/config.json"), first = await readFile(path, "utf8");
    await installZCodeIntegration("/tmp/app with spaces", root);
    assert.equal(await readFile(path, "utf8"), first);
    const config = JSON.parse(first);
    assert.equal(config.other, 42); assert.equal(config.hooks.enabled, false);
    assert.equal(config.hooks.events.Stop.length, 2);
    assert.equal(config.mcp.servers.existing.command, "existing");
    assert.equal(config.mcp.servers.worket.args.length, 1);
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test("manual delivery has both correlation markers and never claims a bound conversation", async () => {
  let text = "", opened = "";
  const receipt = await deliverViaClipboard({ openApplication: async id => { opened = id; }, writeClipboard: value => { text = value; } }, "dev.zcode.app", "ZCode", {
    workId: "work-1", deliveryId: "delivery-1", title: "Test", purpose: "CONTINUE", prompt: "[WORKPET:work-1]\n[DELIVERY:delivery-1]\nget_work_context context_version=3",
  });
  assert.match(text, /context_version=3/);
  assert.equal(opened, "dev.zcode.app"); assert.match(text, /\[WORKPET:work-1\]\n\[DELIVERY:delivery-1\]/);
  assert.equal(receipt.conversationId, undefined); assert.match(receipt.guidance!, /新建聊天/);
});
