export interface WorkBootstrapInput {
  workId: string;
  deliveryId?: string;
  purpose?: "START" | "CONTINUE";
  title: string;
  currentTask: string;
  nextStep: string;
  artifactPaths: string[];
  contextVersion?: 2 | 3 | 4;
}

export function buildWorkBootstrap(input: WorkBootstrapInput): string {
  const artifacts = input.artifactPaths.length
    ? input.artifactPaths.map((path) => `- ${path}`).join("\n")
    : "- 无";
  const contextVersion = input.contextVersion ?? 4;
  return [
    `[WORKPET:${input.workId}]`,
    ...(input.deliveryId ? [`[DELIVERY:${input.deliveryId}]`] : []),
    input.purpose === "START"
      ? `请开展一项新工作：${input.title}`
      : `你正在接手同一项工作：${input.title}`,
    "",
    `当前任务：${input.currentTask || "请先读取工作记录确认当前状态"}`,
    `下一步：${input.nextStep || "调用 Worket MCP 获取工作上下文"}`,
    "",
    "请先调用 Worket MCP 的 get_work_context，参数 work_id=" + input.workId + "、context_version=" + contextVersion + (input.deliveryId ? "、delivery_id=" + input.deliveryId : "") + "。",
    "按工作说明继续；缺少影响执行的信息时再询问。",
    "",
    "当前可能需要的资料：",
    artifacts,
  ].join("\n");
}
