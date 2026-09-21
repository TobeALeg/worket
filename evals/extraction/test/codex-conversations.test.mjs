import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { importCodexConversations } from "../importers/codex-conversations.mjs";

function record(type, payload, timestamp) {
  return JSON.stringify({ type, payload, timestamp });
}

function message(role, text) {
  return { type: "message", role, content: [{ type: role === "user" ? "input_text" : "output_text", text }] };
}

function writeSession(path, { id, cwd, threadSource = "user", extra = [] }) {
  writeFileSync(path, [
    record("session_meta", { id, cwd, thread_source: threadSource }, "2026-09-01T00:00:00Z"),
    ...extra,
  ].join("\n") + "\n");
}

test("只导入授权工作区的根对话和可见消息", () => {
  const directory = mkdtempSync(join(tmpdir(), "worket-codex-import-"));
  const sessions = join(directory, "sessions");
  const allowed = join(directory, "VideoCreator");
  mkdirSync(sessions, { recursive: true });
  mkdirSync(allowed, { recursive: true });
  writeSession(join(sessions, "root.jsonl"), {
    id: "root-1", cwd: allowed, extra: [
      record("response_item", message("user", "<recommended_plugins>injected"), "2026-09-01T00:00:01Z"),
      record("response_item", message("user", "制作一个视频"), "2026-09-01T00:00:02Z"),
      record("response_item", { type: "reasoning", text: "hidden" }, "2026-09-01T00:00:03Z"),
      record("response_item", { type: "function_call_output", output: "tool secret" }, "2026-09-01T00:00:04Z"),
      record("response_item", message("assistant", "已经完成"), "2026-09-01T00:00:05Z"),
    ],
  });
  writeSession(join(sessions, "subagent.jsonl"), { id: "sub", cwd: allowed, threadSource: { subagent: true }, extra: [record("response_item", message("user", "不要导入"), "2026-09-01T00:00:02Z")] });
  writeSession(join(sessions, "other.jsonl"), { id: "other", cwd: join(directory, "Other"), extra: [record("response_item", message("user", "也不要导入"), "2026-09-01T00:00:02Z")] });

  const result = importCodexConversations({ sessionsRoot: sessions, authorizedCwd: allowed, authorizationRef: "USER-2026-09-21" });
  assert.equal(result.cases.length, 1);
  assert.deepEqual(result.cases[0].events.map(({ kind, content }) => ({ kind, content })), [
    { kind: "user.prompt", content: "制作一个视频" },
    { kind: "agent.response", content: "已经完成" },
  ]);
  assert.equal(result.cases[0].source_type, "AUTHORIZED_REAL");
  assert.equal(result.cases[0].attachment_policy, "VISIBLE_MESSAGE_TEXT_ONLY_NO_ATTACHMENT_BODY");
});

test("同一根对话的续聊文件合并且重复消息只保留一次", () => {
  const directory = mkdtempSync(join(tmpdir(), "worket-codex-merge-"));
  const sessions = join(directory, "sessions");
  const allowed = join(directory, "VideoCreator");
  mkdirSync(sessions, { recursive: true });
  mkdirSync(allowed, { recursive: true });
  const first = record("response_item", message("user", "第一条"), "2026-09-01T00:00:02Z");
  writeSession(join(sessions, "part-1.jsonl"), { id: "root-1", cwd: allowed, extra: [first] });
  writeSession(join(sessions, "part-2.jsonl"), { id: "root-1", cwd: allowed, extra: [first, record("response_item", message("user", "第二条"), "2026-09-01T00:00:03Z")] });

  const result = importCodexConversations({ sessionsRoot: sessions, authorizedCwd: allowed, authorizationRef: "USER-2026-09-21" });
  assert.equal(result.cases.length, 1);
  assert.deepEqual(result.cases[0].events.map((event) => event.content), ["第一条", "第二条"]);
  assert.equal(result.cases[0].source_files.length, 2);
});

test("文件上下文包装只保留显式 My request", () => {
  const directory = mkdtempSync(join(tmpdir(), "worket-codex-files-"));
  const sessions = join(directory, "sessions");
  const allowed = join(directory, "VideoCreator");
  mkdirSync(sessions, { recursive: true });
  mkdirSync(allowed, { recursive: true });
  writeSession(join(sessions, "root.jsonl"), {
    id: "root-1", cwd: allowed, extra: [
      record("response_item", message("user", "# Files mentioned by the user:\n\nsecret.pdf\n\n## My request:\n执行这个"), "2026-09-01T00:00:02Z"),
    ],
  });
  const result = importCodexConversations({ sessionsRoot: sessions, authorizedCwd: allowed, authorizationRef: "USER-2026-09-21" });
  assert.equal(result.cases[0].events[0].content, "执行这个");
});

test("交互式问题回复拆回助手问题和用户答案", () => {
  const directory = mkdtempSync(join(tmpdir(), "worket-codex-question-"));
  const sessions = join(directory, "sessions");
  const allowed = join(directory, "VideoCreator");
  mkdirSync(sessions, { recursive: true });
  mkdirSync(allowed, { recursive: true });
  const wrapped = '<send_user_message_question_reply>\n[{"question":"使用英文还是中文？","answer":"使用英文"}]\n</send_user_message_question_reply>';
  writeSession(join(sessions, "root.jsonl"), {
    id: "root-1", cwd: allowed, extra: [record("response_item", message("user", wrapped), "2026-09-01T00:00:02Z")],
  });
  const result = importCodexConversations({ sessionsRoot: sessions, authorizedCwd: allowed, authorizationRef: "USER-2026-09-21" });
  assert.deepEqual(result.cases[0].events.map(({ kind, content }) => ({ kind, content })), [
    { kind: "agent.response", content: "使用英文还是中文？" },
    { kind: "user.prompt", content: "使用英文" },
  ]);
});
