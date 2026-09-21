import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { approvalDocument, preflight } from "../policy.mjs";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "worket-eval-policy-"));
  const sourcePath = join(directory, "cases.jsonl");
  writeFileSync(sourcePath, '{"case_id":"SYN","source_type":"SYNTHETIC"}\n');
  const config = {
    schema_version: 1, experiment_id: "E0", source_manifest: "cases.jsonl", source_classification: "SYNTHETIC", selected_case_ids: [], repeats: 1,
    live: { enabled: true, authorization_ref: "USER-2026-09-21", approved_sources: ["cases.jsonl"], approved_provider: "provider", budget_currency: "CNY", budget_amount: 10 },
    execution: { timeout_seconds: 30, input_token_cap: 1000, output_token_cap: 1000, max_provider_calls_total: 20, max_provider_calls_per_trial: 2, concurrency: 1 },
  };
  const adapter = { id: "live", live: true };
  return { config, sourcePath, adapter };
}

test("live 缺少冻结 approval 时阻断，匹配后通过", () => {
  const value = fixture();
  assert.equal(preflight(value).status, "BLOCKED");
  const approval = approvalDocument(value);
  assert.equal(preflight({ ...value, approval }).status, "READY");
});

test("来源或评分相关配置变化使旧 approval 失效", () => {
  const value = fixture();
  const approval = approvalDocument(value);
  writeFileSync(value.sourcePath, '{"case_id":"CHANGED","source_type":"SYNTHETIC"}\n');
  assert.deepEqual(preflight({ ...value, approval }).errors, ["APPROVAL_INVALIDATED"]);
});

test("预算未知或授权范围不含来源时阻断", () => {
  const value = fixture();
  value.config.live.budget_amount = null;
  value.config.live.approved_sources = [];
  assert.deepEqual(preflight(value).errors.filter((error) => error === "SOURCE_NOT_AUTHORIZED" || error === "BUDGET_REQUIRED"), ["SOURCE_NOT_AUTHORIZED", "BUDGET_REQUIRED"]);
});

test("mock 结果不能冒充真实证据", () => {
  const value = fixture();
  value.config.source_classification = "AUTHORIZED_REAL";
  value.adapter = { id: "mock", live: false, estimatedProviderCalls: 0 };
  assert.ok(preflight(value).errors.includes("MOCK_CANNOT_PRODUCE_REAL_EVIDENCE"));
});
