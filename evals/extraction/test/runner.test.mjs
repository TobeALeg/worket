import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { createMockAdapter } from "../adapters/mock.mjs";
import { runExperiment } from "../runner.mjs";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "worket-eval-runner-"));
  mkdirSync(join(root, "evals/extraction"), { recursive: true });
  for (const path of ["package-lock.json", "server/workflow.mjs", "src/extractor/openai-compatible-extractor.ts"]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), path);
  }
  // The environment snapshot intentionally uses Git; initialize the minimal test repository.
  execFileSync("git", ["init"], { cwd: root });
  execFileSync("git", ["config", "user.email", "eval@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Eval"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["-c", "commit.gpgsign=false", "commit", "-m", "fixture"], { cwd: root });
  const sourcePath = join(root, "cases.jsonl");
  writeFileSync(sourcePath, `${JSON.stringify({ case_id: "SYN01", source_type: "SYNTHETIC", work_id: "w", events: [{ id: "e", sequence: 1, kind: "user.prompt", content: "data" }], expected_semantic_assertions: ["SECRET_GOLD"] })}\n`);
  const config = {
    schema_version: 1, experiment_id: "test", source_manifest: "cases.jsonl", source_classification: "SYNTHETIC", selected_case_ids: [], repeats: 1,
    live: { enabled: false },
    execution: { timeout_seconds: 30, input_token_cap: 1000, output_token_cap: 1000, max_provider_calls_total: 20, max_provider_calls_per_trial: 2, concurrency: 1 },
  };
  return { root, sourcePath, config };
}

test("runner 不向 adapter 泄漏评分答案并生成不可覆盖账本", async () => {
  const value = setup();
  let received;
  const adapter = createMockAdapter();
  const execute = adapter.execute;
  adapter.execute = async (input) => { received = input.caseData; return execute(input); };
  const run = await runExperiment({ ...value, adapter });
  assert.equal("expected_semantic_assertions" in received, false);
  assert.equal(run.report.semantic_quality_status, "NOT_JUDGED");
  assert.match(readFileSync(join(run.runDirectory, "trials/SYN01-01.json"), "utf8"), /"manual_active_seconds": null/u);
});

test("失败 trial 留在报告中", async () => {
  const value = setup();
  const run = await runExperiment({ ...value, adapter: createMockAdapter({ failCaseId: "SYN01" }) });
  assert.equal(run.report.counts.failed, 1);
  assert.equal(run.report.status, "COMPLETED_WITH_FAILURES");
});
