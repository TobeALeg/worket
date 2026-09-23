import { reconcileLegacyEvents } from "./legacy-events.js";
import { WorkBuddyDesktopClient } from "./desktop-client.js";
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
  const buddy = options.workbuddy ?? new WorkBuddyDesktopClient();
  const adapter: ExecutorAdapter = {
    id: "workbuddy",
    name: "WorkBuddy",
    mark: "W",
    bundleIds: ["com.tencent.workbuddy.mac"],
    environment: { type: "WORKBUDDY_DESKTOP", name: "WorkBuddy Desktop" },
    source: buddy,
    reconcileHistory: reconcileLegacyEvents,
    install: installWorkBuddyUserIntegration,
    async inspect() {
      if (buddy instanceof WorkBuddyDesktopClient) await buddy.inspect();
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
      return {};
    },
  };
  return adapter;
}
