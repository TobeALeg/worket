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
  if (error?.includes("INVALID_SOURCE_REF")) return "生成内容的引用未通过核验，未保存为候选。可以重试，原始记录仍然保留。";
  if (error?.includes("MODEL_TIMEOUT")) return "模型处理超时，可以重试，原始记录仍然保留。";
  if (error?.includes("INVALID_MODEL_OUTPUT")) return "生成结果格式不完整，可以重试。";
  if (error?.includes("INCOMPLETE_COVERAGE")) return "部分记录未被完整处理，可以重试。";
  if (error?.includes("RESULT_EXPIRED") || error?.includes("SERVICE_INTERRUPTED")) return "服务处理已中断或结果已过期，可以重试。";
  return error ?? "";
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
