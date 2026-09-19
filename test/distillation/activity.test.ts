import { test } from "node:test";
import assert from "node:assert/strict";
import { distillationActivity, errorText, jobError } from "../../src/distillation/activity.ts";
import type { Job } from "../../src/distillation/service.ts";
const job = (status: Job["status"], extra: Partial<Job> = {}): Job => ({ id: status, status, snapshotId: "s", attempt: 1, commandId: "c", createdAt: "2026-09-18T00:00:00Z", ...extra });
test("background jobs show real progress; completion stays visible until opened", () => {
  const running = job("RUNNING", { progress: { phase: "extract", completed: 2, total: 4 } });
  assert.match(distillationActivity([running])!.label, /2\/4/);
  const ready = job("AWAITING_REVIEW");
  assert.equal(distillationActivity([running, ready])!.state, "ready");
  assert.equal(distillationActivity([running, ready])!.activeCount, 1);
  ready.seenStatus = ready.status;
  assert.equal(distillationActivity([running, ready])!.jobId, running.id);
  assert.equal(distillationActivity([ready]), null);
});
test("seen running tasks notify again on failure; stopped tasks do not show a spinner", () => {
  const failed = job("FAILED", { seenStatus: "RUNNING", error: "INVALID_SOURCE_REF" });
  assert.equal(distillationActivity([failed])!.state, "failed");
  assert.match(distillationActivity([failed])!.detail, /引用未通过核验/);
  assert.equal(distillationActivity([job("SAVED"), job("CANCELLED")]), null);
  assert.match(jobError("MODEL_TIMEOUT"), /超时/);
});

test("a new extraction stays visible instead of being hidden by old unread failures", () => {
  const old = job("FAILED");
  const fresh = job("RUNNING", { createdAt: "2026-09-18T01:00:00Z" });
  assert.equal(distillationActivity([old, fresh])!.state, "running");
});

test("command failures show actionable Chinese text instead of raw IPC error codes", () => {
  // Exactly what Electron surfaces to the renderer when an IPC handler throws.
  const ipc = new Error(
    "Error invoking remote method 'distillation:command': Error: MATERIAL_MISSING: 附件在本地已不可用，无法分析内容。请取消勾选或恢复文件：report.png",
  );
  // A specific explanation beats the generic one for the same code.
  assert.equal(errorText(ipc), "附件在本地已不可用，无法分析内容。请取消勾选或恢复文件：report.png");
  const repeated = new Error(
    "Error invoking remote method 'distillation:command': Error: INVALID_MODEL_OUTPUT: INVALID_MODEL_OUTPUT",
  );
  assert.equal(errorText(repeated), "模型返回的内容格式不完整，未保存为候选。可以重试。");
  assert.equal(errorText(new Error("SOURCE_CHANGED: SOURCE_CHANGED")), "来源记录或附件在确认后发生变化，请重新确认范围再开始。");
  assert.equal(errorText(new Error("MATERIAL_MISSING: MATERIAL_MISSING")), "所需附件在本地已不可用。请取消勾选该附件，或恢复文件后重试。");
  // Unmapped codes keep their detail rather than showing the code twice.
  assert.equal(errorText(new Error("WEIRD_CODE: 后台返回了新的原因")), "后台返回了新的原因");
  assert.equal(errorText(new Error("未知问题")), "未知问题");
  // The exact string the user reported.
  assert.equal(
    errorText(
      new Error(
        "Error invoking remote method 'distillation:command': Error: INVALID_MODEL_OUTPUT: INVALID_MODEL_OUTPUT",
      ),
    ),
    "模型返回的内容格式不完整，未保存为候选。可以重试。",
  );
  assert.equal(errorText("MATERIAL_MISSING: MATERIAL_MISSING"), "所需附件在本地已不可用。请取消勾选该附件，或恢复文件后重试。");
});
