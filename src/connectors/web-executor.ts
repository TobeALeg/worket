import type { ExecutorAdapter } from "../executors/types.js";
import type { ManualDelivery } from "../executors/manual-delivery.js";
import { WEB_CONNECTORS } from "./catalog.js";
export function createWebExecutors(options: { openUrl?: (url: string) => Promise<void>; desktop?: ManualDelivery }): ExecutorAdapter[] {
  return WEB_CONNECTORS.map(item => ({
    id: item.id, name: item.name, mark: item.mark, bundleIds: [],
    environment: { type: "WEB_SELECTED", name: item.name },
    capabilities: { deliveryMode: "INLINE_PACKAGE", transport: "WEB_CLIPBOARD", source: "SELECTED_CONTENT", mcp: false, sendsAutomatically: false, files: "MANUAL_UPLOAD" },
    async inspect() {}, async resolveCurrent() { return null; },
    ...(options.desktop && (!item.url || options.openUrl) ? { async deliver(request: import("../executors/types.js").DeliveryRequest) {
      if (item.url) await options.openUrl!(item.url);
      options.desktop!.writeClipboard(request.prompt);
      return { status: "OPENED" as const, guidance: ("modeGuidance" in item ? item.modeGuidance + " " : "") + "工作包已复制，请在目标会话粘贴发送。网页消息须主动导入后才会绑定；附件另行选择上传。" };
    } } : {}),
  }));
}
