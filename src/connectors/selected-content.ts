import { createHash } from "node:crypto";
import type { NormalizedThread } from "../adapters/types.js";
import { validateSourceUrl } from "./catalog.js";
export interface SelectedMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}
export interface SelectedContent {
  schemaVersion: 1;
  adapterId: string;
  /** Explicit locator entered by the user; never infer a conversation from a title. */
  conversationId: string;
  title: string;
  url: string;
  messages: SelectedMessage[];
  scope: "SELECTED_CONTENT" | "HOOK_EVENTS";
  missingAttachments?: string[];
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function normalizeSelectedContent(value: SelectedContent, options: { environmentType?: string; desktopSelection?: boolean } = {}): NormalizedThread {
  if (!value || value.schemaVersion !== 1 || !["SELECTED_CONTENT", "HOOK_EVENTS"].includes(value.scope)) throw new Error("选定内容格式无效。");
  if (!/^[a-z][a-z0-9-]*$/.test(value.adapterId) || typeof value.conversationId !== "string" || !value.conversationId.trim() || value.conversationId.length > 2048 || /[\x00-\x1f]/.test(value.conversationId) || /^(pending|waiting):/.test(value.conversationId)) throw new Error("请提供有效的实际会话标识。");
  if (typeof value.title !== "string" || value.title.length > 512) throw new Error("标题过长或无效。");
  if (!Array.isArray(value.messages) || !value.messages.length || value.messages.length > 2000) throw new Error("请选择 1–2000 条可见消息。");
  if (JSON.stringify(value).length > 1_000_000) throw new Error("选定内容超过 1 MB；请缩小范围，未截断导入。");
  if (typeof value.url !== "string") throw new Error("来源地址格式无效。");
  const url = value.scope === "SELECTED_CONTENT" && !options.desktopSelection ? validateSourceUrl(value.adapterId, value.url) : "";
  const missing = value.missingAttachments ?? [];
  if (!Array.isArray(missing) || missing.length > 100 || missing.some(x => typeof x !== "string" || x.length > 1024)) throw new Error("附件引用无效。");
  const seen = new Set<string>(), counts = new Map<string, number>(), now = new Date().toISOString();
  const events = value.messages.map((message, sequence) => {
    if (!message || !["user", "assistant"].includes(message.role) || typeof message.content !== "string" || !message.content.trim()) throw new Error("消息必须是可见用户或助手正文。");
    if (message.id !== undefined && (typeof message.id !== "string" || !message.id || message.id.length > 512)) throw new Error("消息标识无效。");
    const digest = hash(`${message.role}\n${message.content}`), occurrence = counts.get(digest) ?? 0;
    counts.set(digest, occurrence + 1);
    const sourceId = message.id ?? `content:${digest}:${occurrence}`;
    if (seen.has(sourceId)) throw new Error("选定内容含重复消息标识。");
    seen.add(sourceId);
    const id = `${value.adapterId}:${hash(value.conversationId)}:${sourceId}`;
    const timestamp = message.timestamp ?? now;
    if (typeof timestamp !== "string" || !Number.isFinite(Date.parse(timestamp))) throw new Error("消息时间无效。");
    return { id, externalId: id, sequence: sequence + 1,
      kind: message.role === "user" ? "user.prompt" as const : "agent.response" as const,
      content: message.content, timestamp, executorType: message.role === "user" ? "HUMAN" as const : "AGENT" as const,
      environmentType: options.environmentType ?? (value.scope === "HOOK_EVENTS" ? "QWENWORK_DESKTOP" : "WEB_SELECTED"),
      metadata: { captureOrigin: value.scope === "HOOK_EVENTS" ? "HOOK" : options.desktopSelection ? "DESKTOP_VISIBLE" : "WEB_PAGE", captureScope: value.scope, historyComplete: false, sourceUrl: url,
        messageIdentity: message.id ? "PROVIDED" : "CONTENT_HASH", missingAttachments: missing },
    };
  });
  return { threadId: value.conversationId, title: value.title, cwd: "", createdAt: now, updatedAt: now, events };
}
