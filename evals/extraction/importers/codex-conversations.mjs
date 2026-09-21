import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { canonical, sha256 } from "../lib.mjs";

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return filesBelow(path);
    return entry.isFile() && entry.name.endsWith(".jsonl") ? [path] : [];
  });
}

function inside(directory, candidate) {
  const base = resolve(directory);
  const path = resolve(candidate);
  return path === base || path.startsWith(`${base}${sep}`);
}

function textFromMessage(message) {
  return (message.content ?? [])
    .filter((item) => item && (item.type === "input_text" || item.type === "output_text"))
    .map((item) => item.text)
    .filter((text) => typeof text === "string" && text.trim())
    .join("\n")
    .trim();
}

function visibleUserMessages(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (
    trimmed.startsWith("<recommended_plugins>") ||
    trimmed.startsWith("# AGENTS.md instructions") ||
    trimmed.startsWith("<environment_context>") ||
    trimmed.startsWith("<app-context>")
  ) return [];
  if (trimmed.startsWith("# Files mentioned by the user:")) {
    const marker = "## My request:";
    const index = trimmed.indexOf(marker);
    const request = index === -1 ? "" : trimmed.slice(index + marker.length).trim();
    return request ? [{ role: "user", content: request }] : [];
  }
  const reply = trimmed.match(/^<send_user_message_question_reply>\s*([\s\S]*?)\s*<\/send_user_message_question_reply>$/u);
  if (reply) {
    const items = JSON.parse(reply[1]);
    if (!Array.isArray(items)) throw new Error("INVALID_QUESTION_REPLY_WRAPPER");
    return items.flatMap((item) => {
      const messages = [];
      if (typeof item.question === "string" && item.question.trim()) messages.push({ role: "assistant", content: item.question.trim() });
      if (typeof item.answer === "string" && item.answer.trim()) messages.push({ role: "user", content: item.answer.trim() });
      return messages;
    });
  }
  return [{ role: "user", content: trimmed }];
}

function parseFile(path, sessionsRoot, authorizedCwd) {
  const records = readFileSync(path, "utf8").split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
  const metaRecord = records.find((record) => record.type === "session_meta");
  const meta = metaRecord?.payload;
  if (!meta || meta.thread_source !== "user" || !inside(authorizedCwd, meta.cwd ?? "")) return null;

  const messages = [];
  for (let ordinal = 0; ordinal < records.length; ordinal += 1) {
    const record = records[ordinal];
    const message = record.type === "response_item" && record.payload?.type === "message" ? record.payload : null;
    if (!message || !["user", "assistant"].includes(message.role)) continue;
    const content = textFromMessage(message);
    const visible = message.role === "user" ? visibleUserMessages(content) : content ? [{ role: "assistant", content }] : [];
    visible.forEach((item, part) => messages.push({
      ...item,
      timestamp: record.timestamp ?? meta.timestamp ?? null,
      ordinal: ordinal + part / 100,
    }));
  }
  return {
    sessionId: meta.id,
    cwd: resolve(meta.cwd),
    messages,
    source: {
      relative_path: relative(sessionsRoot, path),
      sha256: sha256(readFileSync(path)),
      size_bytes: statSync(path).size,
    },
  };
}

function mergeSession(entries) {
  const seen = new Set();
  const messages = entries.flatMap((entry) => entry.messages.map((message) => ({ ...message, source: entry.source.relative_path })))
    .sort((left, right) => String(left.timestamp).localeCompare(String(right.timestamp)) || left.ordinal - right.ordinal)
    .filter((message) => {
      const key = sha256(canonical([message.role, message.timestamp, message.content]));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const events = messages.map((message, index) => ({
    id: `message-${String(index + 1).padStart(4, "0")}-${sha256(message.content).slice(0, 10)}`,
    sequence: index + 1,
    kind: message.role === "user" ? "user.prompt" : "agent.response",
    content: message.content,
    occurred_at: message.timestamp,
  }));
  const sources = [...new Map(entries.map((entry) => [entry.source.relative_path, entry.source])).values()]
    .sort((left, right) => left.relative_path.localeCompare(right.relative_path));
  return { messages, events, sources };
}

export function importCodexConversations({ sessionsRoot, authorizedCwd, authorizationRef, taskFamily = "video-production" }) {
  if (!authorizationRef) throw new Error("缺少 authorizationRef");
  const entries = filesBelow(sessionsRoot)
    .map((path) => parseFile(path, sessionsRoot, authorizedCwd))
    .filter(Boolean);
  const grouped = Map.groupBy(entries, (entry) => entry.sessionId);
  const cases = [];
  const inventory = [];
  for (const [sessionId, sessionEntries] of [...grouped].sort(([left], [right]) => left.localeCompare(right))) {
    const { messages, events, sources } = mergeSession(sessionEntries);
    const userMessages = messages.filter((message) => message.role === "user");
    if (!events.length || !userMessages.length) continue;
    const last = events.at(-1);
    const snapshotHash = sha256(canonical(events));
    const caseId = `VC-${sessionId}`;
    cases.push({
      schema_version: 1,
      case_id: caseId,
      source_type: "AUTHORIZED_REAL",
      authorization_ref: authorizationRef,
      work_id: `video-creator-${sessionId}`,
      task_family: taskFamily,
      author_id: "author-video-creator-01",
      split: "UNASSIGNED",
      cutoff_id: `final-${last.id}`,
      cutoff_event_id: last.id,
      checkpoints: [{ id: "final", cutoff_event_id: last.id }],
      source_snapshot_sha256: snapshotHash,
      source_files: sources,
      attachment_policy: "VISIBLE_MESSAGE_TEXT_ONLY_NO_ATTACHMENT_BODY",
      events,
    });
    inventory.push({
      case_id: caseId,
      session_id: sessionId,
      source_file_count: sources.length,
      user_message_count: userMessages.length,
      assistant_message_count: messages.length - userMessages.length,
      event_count: events.length,
      content_bytes: Buffer.byteLength(canonical(events)),
      first_user_message_sha256: sha256(userMessages[0].content),
      source_snapshot_sha256: snapshotHash,
    });
  }
  return {
    cases,
    inventory,
    provenance: {
      schema_version: 1,
      source: "CODEX_VISIBLE_CONVERSATIONS",
      authorization_ref: authorizationRef,
      authorized_cwd: resolve(authorizedCwd),
      sessions_root: resolve(sessionsRoot),
      imported_at: new Date().toISOString(),
      exclusions: ["non-root threads", "other workspaces", "system/developer context", "tool calls and outputs", "reasoning", "standalone attachment bodies"],
    },
  };
}
