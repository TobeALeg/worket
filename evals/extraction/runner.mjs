import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { environmentSnapshot, readJsonl, runId as createRunId, safeCase, sha256, writeJson } from "./lib.mjs";
import { preflight } from "./policy.mjs";

function trialId(caseId, repeat) {
  return `${caseId}-${String(repeat).padStart(2, "0")}`;
}

export async function runExperiment({ root, config, sourcePath, adapter, approval = null, retryOf = null }) {
  const gate = preflight({ config, sourcePath, adapter, approval });
  if (gate.status !== "READY") {
    const error = new Error(`PREFLIGHT_BLOCKED:${gate.errors.join(",")}`);
    error.gate = gate;
    throw error;
  }
  const allCases = readJsonl(sourcePath);
  const selected = config.selected_case_ids?.length
    ? allCases.filter((item) => config.selected_case_ids.includes(item.case_id))
    : allCases;
  if (!selected.length) throw new Error("NO_CASES_SELECTED");
  if (selected.some((item) => item.source_type !== config.source_classification)) throw new Error("SOURCE_CLASSIFICATION_MISMATCH");
  if (config.source_classification === "AUTHORIZED_REAL" && selected.some((item) => !config.allowed_splits.includes(item.split)))
    throw new Error("SPLIT_NOT_ALLOWED");

  const id = createRunId(config.experiment_id);
  const runDirectory = resolve(root, "evals/extraction/runs", id);
  mkdirSync(join(runDirectory, "trials"), { recursive: true });
  const manifest = {
    schema_version: 1,
    run_id: id,
    retry_of: retryOf,
    status: "RUNNING",
    mode: adapter.live ? "LIVE" : "OFFLINE",
    source_classification: config.source_classification,
    adapter_id: adapter.id,
    source_manifest: config.source_manifest,
    source_sha256: sha256(await import("node:fs").then(({ readFileSync }) => readFileSync(sourcePath))),
    approval_fingerprint: gate.fingerprint,
    selected_case_ids: selected.map((item) => item.case_id),
    config,
    environment: environmentSnapshot(root),
  };
  writeJson(join(runDirectory, "manifest.json"), manifest, { exclusive: true });

  let providerCallsReserved = 0;
  let providerCallsObserved = 0;
  let providerCallObservationComplete = true;
  const trials = [];
  for (const original of selected) {
    for (let repeat = 1; repeat <= config.repeats; repeat += 1) {
      const idForTrial = trialId(original.case_id, repeat);
      const common = {
        schema_version: 1,
        run_id: id,
        trial_id: idForTrial,
        case_id: original.case_id,
        repeat,
        source_type: original.source_type,
        track: null,
        stage: "raw",
        started_at: new Date().toISOString(),
        manual_active_seconds: null,
      };
      if (providerCallsReserved + adapter.estimatedProviderCalls > config.execution.max_provider_calls_total) {
        const blocked = { ...common, status: "BLOCKED", error: "PROVIDER_CALL_BUDGET_EXCEEDED", finished_at: new Date().toISOString() };
        writeJson(join(runDirectory, "trials", `${idForTrial}.json`), blocked, { exclusive: true });
        trials.push(blocked);
        continue;
      }
      try {
        const result = await adapter.execute({
          caseData: safeCase(original),
          runId: id,
          runDirectory,
          trialId: idForTrial,
          timeoutSeconds: config.execution.timeout_seconds,
        });
        const afterPersist = result.afterPersist;
        delete result.afterPersist;
        providerCallsReserved += result.usage?.provider_calls_reserved ?? adapter.estimatedProviderCalls;
        if (result.usage?.provider_calls_observed === null || result.usage?.provider_calls_observed === undefined)
          providerCallObservationComplete = false;
        else providerCallsObserved += result.usage.provider_calls_observed;
        const completed = { ...common, ...result, status: "SUCCEEDED", finished_at: new Date().toISOString() };
        writeJson(join(runDirectory, "trials", `${idForTrial}.json`), completed, { exclusive: true });
        try {
          await afterPersist?.();
        } catch (error) {
          writeJson(join(runDirectory, "trials", `${idForTrial}.ack-error.json`), {
            trial_id: idForTrial,
            error: error instanceof Error ? error.message : String(error),
            note: "原始结果已持久化；远端结果确认清理失败，不影响 trial 结果。",
          }, { exclusive: true });
        }
        trials.push(completed);
      } catch (error) {
        providerCallsReserved += adapter.estimatedProviderCalls;
        if (adapter.estimatedProviderCalls > 0) providerCallObservationComplete = false;
        const failed = {
          ...common,
          status: "FAILED",
          error: error instanceof Error ? error.message : String(error),
          usage: {
            provider_calls_observed: null,
            provider_calls_reserved: adapter.estimatedProviderCalls,
            input_tokens: null,
            output_tokens: null,
            cost: null,
          },
          finished_at: new Date().toISOString(),
        };
        writeJson(join(runDirectory, "trials", `${idForTrial}.json`), failed, { exclusive: true });
        trials.push(failed);
      }
    }
  }
  const report = {
    schema_version: 1,
    run_id: id,
    status: trials.some((trial) => trial.status === "FAILED") ? "COMPLETED_WITH_FAILURES" : trials.some((trial) => trial.status === "BLOCKED") ? "COMPLETED_WITH_BLOCKS" : "AWAITING_HUMAN_REVIEW",
    semantic_quality_status: "NOT_JUDGED",
    mock_or_structure_success_is_not_quality: true,
    counts: Object.fromEntries(["SUCCEEDED", "FAILED", "BLOCKED"].map((status) => [status.toLowerCase(), trials.filter((trial) => trial.status === status).length])),
    evidence_class: adapter.id === "mock" ? "MOCK_STRUCTURE_ONLY" : config.source_classification === "SYNTHETIC" ? "SYNTHETIC_PRODUCT_PATH" : "AUTHORIZED_REAL_PRODUCT_PATH",
    provider_calls_reserved: providerCallsReserved,
    provider_calls_observed: providerCallObservationComplete ? providerCallsObserved : null,
    token_usage: null,
    cost: null,
    resource_limit_note: "调用预留上限由 runner 强制；token 与币种费用仅在 provider 返回时可核销，本轮托管接口未返回，因此保持 null。",
  };
  writeJson(join(runDirectory, "report.json"), report, { exclusive: true });
  return { runDirectory, manifest, report, trials };
}
