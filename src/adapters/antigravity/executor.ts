import { access } from "node:fs/promises";
import type { ExecutorAdapter, ConversationSource } from "../../executors/types.js";
import { deliverViaClipboard, type ManualDelivery } from "../../executors/manual-delivery.js";
import { AntigravitySource } from "./source.js";
import { installAntigravityIntegration } from "./install.js";

export function createAntigravityExecutor(options: { antigravity?: ConversationSource; desktop?: ManualDelivery } = {}): ExecutorAdapter {
  const source = options.antigravity ?? new AntigravitySource();
  return {
    id: "antigravity", name: "Antigravity", mark: "A", bundleIds: ["com.google.antigravity"],
    environment: { type: "ANTIGRAVITY_DESKTOP", name: "Antigravity Desktop" }, source,
    install: installAntigravityIntegration,
    async inspect() { await access("/Applications/Antigravity.app"); await source.listThreadPage?.(1); },
    async resolveCurrent() { return null; },
    ...(options.desktop ? { deliver: (request: import("../../executors/types.js").DeliveryRequest) =>
      deliverViaClipboard(options.desktop!, "com.google.antigravity", "Antigravity", request) } : {}),
  };
}
