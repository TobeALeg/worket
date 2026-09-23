import type { Job } from "./service.js";

export type ExtractionProgress = { phase: "extract" | "generalize"; completed: number; total: number };
export type DistillationActivity = {
  jobId: string;
  state: "running" | "ready" | "failed";
  label: string;
  detail: string;
  activeCount: number;
};
export const runningJob = (status: string): boolean => ["PREPARED", "SUBMITTED", "RUNNING"].includes(status);
export function jobError(error?: string): string {
  if (error?.includes("SERVICE_UPGRADE_REQUIRED")) return "当前后台尚不支持这项约定分析功能，请升级后台后重试。原始记录保持不变。";
  if (error?.includes("INVALID_SOURCE_REF")) return "生成内容的引用未通过核验，未保存为候选。可以重试，原始记录仍然保留。";
  if (error?.includes("MODEL_TIMEOUT")) return "模型处理超时，可以重试，原始记录仍然保留。";
  if (error?.includes("INVALID_MODEL_OUTPUT")) return "生成结果格式不完整，可以重试。";
  if (error?.includes("INCOMPLETE_COVERAGE")) return "部分记录未被完整处理，可以重试。";
  if (error?.includes("RESULT_EXPIRED") || error?.includes("SERVICE_INTERRUPTED")) return "服务处理已中断或结果已过期，可以重试。";
  return error ?? "";
}
// Commands fail for actionable reasons; the user sees this text instead of an error code.
const commandErrorText: Record<string, string> = {
  SOURCE_CHANGED: "来源记录或附件在确认后发生变化，请重新确认范围再开始。",
  BASE_DEFINITION_CHANGED: "约定已有更新版本，请返回最新版重新比较。当前草稿不会覆盖已有版本。",
  SOURCE_DELETED: "来源工作或附件已被删除，不能继续沉淀。",
  SKILL_ENTRY_MISSING: "请选择包含非空 SKILL.md 的技能目录。",
  SKILL_NAME_CONFLICT: "技能目录同名但内容不同，请选择名称明确且互不冲突的技能目录。",
  MATERIAL_MISSING: "所需附件在本地已不可用。请取消勾选该附件，或恢复文件后重试。",
  INPUT_TOO_LARGE: "本次材料超出后台限额，请减少来源或附件后重试。",
  UNSUPPORTED_FILE: "首版只分析 UTF-8 文本附件，二进制文件只能保留文件信息。",
  INVALID_MODEL_OUTPUT: "模型返回的内容格式不完整，未保存为候选。可以重试。",
  INVALID_SOURCE_REF: "生成内容的引用未通过核验，未保存为候选。可以重试，原始记录仍然保留。",
  INCOMPLETE_COVERAGE: "部分记录未被完整处理，不能作为候选。可以重试。",
  MODEL_REFUSAL: "模型拒绝了这次请求，未生成候选。可以调整来源后重试。",
  MODEL_UNAVAILABLE: "无法连接 Worket 服务，请检查网络和服务设置。已有本地内容不会丢失。",
  MODEL_TIMEOUT: "模型处理超时，可以重试，原始记录仍然保留。",
  AUTH_REQUIRED: "需要有效的 Worket 访问令牌，请重新登录或在服务设置中更新令牌。",
  AUTH_EXPIRED: "访问令牌已失效，请在 Worket 服务设置中重新登录。",
  QUOTA_EXCEEDED: "已达到服务额度限制，请稍后再试。",
  CONCURRENCY_LIMIT: "服务正在处理其他任务，请稍后再试。",
  INVALID_SERVICE_URL: "服务地址不合法，请在 Worket 服务设置中改为有效的 HTTPS 地址。",
  RESULT_EXPIRED: "结果已过期，无法取回。可以重试。",
  SERVICE_INTERRUPTED: "服务处理已中断，可以重试。",
  REVISION_CONFLICT: "候选内容已在别处更新，请重新打开后再保存。",
  IDEMPOTENCY_CONFLICT: "同一操作已用不同内容提交过，请重新发起。",
  DRAFT_NOT_EDITABLE: "该候选已失效或已确认，不能继续编辑。",
  UNRESOLVED_ISSUES: "仍有必须处理的问题，请先修改相关要求并选择处理方式。",
  INVALID_RULE_TARGET: "规则关联的保留目标不存在或未生效，请重新选择有效规则。",
  RULE_CYCLE: "规则之间形成了循环关联，请保留一个明确的最终目标。",
  RULE_SCOPE_MISMATCH: "适用范围或条件不同的要求不能直接合并或替代，请分别保留。",
  UNRESOLVED_RULE_CONFLICT: "规则仍有冲突，请先明确保留、修改或删除的内容。",
  MISSING_INFORMATION: "请补充有效交付要求和可检查的验收要求后保存。",
  INPUT_REQUIRED: "请补充必填输入后再继续。",
  CONFIRMATION_REQUIRED: "请按要求输入确认文字后再继续。",
  JOB_NOT_PUBLISHABLE: "该沉淀任务当前状态不允许保存，请刷新任务后再试。",
  CANCELLED: "该沉淀任务已取消。",
  NOT_FOUND: "找不到对应的记录，可能已被删除。",
  INVALID_INPUT: "提交的内容不合法，请检查输入后重试。",
};
// IPC preserves only the message, so read the code back from the text before falling back to it.
export function errorText(error: unknown): string {
  let raw = error instanceof Error ? error.message : String(error ?? "");
  // Electron prefixes the handler error; the handler itself may repeat the code as its message.
  for (let i = 0; i < 4; i++)
    raw = raw
      .replace(/^Error invoking remote method '[^']*':\s*/, "")
      .replace(/^Error:\s*/, "")
      .trim();
  const code = raw.match(/^([A-Z][A-Z0-9_]{3,})\b/)?.[1];
  const detail = raw.replace(/^[A-Z][A-Z0-9_]{3,}:\s*/, "").trim();
  // A specific explanation is more useful than the generic one; a bare code is the same thing twice.
  if (detail && detail !== code && !/^[A-Z][A-Z0-9_]{3,}$/.test(detail)) return detail;
  return (code && commandErrorText[code]) || raw;
}
export function progressLabel(progress?: ExtractionProgress): string {
  return progress?.phase === "extract"
    ? `正在提取记录 · ${progress.completed}/${progress.total} 批`
    : progress?.phase === "generalize" ? "正在整理候选定义" : "正在后台提取";
}
export function distillationActivity(jobs: Job[]): DistillationActivity | null {
  const active = jobs.filter(j => runningJob(j.status));
  const attention = jobs.filter(j => ["AWAITING_REVIEW", "NEEDS_SELECTION", "FAILED", "INTERRUPTED"].includes(j.status) && j.seenStatus !== j.status);
  const job = [...attention, ...active].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!job) return null;
  const running = runningJob(job.status);
  const ready = job.status === "AWAITING_REVIEW";
  return {
    jobId: job.id,
    state: running ? "running" : ready ? "ready" : "failed",
    label: running ? progressLabel(job.progress) : ready ? "沉淀完成，等待审阅" : job.status === "NEEDS_SELECTION" ? "沉淀需要重新选择来源" : "沉淀未完成，点击处理",
    detail: running ? `${active.length} 项正在处理，可继续其他工作` : ready ? "点击查看候选内容" : jobError(job.error),
    activeCount: active.length,
  };
}
