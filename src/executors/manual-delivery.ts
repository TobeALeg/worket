import type { DeliveryRequest, DeliveryReceipt } from "./types.js";
import { buildWorkBootstrap } from "./work-bootstrap.js";

export interface ManualDelivery {
  openApplication(bundleId: string): Promise<void>;
  writeClipboard(text: string): void;
}

/** A pending delivery: opening an application is never a binding receipt. */
export async function deliverViaClipboard(
  desktop: ManualDelivery, bundleId: string, name: string, request: DeliveryRequest,
): Promise<DeliveryReceipt> {
  await desktop.openApplication(bundleId);
  desktop.writeClipboard(buildWorkBootstrap({
    ...request, currentTask: "请读取交接主包并核对目标和当前进度。",
    nextStep: "核对候选动作后从当前断点继续，完成后等待用户验收。", artifactPaths: [],
  }));
  return { guidance: `启动指令已复制，请在 ${name} 新建聊天并粘贴发送；发送后自动确认记录。` };
}
