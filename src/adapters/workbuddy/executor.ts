import { reconcileLegacyEvents } from "./legacy-events.js";
import { WorkBuddyDesktopClient } from "./desktop-client.js";
import { WorkBuddyLocalHistory } from "./local-history.js";
import { buildWorkBuddyDeepLink } from "./deep-link.js";
import { installWorkBuddyUserIntegration } from "./install.js";
import { conversationPage } from "../../executors/registry.js";
import { resolveThreadFromWindowTitle } from "../../executors/conversation-resolution.js";
import type { WorkBuddyLauncher } from "./launcher.js";
import type {
  ExecutorAdapter,
  ConversationSource,
} from "../../executors/types.js";
export function createWorkBuddyExecutor(options: {
  workbuddy?: ConversationSource;
  launcher: WorkBuddyLauncher;
}): ExecutorAdapter {
  const buddy = options.workbuddy ?? new WorkBuddyLocalHistory();
  const adapter: ExecutorAdapter = {
    capabilities: { deliveryMode: "MCP_REFERENCE", transport: "DEEP_LINK", source: "HISTORY", mcp: true, sendsAutomatically: false, files: "LOCAL_REFERENCES" },
    id: "workbuddy",
    name: "WorkBuddy",
    mark: "W",
    bundleIds: [
      "com.tencent.workbuddy.mac",
      "WorkBuddy.exe",
      "workbuddy.exe",
    ],
    environment: { type: "WORKBUDDY_DESKTOP", name: "WorkBuddy Desktop" },
    source: buddy,
    reconcileHistory: reconcileLegacyEvents,
    install: installWorkBuddyUserIntegration,
    async inspect() {
      if (buddy instanceof WorkBuddyDesktopClient || buddy instanceof WorkBuddyLocalHistory) await buddy.inspect();
    },
    async inspectDelivery() {
      if (options.launcher.inspect) await options.launcher.inspect();
      else await adapter.inspect();
    },
    async resolveCurrent(app) {
      if (!app.windowTitle?.trim()) return null;
      const { threads } = await conversationPage(adapter);
      return resolveThreadFromWindowTitle(
        app.windowTitle?.replace(/\s+[—–-]\s+(?:WorkBuddy)$/iu, "") ?? null,
        threads,
      );
    },
    async deliver(request) {
      await options.launcher.openNewConversation(
        buildWorkBuddyDeepLink(request.prompt),
      );
      return { status: "OPENED", guidance: "已请求启动任务，实际发送及接手仍需目标消息确认。" };
    },
  };
  return adapter;
}
