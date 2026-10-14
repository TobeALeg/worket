import { object, historyEvent } from "../local-history.js";
import type { NormalizedSourceEvent } from "../types.js";
import { isAbsolute } from "node:path";

/** Project transcripts are append evidence, not proof of canonical history/deletions. */
export function readVisibleTranscript(body: string, sessionId: string, settled: boolean): NormalizedSourceEvent[] {
  const records = new Map<string, Record<string, unknown>>();
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]!.trim()) continue;
    let row: Record<string, unknown>;
    try { row = object(JSON.parse(lines[i]!)); }
    catch { throw new Error("WorkBuddy 本地记录尚未写完或格式损坏，请稍后重试。"); }
    if (row.sessionId !== undefined && row.sessionId !== sessionId)
      throw new Error("WorkBuddy 本地记录的会话身份不一致。");
    if (row.type !== "message") continue;
    if (typeof row.id !== "string" || !Array.isArray(row.content))
      throw new Error("WorkBuddy 本地消息格式不兼容。");
    records.set(row.id, row);
  }
  const rows = [...records.values()].filter(row => {
    const data = object(row.providerData);
    return !data.isMeta && !data.isSummary && !data.isCompactInternal && !data.skipRun;
  });
  const lastRequest = [...rows].reverse().find(row => row.role === "user");
  const activeRequest = object(lastRequest?.providerData).conversationRequestId;
  const events: NormalizedSourceEvent[] = [];
  for (const row of rows) {
    const data = object(row.providerData);
    if (row.role !== "user" && row.role !== "assistant") continue;
    if (!settled && row.role === "assistant" && (!activeRequest || data.conversationRequestId === activeRequest)) continue;
    const time = new Date(row.timestamp as string | number);
    if (!Number.isFinite(time.getTime())) throw new Error("WorkBuddy 本地消息缺少有效时间。");
    for (const [index, raw] of (row.content as unknown[]).entries()) {
      const block = object(raw);
      if (!["input_text", "output_text"].includes(String(block.type)) || typeof block.text !== "string") continue;
      let text = block.text;
      if (row.role === "user") {
        // The final user_query is the visible prompt; injected context is never archived.
        const image = text.match(/^<image_local_path>([\s\S]+)<\/image_local_path>$/);
        if (image && isAbsolute(image[1]!)) {
          events.push(historyEvent("workbuddy", sessionId, `${row.id}:artifact:${index}`, events.length + 1,
            "artifact.added", image[1]!, time.toISOString(), { path: image[1], role: "INPUT", sessionId, workbuddyLocal: true }));
          continue;
        }
        text = text.replace(/^(?:\s*<system-reminder\b[^>]*>[\s\S]*?<\/system-reminder>\s*)+/, "");
        if (text.startsWith("<user_query>") && text.trimEnd().endsWith("</user_query>"))
          text = text.trimEnd().slice(12, -13);
        else if (/<(?:system-reminder|user_references|conversation_history_summary|task-notification|image_local_path)\b/.test(text)) continue;
      }
      if (!text.trim()) continue;
      events.push(historyEvent("workbuddy", sessionId, `${row.id}:text:${index}`, events.length + 1,
        row.role === "user" ? "user.prompt" : "agent.response", text, time.toISOString(),
        { sessionId, workbuddyLocal: true, ...(typeof data.conversationRequestId === "string" ? { workbuddyRequestId: data.conversationRequestId } : {}) }));
      // Only explicit local references in visible text become artifacts; never inspect tools/thoughts.
      const paths = row.role === "user" ? [...text.matchAll(/@"([^"\n]+)"/g)].map(match => match[1]!)
        : [...text.matchAll(/\]\((\/[^)\n]+)\)/g)].map(match => match[1]!);
      for (const [ref, path] of [...new Set(paths.filter(isAbsolute))].entries())
        events.push(historyEvent("workbuddy", sessionId, `${row.id}:ref:${index}:${ref}`, events.length + 1,
          "artifact.added", path, time.toISOString(), { path, role: row.role === "user" ? "INPUT" : "OUTPUT", sessionId, workbuddyLocal: true }));
    }
  }
  return events;
}
