import { open } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ConversationSource, ConversationPage, ConversationSummary } from "../../executors/types.js";
import type { NormalizedThread } from "../types.js";
import { historyEvent, object, pageOffset, readDatabase } from "../local-history.js";

interface Summary {
  conversation_id: string; title: string; preview: string; workspace_uris: string;
  last_modified_time: string; status: string;
}
const COLUMNS = "conversation_id, title, preview, workspace_uris, last_modified_time, status";

function summary(row: Summary): ConversationSummary {
  const uris: unknown = row.workspace_uris ? JSON.parse(row.workspace_uris) : [];
  const uri = Array.isArray(uris) ? uris.find(x => typeof x === "string" && x.startsWith("file://")) : undefined;
  return { id: row.conversation_id, title: row.title || null, preview: row.preview,
    cwd: uri ? fileURLToPath(uri) : "", updatedAt: new Date(row.last_modified_time).toISOString(), status: row.status };
}

/** Official hook transcript; keeps truncation visible, never falls back to summaries. */
export class AntigravitySource implements ConversationSource {
  constructor(readonly root = join(homedir(), ".gemini/antigravity")) {}

  async listThreadPage(limit = 30, cursor?: string): Promise<ConversationPage> {
    const offset = pageOffset(cursor), size = Math.max(1, Math.min(100, limit));
    const rows = readDatabase(join(this.root, "conversation_summaries.db"), db =>
      db.prepare(`SELECT ${COLUMNS} FROM conversation_summaries WHERE parent_conversation_id='' AND app_data_dir='antigravity' ORDER BY last_modified_time DESC, conversation_id LIMIT ? OFFSET ?`)
        .all(size + 1, offset) as unknown as Summary[]);
    return { threads: rows.slice(0, size).map(summary), nextCursor: rows.length > size ? String(offset + size) : null };
  }

  async readThread(id: string): Promise<NormalizedThread> {
    if (!/^[a-zA-Z0-9-]{32,64}$/.test(id)) throw new Error("Antigravity 会话 ID 无效。");
    const row = readDatabase(join(this.root, "conversation_summaries.db"), db =>
      db.prepare(`SELECT ${COLUMNS} FROM conversation_summaries WHERE conversation_id=? AND parent_conversation_id='' AND app_data_dir='antigravity'`).get(id) as unknown as Summary | undefined);
    if (!row) throw new Error("Antigravity 会话不存在或不是本机桌面会话。");
    const info = summary(row);
    const path = join(this.root, "brain", id, ".system_generated/logs/transcript.jsonl");
    const file = await open(path, "r").catch(() => { throw new Error("Antigravity 暂无可读的会话正文，未用摘要替代历史。"); });
    let text: string;
    try {
      const { size } = await file.stat();
      if (size > 64 * 1024 * 1024) throw new Error("Antigravity 会话超过 64 MB，未导入不完整历史。");
      const buffer = Buffer.alloc(size);
      let offset = 0;
      while (offset < size) {
        const { bytesRead } = await file.read(buffer, offset, size - offset, offset);
        if (!bytesRead) break;
        offset += bytesRead;
      }
      text = buffer.subarray(0, offset).toString("utf8");
    } finally { await file.close(); }
    const events = normalizeTranscript(id, text);
    return { threadId: id, title: info.title ?? "", applicationTitle: info.title,
      cwd: info.cwd, createdAt: events[0]?.timestamp ?? info.updatedAt, updatedAt: info.updatedAt, events };
  }
  close(): void {}
}

export function normalizeTranscript(id: string, text: string): NormalizedThread["events"] {
  const lines = text.split("\n"), steps = new Map<number, Record<string, unknown>>();
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    let step: Record<string, unknown>;
    try { step = object(JSON.parse(line)); }
    catch {
      if (index === lines.length - 1 && !text.endsWith("\n")) break; // Concurrent append.
      throw new Error("Antigravity transcript 格式不兼容，未跳过损坏的历史。");
    }
    if (!Number.isSafeInteger(step.step_index) || Number(step.step_index) < 0)
      throw new Error("Antigravity transcript 缺少稳定事件序号。");
    steps.set(Number(step.step_index), step);
  }
  const events: NormalizedThread["events"] = [];
  for (const [index, step] of [...steps].sort((a, b) => a[0] - b[0])) {
    if (step.status !== "DONE") continue;
    const timestamp = new Date(String(step.created_at)).toISOString();
    const truncated = Array.isArray(step.truncated_fields) ? step.truncated_fields.filter(x => typeof x === "string" && x !== "thinking") : [];
    const add = (suffix: string, kind: Parameters<typeof historyEvent>[4], content: string, metadata = {}) => {
      if (content.trim()) events.push(historyEvent("antigravity", id, `${index}:${suffix}`, events.length + 1, kind,
        content, timestamp, { stepIndex: index, ...metadata }));
    };
    const visibleContent = typeof step.content === "string" ? step.content : "";
    const content = visibleContent && truncated.includes("content") ? `${visibleContent}\n[Antigravity 源记录已截断此内容]` : visibleContent;
    if (step.type === "USER_INPUT" && step.source === "USER_EXPLICIT") add("text", "user.prompt", content, { truncated: truncated.includes("content") });
    if (step.type === "PLANNER_RESPONSE") {
      add("text", "agent.response", content, { truncated: truncated.includes("content") });
      if (Array.isArray(step.tool_calls)) step.tool_calls.forEach((raw, n) => {
        const tool = object(raw);
        if (typeof tool.name !== "string") return;
        add(`tool-${n}`, "tool.call", `${tool.name}\n${JSON.stringify(tool.args ?? {})}${truncated.includes("tool_calls") ? "\n[Antigravity 源记录已截断工具参数]" : ""}`,
          { toolName: tool.name, truncated: truncated.includes("tool_calls") });
      });
    }
    if (step.type === "GENERIC" && step.source === "MODEL") add("result", "tool.result", content, { truncated: truncated.includes("content") });
    if (step.type === "ERROR_MESSAGE") add("error", "tool.result", content, { status: "error" });
    // thinking, system messages and checkpoint internals are never copied.
  }
  return events;
}
