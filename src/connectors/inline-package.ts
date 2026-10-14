import { packageMarkdown, type WorkPackage } from "../definitions/work-package.js";
import type { WorkSnapshot } from "../core/types.js";

export function inlineWorkPackage(work: WorkSnapshot, pkg: WorkPackage, deliveryId?: string): string {
  // These two markers bind replies to the same work; they are transport metadata.
  const text = [
    `[WORKPET:${work.instance.id}]`, ...(deliveryId ? [`[DELIVERY:${deliveryId}]`] : []),
    packageMarkdown(pkg, work, "web"),
  ].join("\n");
  if (text.length > 500_000) throw new Error("工作包超过 500000 字符。请选择导出或缩小工作范围，未截断交付。");
  return text;
}
