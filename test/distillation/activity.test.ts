import { test } from "node:test";
import assert from "node:assert/strict";
import { distillationActivity, jobError } from "../../src/distillation/activity.ts";
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
