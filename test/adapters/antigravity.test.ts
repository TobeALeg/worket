import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AntigravitySource, normalizeTranscript } from "../../dist/adapters/antigravity/source.js";
import { installAntigravityIntegration } from "../../dist/adapters/antigravity/install.js";
import { writeConfig } from "../../dist/integrations/json-config.js";

const id = "12345678-1234-1234-1234-123456789abc";
const step = (index: number, type: string, extra = {}) => ({ step_index: index, type, status: "DONE", source: "MODEL", created_at: "2026-09-16T00:00:00Z", ...extra });
const transcript = (rows: object[]) => rows.map(x => JSON.stringify(x)).join("\n") + "\n";

test("Antigravity retains visible response/tools and truncation, excludes thinking and partial steps", () => {
  const rows = [step(0, "USER_INPUT", { source: "USER_EXPLICIT", content: "任务" }),
    step(1, "PLANNER_RESPONSE", { content: "可见回复", thinking: "private reasoning", tool_calls: [{ name: "Read", args: { path: "/tmp/a" } }], truncated_fields: ["tool_calls", "thinking"] }),
    step(2, "GENERIC", { content: "partial", status: "RUNNING" }),
    step(2, "GENERIC", { content: "final result", truncated_fields: ["content"] }),
    step(3, "SYSTEM_MESSAGE", { content: "private system prompt" })];
  const events = normalizeTranscript(id, transcript(rows) + '{"step_index":4');
  assert.deepEqual(events.map(e => e.kind), ["user.prompt", "agent.response", "tool.call", "tool.result"]);
  assert.doesNotMatch(JSON.stringify(events), /private|partial|thinking/);
  assert.match(events[3]!.content, /源记录已截断/);
  assert.equal(events[2]!.metadata!.truncated, true);
  assert.deepEqual(normalizeTranscript(id, transcript(rows)), events);
  assert.throws(() => normalizeTranscript(id, transcript(rows) + "broken\n"), /格式不兼容/);
});

test("Antigravity discovers summaries but reads only a selected validated transcript", async () => {
  const root = await mkdtemp(join(tmpdir(), "worket-antigravity-"));
  try {
    const db = new DatabaseSync(join(root, "conversation_summaries.db"));
    db.exec("CREATE TABLE conversation_summaries(conversation_id TEXT, title TEXT, preview TEXT, workspace_uris TEXT, last_modified_time TEXT, status TEXT, parent_conversation_id TEXT, app_data_dir TEXT)");
    db.prepare("INSERT INTO conversation_summaries VALUES(?,?,?,?,?,?,?,?)").run(id, "Task", "summary only", '["file:///tmp/space%20name"]', "2026-09-16 00:00:00+00:00", "IDLE", "", "antigravity");
    db.close();
    const source = new AntigravitySource(root);
    assert.equal((await source.listThreadPage()).threads[0]!.cwd, "/tmp/space name");
    await assert.rejects(source.readThread(id), /未用摘要替代/);
    await assert.rejects(source.readThread("../../config"), /ID 无效/);
    const path = join(root, "brain", id, ".system_generated/logs"); await mkdir(path, { recursive: true });
    await writeFile(join(path, "transcript.jsonl"), transcript([step(0, "USER_INPUT", { source: "USER_EXPLICIT", content: "original" })]));
    const thread = await source.readThread(id);
    assert.equal(thread.events[0]!.content, "original"); assert.doesNotMatch(JSON.stringify(thread.events), /summary only/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Antigravity installs only owned config, preserves disablement and shell-quotes paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "worket-ag-config-"));
  try {
    await mkdir(join(root, "antigravity"));
    await writeConfig(join(root, "config/hooks.json"), { existing: { Stop: [{ command: "original" }] }, "worket-capture": { enabled: false } });
    await writeFile(join(root, "config/mcp_config.json"), "");
    await installAntigravityIntegration("/tmp/app '$(no)'", root);
    const installed = JSON.parse(await readFile(join(root, "config/mcp_config.json"), "utf8"));
    installed.mcpServers.existing = { command: "original" };
    await writeConfig(join(root, "config/mcp_config.json"), installed);
    await installAntigravityIntegration("/tmp/app '$(no)'", root);
    const first = await readFile(join(root, "config/hooks.json"), "utf8");
    await installAntigravityIntegration("/tmp/app '$(no)'", root);
    assert.equal(await readFile(join(root, "config/hooks.json"), "utf8"), first);
    const hooks = JSON.parse(first);
    assert.equal(hooks.existing.Stop[0].command, "original");
    assert.equal(hooks["worket-capture"].enabled, false);
    assert.match(hooks["worket-capture"].Stop[0].command, /'\\''/);
    assert.equal(JSON.parse(await readFile(join(root, "config/mcp_config.json"), "utf8")).mcpServers.existing.command, "original");
  } finally { await rm(root, { recursive: true, force: true }); }
});
