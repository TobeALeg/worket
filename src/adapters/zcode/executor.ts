import { access } from "node:fs/promises";
import type { ExecutorAdapter, ConversationSource } from "../../executors/types.js";
import { deliverViaClipboard, type ManualDelivery } from "../../executors/manual-delivery.js";
import { ZCodeSource } from "./source.js";
import { installZCodeIntegration } from "./install.js";

export function createZCodeExecutor(options: { zcode?: ConversationSource; desktop?: ManualDelivery } = {}): ExecutorAdapter {
  const source = options.zcode ?? new ZCodeSource();
  return {
    id: "zcode", name: "ZCode", mark: "Z", bundleIds: ["dev.zcode.app"],
    environment: { type: "ZCODE_DESKTOP", name: "ZCode Desktop" }, source,
    install: installZCodeIntegration,
    async inspect() { await access("/Applications/ZCode.app"); await source.listThreadPage?.(1); },
    // No verified current-conversation API; require explicit selection.
    async resolveCurrent() { return null; },
    ...(options.desktop ? { deliver: (request: import("../../executors/types.js").DeliveryRequest) =>
      deliverViaClipboard(options.desktop!, "dev.zcode.app", "ZCode", request) } : {}),
  };
}
