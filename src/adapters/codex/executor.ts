import { CodexAppServerClient } from "./app-server-client.js";
import { installCodexIntegration } from "./install.js";
import { conversationPage } from "../../executors/registry.js";
import {
  resolveThreadFromWindowTitle,
  resolveThreadFromRecentActivity,
} from "../../executors/conversation-resolution.js";
import type {
  ExecutorAdapter,
  ConversationSource,
} from "../../executors/types.js";
export function createCodexExecutor(options: {
  codex?: ConversationSource;
  openUrl?: (url: string) => Promise<void>;
}): ExecutorAdapter {
  const codex = options.codex ?? new CodexAppServerClient();
  const adapter: ExecutorAdapter = {
    capabilities: { deliveryMode: "MCP_REFERENCE", transport: "DEEP_LINK", source: "HISTORY", mcp: true, sendsAutomatically: false, files: "LOCAL_REFERENCES" },
    id: "codex",
    name: "Codex",
    mark: "⌘",
    bundleIds: ["com.openai.codex", "DOVE.tauri", "Codex.exe", "ChatGPT.exe"],
    environment: { type: "CODEX_DESKTOP", name: "Codex Desktop" },
    source: codex,
    install: installCodexIntegration,
    async inspect() {
      await conversationPage(adapter);
    },
    async resolveCurrent(app) {
      const { threads } = await conversationPage(adapter);
      const rawWindowTitle = app.windowTitle?.trim() ?? "";
      const windowTitle = /^(?:ChatGPT|Codex)$/iu.test(rawWindowTitle) ? "" : rawWindowTitle;
      const thread = windowTitle
        ? resolveThreadFromWindowTitle(
            windowTitle.replace(/\s+[—–-]\s+(?:Codex|ChatGPT)$/iu, ""),
            threads,
          )
        : resolveThreadFromRecentActivity(threads);
      return thread?.title?.trim() ? thread : null;
    },
    ...(options.openUrl
      ? {
          async deliver(
            request: import("../../executors/types.js").DeliveryRequest,
          ) {
            const url = new URL("codex://new");
            url.searchParams.set("prompt", request.prompt);
            if (request.cwd) url.searchParams.set("path", request.cwd);
            await options.openUrl!(url.toString());
            return { status: "OPEN_REQUESTED", guidance: "请检查 Codex 是否出现预填草稿；草稿出现后仍需由你确认发送。打开请求返回不代表草稿已出现。" };
          },
        }
      : {}),
  };
  return adapter;
}
