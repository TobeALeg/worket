import { readFileSync } from "node:fs";
import { canonical, sha256 } from "./lib.mjs";

const positive = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
const RUNNER_CONTRACT_VERSION = "extraction-eval-v1.1";

export function approvalFingerprint({ config, sourcePath, adapterId }) {
  const liveScope = {
    experiment_id: config.experiment_id,
    source_classification: config.source_classification,
    selected_case_ids: config.selected_case_ids,
    repeats: config.repeats,
    live: config.live,
    execution: config.execution,
    runner_contract_version: RUNNER_CONTRACT_VERSION,
    adapter_id: adapterId,
    source_sha256: sha256(readFileSync(sourcePath)),
  };
  return sha256(canonical(liveScope));
}

export function preflight({ config, sourcePath, adapter, approval }) {
  const errors = [];
  if (config.schema_version !== 1) errors.push("UNSUPPORTED_CONFIG_SCHEMA");
  if (config.source_classification !== "SYNTHETIC" && config.source_classification !== "AUTHORIZED_REAL") errors.push("INVALID_SOURCE_CLASSIFICATION");
  if (!Number.isInteger(config.repeats) || config.repeats < 1) errors.push("INVALID_REPEATS");
  const execution = config.execution ?? {};
  for (const key of ["timeout_seconds", "input_token_cap", "output_token_cap", "max_provider_calls_total", "max_provider_calls_per_trial"])
    if (!positive(execution[key])) errors.push(`MISSING_OR_INVALID_${key.toUpperCase()}`);
  if (execution.concurrency !== 1) errors.push("ONLY_SERIAL_EXECUTION_SUPPORTED");
  if (positive(execution.max_provider_calls_per_trial) && adapter.estimatedProviderCalls > execution.max_provider_calls_per_trial) errors.push("ADAPTER_EXCEEDS_PER_TRIAL_CALL_LIMIT");
  if (adapter.id === "mock" && config.source_classification === "AUTHORIZED_REAL") errors.push("MOCK_CANNOT_PRODUCE_REAL_EVIDENCE");

  const liveRequested = adapter.live === true;
  const fingerprint = approvalFingerprint({ config, sourcePath, adapterId: adapter.id });
  if (liveRequested) {
    if (config.live?.enabled !== true) errors.push("LIVE_DISABLED");
    if (!config.live?.authorization_ref) errors.push("AUTHORIZATION_REQUIRED");
    if (!Array.isArray(config.live?.approved_sources) || !config.live.approved_sources.includes(config.source_manifest)) errors.push("SOURCE_NOT_AUTHORIZED");
    if (!config.live?.approved_provider) errors.push("PROVIDER_NOT_AUTHORIZED");
    if (!config.live?.budget_currency || !positive(config.live?.budget_amount)) errors.push("BUDGET_REQUIRED");
    if (!approval) errors.push("FROZEN_APPROVAL_REQUIRED");
    else {
      if (approval.fingerprint !== fingerprint) errors.push("APPROVAL_INVALIDATED");
      if (approval.authorization_ref !== config.live.authorization_ref) errors.push("AUTHORIZATION_MISMATCH");
    }
  }
  return {
    status: errors.length ? "BLOCKED" : "READY",
    errors,
    fingerprint,
    live: liveRequested,
    enforceability: {
      provider_call_reservation: true,
      input_tokens_observable: adapter.id !== "definition-service",
      output_tokens_observable: false,
      currency_cost_observable: false,
    },
  };
}

export function approvalDocument({ config, sourcePath, adapter }) {
  if (!config.live?.authorization_ref) throw new Error("缺少 live.authorization_ref");
  return {
    schema_version: 1,
    authorization_ref: config.live.authorization_ref,
    fingerprint: approvalFingerprint({ config, sourcePath, adapterId: adapter.id }),
    adapter_id: adapter.id,
    source_manifest: config.source_manifest,
    source_sha256: sha256(readFileSync(sourcePath)),
    frozen_at: new Date().toISOString(),
  };
}
