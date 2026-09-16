import { createCodexExecutor } from "../adapters/codex/executor.js";
import { createWorkBuddyExecutor } from "../adapters/workbuddy/executor.js";
import { createZCodeExecutor } from "../adapters/zcode/executor.js";
import type { ManualDelivery } from "./manual-delivery.js";
import type { ExecutorAdapter, ConversationSource } from "./types.js";
import type { WorkBuddyLauncher } from "../adapters/workbuddy/launcher.js";
export function createDefaultExecutors(options: {
  codex?: ConversationSource;
  workbuddy?: ConversationSource;
  zcode?: ConversationSource;
  desktop?: ManualDelivery;
  launcher: WorkBuddyLauncher;
  openUrl?: (url: string) => Promise<void>;
}): ExecutorAdapter[] {
  return [createCodexExecutor(options), createWorkBuddyExecutor(options), createZCodeExecutor(options)];
}
