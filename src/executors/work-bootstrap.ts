export interface WorkBootstrapInput {
  workId: string;
  deliveryId?: string;
  purpose?: "START" | "CONTINUE";
  title: string;
  currentTask: string;
  nextStep: string;
  artifactPaths: string[];
  contextVersion?: 2 | 3;
}

export function buildWorkBootstrap(input: WorkBootstrapInput): string {
  const artifacts = input.artifactPaths.length
    ? input.artifactPaths.map((path) => `- ${path}`).join("\n")
    : "- 无";
  const contextVersion = input.contextVersion ?? 2;
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
    contextVersion === 3
      ? "以 v3 接续快照的当前阶段和适用约束为准。若 resolution 未解决或部分解析，先按缺口读取指定证据，再继续；不要把原始待办列表的先后误当成当前阶段。"
      : "先核对主包中的目标、断点、成果和条件；需要验证具体结论时，用证据 ID 调用 get_work_evidence。",
    "不要仅根据启动指令猜背景；按证据 ID 或序号调用 get_work_evidence，需要核对已被修订的历史时再读取 get_work_archive。",
    "",
    "当前可能需要的资料：",
    artifacts,
  ].join("\n");
}
