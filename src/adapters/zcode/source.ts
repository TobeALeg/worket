import { homedir } from "node:os";
import { join } from "node:path";
import type { ConversationPage, ConversationSource, ConversationSummary } from "../../executors/types.js";
import type { NormalizedThread } from "../types.js";
import { historyEvent, object, pageOffset, readDatabase } from "../local-history.js";

interface Task {
  task_id: string; title: string; workspace_path: string;
  created_at: number; updated_at: number; task_status: string;
}
interface Part {
  id: string; message_id: string; time_created: number; data: string; message_data: string;
}
const iso = (time: number) => new Date(time).toISOString();

export class ZCodeSource implements ConversationSource {
  constructor(readonly root = join(homedir(), ".zcode")) {}

  async listThreadPage(limit = 30, cursor?: string): Promise<ConversationPage> {
    const offset = pageOffset(cursor), size = Math.max(1, Math.min(100, limit));
    const rows = readDatabase(join(this.root, "v2/tasks-index.sqlite"), db =>
      db.prepare("SELECT task_id, title, workspace_path, created_at, updated_at, task_status FROM tasks WHERE deleted=0 AND provider='glm' ORDER BY updated_at DESC, task_id LIMIT ? OFFSET ?")
        .all(size + 1, offset) as unknown as Task[]);
    return {
      threads: rows.slice(0, size).map(summary),
      nextCursor: rows.length > size ? String(offset + size) : null,
    };
  }

  async readThread(id: string): Promise<NormalizedThread> {
    const task = readDatabase(join(this.root, "v2/tasks-index.sqlite"), db =>
      db.prepare("SELECT task_id, title, workspace_path, created_at, updated_at, task_status FROM tasks WHERE task_id=? AND deleted=0 AND provider='glm'").get(id) as unknown as Task | undefined);
    if (!task) throw new Error("ZCode 会话不存在或不是本地 ZCode Agent 会话。");
    return readDatabase(join(this.root, "cli/db/db.sqlite"), db => {
      if (!db.prepare("SELECT id FROM session WHERE id=?").get(id))
        throw new Error("ZCode 会话正文尚不可用，请稍后重试。");
      const rows = db.prepare(`SELECT p.id, p.message_id, p.time_created, p.data, m.data AS message_data
        FROM message m JOIN part p ON p.message_id=m.id AND p.session_id=m.session_id
        WHERE m.session_id=? ORDER BY m.sequence, m.time_created, m.id, p.sequence, p.time_created, p.id`).all(id) as unknown as Part[];
      const events: NormalizedThread["events"] = [];
      for (const row of rows) {
        const message = object(JSON.parse(row.message_data)), part = object(JSON.parse(row.data));
        const semantics = object(message.semantics);
        if (semantics.uiVisibility === "hidden" || semantics.transcriptVisibility === "hidden") continue;
        if (message.role !== "user" && message.role !== "assistant") continue;
        // Ignore in-flight assistant messages: Source Archive is append-only.
        if (message.role === "assistant" && typeof object(message.time).completed !== "number") continue;
        if (part.synthetic === true || part.ignored === true) continue;
        const add = (suffix: string, kind: Parameters<typeof historyEvent>[4], content: string, metadata = {}) => {
          if (content.trim()) events.push(historyEvent("zcode", id, `${row.id}:${suffix}`, events.length + 1, kind, content, iso(row.time_created), { messageId: row.message_id, ...metadata }));
        };
        if (part.type === "text" && typeof part.text === "string")
          add("text", message.role === "user" ? "user.prompt" : "agent.response", part.text);
        if (part.type === "file" && typeof part.url === "string" && !part.url.startsWith("data:"))
          add("file", "artifact.added", part.url, { path: part.url, role: "INPUT" });
        if (part.type === "tool") {
          const state = object(part.state);
          if (state.status !== "completed" && state.status !== "error") continue;
          add("call", "tool.call", `${String(part.tool)}\n${JSON.stringify(state.input ?? {})}`, { toolName: part.tool, callId: part.callID });
          const result = state.status === "error" ? state.error : state.output;
          if (typeof result === "string") add("result", "tool.result", result, { toolName: part.tool, callId: part.callID, status: state.status });
        }
      }
      return { threadId: id, title: task.title, applicationTitle: task.title || null,
        cwd: task.workspace_path, createdAt: iso(task.created_at), updatedAt: iso(task.updated_at), events };
    });
  }
  close(): void {}
}

function summary(task: Task): ConversationSummary {
  return { id: task.task_id, title: task.title || null, preview: "", cwd: task.workspace_path,
    updatedAt: iso(task.updated_at), status: task.task_status };
}
