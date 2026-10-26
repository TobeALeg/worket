import { readFile, readdir, stat, realpath } from "node:fs/promises";
import { join, relative, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { readDatabase, pageOffset, object } from "../local-history.js";
import { readVisibleTranscript } from "./local-transcript.js";
import type { ConversationPage, ConversationSummary } from "../../executors/types.js";
import type { NormalizedThread } from "../types.js";

type Session = { id: string; title: string | null; custom_title: string | null; cwd: string; status: string; created_at: number; updated_at: number };
const settled = new Set(["completed", "error", "cancelled", "canceled", "idle"]);
const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024;
export class WorkBuddyLocalHistory {
  constructor(readonly root = join(homedir(), ".workbuddy")) {}
  async #accountUid(): Promise<string> {
    let snapshot: unknown;
    try {
      snapshot = JSON.parse(await readFile(join(this.root, "storage/skeleton/account-snapshot.json"), "utf8"));
    } catch (error) {
      if (!(error instanceof SyntaxError) && object(error).code !== "ENOENT") throw error;
    }
    const uid = object(object(snapshot).primary).uid;
    if (typeof uid !== "string" || !uid.trim())
      throw new Error("WorkBuddy 账号信息暂不可用，请打开 WorkBuddy 并确认已登录，进入聊天首页后返回 Worket 刷新。已有工作记录不受影响。");
    return uid;
  }
  async #sessions(): Promise<Session[]> {
    const uid = await this.#accountUid();
    return readDatabase(join(this.root, "workbuddy.db"), db => db.prepare(
      "SELECT id,title,custom_title,cwd,status,created_at,updated_at FROM sessions WHERE deleted_at IS NULL AND user_id = ? AND (transport = 'local' OR transport IS NULL) ORDER BY updated_at DESC,id DESC",
    ).all(uid) as Session[]);
  }
  async inspect(): Promise<void> { await this.#sessions(); }
  async #files(): Promise<Map<string, string>> {
    const root = join(this.root, "projects");
    const result = new Map<string, string>();
    for (const directory of await readdir(root, { withFileTypes: true })) {
      if (!directory.isDirectory()) continue;
      for (const file of await readdir(join(root, directory.name), { withFileTypes: true })) {
        if (!file.isFile() || !file.name.endsWith(".jsonl")) continue;
        const id = file.name.slice(0, -6);
        if (result.has(id)) throw new Error("WorkBuddy 本地记录有重复会话路径，无法安全选择。");
        result.set(id, join(root, directory.name, file.name));
      }
    }
    return result;
  }
  async listThreadPage(limit = 30, cursor?: string, searchTerm?: string): Promise<ConversationPage> {
    const sessions = await this.#sessions();
    const files = await this.#files();
    const offset = pageOffset(cursor);
    const size = Math.max(1, Math.min(100, Math.floor(limit) || 30));
    const query = searchTerm?.trim().toLocaleLowerCase();
    const readable = sessions.filter(s => files.has(s.id));
    const matching = readable.filter(s => !query || (s.custom_title || s.title || "").toLocaleLowerCase().includes(query));
    return { threads: matching.slice(offset, offset + size).map(summary),
      nextCursor: offset + size < matching.length ? String(offset + size) : null,
      notice: `读取本机留存的对话文字与显式附件，不包含工具过程或云端未落盘历史。${sessions.length > readable.length ? `另有 ${sessions.length - readable.length} 个会话没有本地正文。` : ""}` };
  }
  async readThread(id: string): Promise<NormalizedThread> {
    const session = (await this.#sessions()).find(s => s.id === id);
    if (!session) throw new Error("WorkBuddy 会话已删除、不属于当前账号或不是本地会话。");
    const file = (await this.#files()).get(id);
    if (!file) throw new Error("WorkBuddy 没有留存这段会话的本地正文，请在原应用导出或选定内容导入。");
    const [root, path] = await Promise.all([realpath(join(this.root, "projects")), realpath(file)]);
    const rel = relative(root, path);
    if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("WorkBuddy 本地记录路径越界。");
    const before = await stat(path);
    if (before.size > MAX_TRANSCRIPT_BYTES) throw new Error("WorkBuddy 本地记录过大，未导入不完整历史。");
    const body = await readFile(path, "utf8");
    const after = await stat(path);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error("WorkBuddy 正在写入记录，请稍后重试。");
    const events = readVisibleTranscript(body, id, settled.has(session.status));
    return { threadId: id, title: session.custom_title || session.title || "未命名工作", applicationTitle: session.custom_title || session.title,
      cwd: session.cwd || "", createdAt: new Date(session.created_at).toISOString(), updatedAt: new Date(session.updated_at).toISOString(), events };
  }
  close(): void {}
}
function summary(s: Session): ConversationSummary {
  return { id: s.id, title: s.custom_title || s.title, preview: "", cwd: s.cwd || "", updatedAt: new Date(s.updated_at).toISOString(), status: s.status };
}
