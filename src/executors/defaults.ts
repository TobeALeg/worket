import { desktopExecutorInstalled } from "./installation.js";
import { createWebExecutors } from "../connectors/web-executor.js";
import { createQwenWorkExecutor } from "../adapters/qwenwork/executor.js";
import { createCodexExecutor } from "../adapters/codex/executor.js";
import { createWorkBuddyExecutor } from "../adapters/workbuddy/executor.js";
import { createZCodeExecutor } from "../adapters/zcode/executor.js";
import { createAntigravityExecutor } from "../adapters/antigravity/executor.js";
import type { ManualDelivery } from "./manual-delivery.js";
import type { ExecutorAdapter, ConversationSource } from "./types.js";
import type { WorkBuddyLauncher } from "../adapters/workbuddy/launcher.js";
export function createDefaultExecutors(options: {
  codex?: ConversationSource;
  workbuddy?: ConversationSource;
  zcode?: ConversationSource;
  antigravity?: ConversationSource;
  desktop?: ManualDelivery;
  launcher: WorkBuddyLauncher;
  applicationForProtocol?: (url: string) => Promise<string | null>;
  openUrl?: (url: string) => Promise<void>;
}): ExecutorAdapter[] {
  const adapters = [createCodexExecutor(options), createWorkBuddyExecutor(options), createZCodeExecutor(options), createAntigravityExecutor(options), createQwenWorkExecutor(options), ...createWebExecutors(options)];
  for (const adapter of adapters) {
    if (["codex", "workbuddy", "zcode", "antigravity"].includes(adapter.id) &&
        !options[adapter.id as "codex" | "workbuddy" | "zcode" | "antigravity"]) {
      adapter.isInstalled = () => desktopExecutorInstalled(adapter.id, options.applicationForProtocol);
    }
  }
  return adapters;
}
