import { access } from "node:fs/promises";
import type { ExecutorAdapter } from "../../executors/types.js";
import type { ManualDelivery } from "../../executors/manual-delivery.js";
import { installQwenWorkIntegration } from "./install.js";
export function createQwenWorkExecutor(options: { desktop?: ManualDelivery }): ExecutorAdapter {
  return { id: "qwenwork", name: "QwenWork 桌面（有限事件）", mark: "Q", bundleIds: [],
    environment: { type: "QWENWORK_DESKTOP", name: "QwenWork Desktop" }, installation: "EXPLICIT",
    capabilities: { deliveryMode: "INLINE_PACKAGE", transport: "CLIPBOARD", source: "HOOK_EVENTS", mcp: false, sendsAutomatically: false, files: "LOCAL_REFERENCES" },
    install: installQwenWorkIntegration,
    async inspect() { await access("/Applications/QwenWork.app"); }, async resolveCurrent() { return null; },
    ...(options.desktop ? { async deliver(request: import("../../executors/types.js").DeliveryRequest) {
      // Path is inspected rather than inventing a bundle identifier or deep-link protocol.
      const { execFile } = await import("node:child_process");
      await new Promise<void>((resolve, reject) => execFile("/usr/bin/open", ["/Applications/QwenWork.app"], error => error ? reject(error) : resolve()));
      options.desktop!.writeClipboard(request.prompt);
      return { status: "OPENED" as const, guidance: "工作包已复制，请新建会话并粘贴发送。Hook 仅记录已绑定用户提交，不承诺完整历史或助手全文。MCP 需单独设置。" };
    } } : {}),
  };
}
