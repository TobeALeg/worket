import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const ADJUDICATION_SCHEMA_VERSION = 1;
export const GOLD_VERDICTS = Object.freeze(["MATCH", "PARTIAL", "MISS", "WRONG"]);
export const OUTPUT_VERDICTS = Object.freeze(["USEFUL", "PARTIAL", "REDUNDANT", "IRRELEVANT", "UNSUPPORTED", "WRONG"]);
export const REVIEW_STATUSES = Object.freeze(["PENDING", "CONFIRMED", "CORRECTED"]);
const WORK_STATE_FIELDS = Object.freeze(["objective", "successCriteria", "constraints", "facts", "decisions", "completedActions", "pendingActions", "artifacts"]);

const text = (value) => typeof value === "string" ? value : "";
const strings = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];

function flattenOutput(trial) {
  const state = trial?.product_output?.persisted_state ?? {};
  const units = WORK_STATE_FIELDS.flatMap((field) => (Array.isArray(state[field]) ? state[field] : []).map((item) => ({
    output_id: `${field}:${text(item?.id)}`,
    field,
    text: text(item?.text),
    origin: text(item?.origin),
    source_message_ids: strings(item?.sourceMessageIds),
  })));
  for (const field of ["currentTask", "nextStep"]) {
    const value = trial?.product_output?.handoff?.[field];
    if (typeof value === "string" && value.trim()) units.push({
      output_id: `handoff:${field}`,
      field: `handoff.${field}`,
      text: value,
      origin: "PROJECTED",
      source_message_ids: [],
    });
  }
  return units;
}

export function readTrials(runDirectory) {
  const directory = join(runDirectory, "trials");
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json") && !name.endsWith("ack-error.json"))
    .map((name) => JSON.parse(readFileSync(join(directory, name), "utf8")))
    .filter((trial) => trial.status === "SUCCEEDED" && trial.track === "S" && trial.repeat === 1);
}

export function parseReviewDraft(value) {
  if (!value || typeof value !== "object") return { reviewer_id: "", cases: [] };
  return {
    reviewer_id: text(value.reviewer_id).trim(),
    cases: Array.isArray(value.cases) ? value.cases : [],
  };
}

function decisionMap(draft) {
  const map = new Map();
  for (const reviewCase of draft.cases) for (const decision of reviewCase?.decisions ?? []) {
    if (typeof decision?.assessment_id === "string") map.set(decision.assessment_id, decision);
  }
  return map;
}

function normalizeDecision(raw, assessment) {
  const status = REVIEW_STATUSES.includes(raw?.review_status) ? raw.review_status : "PENDING";
  return {
    assessment_id: assessment.assessment_id,
    review_status: status,
    final_verdict: text(raw?.final_verdict || assessment.model_verdict),
    final_matches: strings(raw?.final_matches ?? assessment.model_matches),
    review_note: text(raw?.review_note).trim(),
  };
}

export function buildAdjudicationState({ gold, trials, proposal, draft: draftValue = null }) {
  if (gold?.status !== "HUMAN_APPROVED" || !Array.isArray(gold?.cases)) throw new Error("HUMAN_APPROVED_GOLD_REQUIRED");
  if (proposal?.status !== "MODEL_PROPOSED" || !Array.isArray(proposal?.cases)) throw new Error("MODEL_PROPOSAL_REQUIRED");
  const draft = parseReviewDraft(draftValue);
  const decisions = decisionMap(draft);
  const trialByCase = new Map(trials.map((trial) => [trial.case_id, trial]));
  const proposalByCase = new Map(proposal.cases.map((item) => [item.case_id, item]));
  const cases = gold.cases.map((goldCase) => {
    const trial = trialByCase.get(goldCase.case_id);
    const proposed = proposalByCase.get(goldCase.case_id);
    if (!trial) throw new Error(`TRIAL_NOT_FOUND:${goldCase.case_id}`);
    if (!proposed?.result) throw new Error(`PROPOSAL_NOT_FOUND:${goldCase.case_id}`);
    const goldById = new Map(goldCase.units.map((unit) => [unit.gold_id, unit]));
    const outputById = new Map(flattenOutput(trial).map((unit) => [unit.output_id, unit]));
    const assessments = [];
    for (const assessment of proposed.result.gold_assessments ?? []) {
      const target = goldById.get(assessment.gold_id);
      if (!target) throw new Error(`UNKNOWN_GOLD_ASSESSMENT:${goldCase.case_id}:${assessment.gold_id}`);
      const item = {
        assessment_id: `${goldCase.case_id}:gold:${assessment.gold_id}`,
        kind: "GOLD_COVERAGE",
        target_id: assessment.gold_id,
        target,
        related: strings(assessment.matched_output_ids).map((id) => outputById.get(id)).filter(Boolean),
        model_verdict: text(assessment.verdict),
        model_matches: strings(assessment.matched_output_ids),
        model_reason: text(assessment.reason),
      };
      assessments.push({ ...item, decision: normalizeDecision(decisions.get(item.assessment_id), item) });
    }
    for (const assessment of proposed.result.output_assessments ?? []) {
      if (assessment.verdict === "USEFUL") continue;
      const target = outputById.get(assessment.output_id);
      if (!target) throw new Error(`UNKNOWN_OUTPUT_ASSESSMENT:${goldCase.case_id}:${assessment.output_id}`);
      const item = {
        assessment_id: `${goldCase.case_id}:output:${assessment.output_id}`,
        kind: "OUTPUT_QUALITY",
        target_id: assessment.output_id,
        target,
        related: strings(assessment.matched_gold_ids).map((id) => goldById.get(id)).filter(Boolean),
        model_verdict: text(assessment.verdict),
        model_matches: strings(assessment.matched_gold_ids),
        model_reason: text(assessment.reason),
      };
      assessments.push({ ...item, decision: normalizeDecision(decisions.get(item.assessment_id), item) });
    }
    return {
      case_id: goldCase.case_id,
      display_name: goldCase.display_name,
      assessments,
      errors: Array.isArray(proposed.result.errors) ? proposed.result.errors : [],
      auto_useful_count: (proposed.result.output_assessments ?? []).filter((item) => item.verdict === "USEFUL").length,
      total_output_count: outputById.size,
    };
  });
  return {
    schema_version: ADJUDICATION_SCHEMA_VERSION,
    status: "DRAFT",
    run_id: proposal.run_id,
    model: proposal.cases[0]?.model ?? null,
    prompt_version: proposal.prompt_version,
    proposal_usage: proposal.usage,
    reviewer_id: draft.reviewer_id,
    cases,
  };
}

export function normalizeReviewDocument(document) {
  return {
    schema_version: ADJUDICATION_SCHEMA_VERSION,
    status: document?.status === "HUMAN_RISK_REVIEWED" ? "HUMAN_RISK_REVIEWED" : "DRAFT",
    run_id: text(document?.run_id),
    reviewer_id: text(document?.reviewer_id).trim(),
    updated_at: document?.updated_at ?? null,
    cases: Array.isArray(document?.cases) ? document.cases.map((reviewCase) => ({
      case_id: text(reviewCase?.case_id),
      decisions: Array.isArray(reviewCase?.decisions) ? reviewCase.decisions.map((decision) => ({
        assessment_id: text(decision?.assessment_id),
        review_status: REVIEW_STATUSES.includes(decision?.review_status) ? decision.review_status : "PENDING",
        final_verdict: text(decision?.final_verdict),
        final_matches: strings(decision?.final_matches),
        review_note: text(decision?.review_note).trim(),
      })) : [],
    })) : [],
    human_approval: document?.human_approval ?? null,
  };
}

export function validateReviewDocument(document, state, { final = false } = {}) {
  const errors = [];
  if (document?.schema_version !== ADJUDICATION_SCHEMA_VERSION) errors.push("INVALID_SCHEMA_VERSION");
  if (document?.run_id !== state.run_id) errors.push("RUN_ID_MISMATCH");
  const expected = new Map(state.cases.flatMap((reviewCase) => reviewCase.assessments.map((assessment) => [assessment.assessment_id, assessment])));
  const received = new Map();
  for (const reviewCase of document?.cases ?? []) for (const decision of reviewCase.decisions ?? []) {
    if (!expected.has(decision.assessment_id)) errors.push(`UNKNOWN_ASSESSMENT:${decision.assessment_id}`);
    if (received.has(decision.assessment_id)) errors.push(`DUPLICATE_ASSESSMENT:${decision.assessment_id}`);
    received.set(decision.assessment_id, decision);
    const assessment = expected.get(decision.assessment_id);
    const allowed = assessment?.kind === "GOLD_COVERAGE" ? GOLD_VERDICTS : OUTPUT_VERDICTS;
    if (assessment && !allowed.includes(decision.final_verdict)) errors.push(`INVALID_VERDICT:${decision.assessment_id}`);
    if (!REVIEW_STATUSES.includes(decision.review_status)) errors.push(`INVALID_REVIEW_STATUS:${decision.assessment_id}`);
  }
  for (const id of expected.keys()) {
    if (!received.has(id)) errors.push(`ASSESSMENT_MISSING:${id}`);
    else if (final && received.get(id).review_status === "PENDING") errors.push(`ASSESSMENT_PENDING:${id}`);
  }
  if (final && document?.status !== "HUMAN_RISK_REVIEWED") errors.push("FINAL_STATUS_REQUIRED");
  if (final && !document?.reviewer_id) errors.push("REVIEWER_ID_REQUIRED");
  if (final && text(document?.human_approval?.reviewer_id).trim() !== document?.reviewer_id) errors.push("REVIEWER_ID_MISMATCH");
  if (final && !text(document?.human_approval?.approved_at).trim()) errors.push("APPROVED_AT_REQUIRED");
  return { valid: errors.length === 0, errors };
}

export function buildFinalAdjudication({ state, proposal, review }) {
  const decisionById = new Map(review.cases.flatMap((reviewCase) => reviewCase.decisions.map((decision) => [decision.assessment_id, decision])));
  const cases = proposal.cases.map((proposed) => {
    const mapAssessment = (kind, assessment, targetId) => {
      const id = `${proposed.case_id}:${kind}:${targetId}`;
      const decision = decisionById.get(id);
      return {
        ...assessment,
        reviewer_status: decision?.review_status ?? "MODEL_ONLY",
        final_verdict: decision?.final_verdict ?? assessment.verdict,
        final_matches: decision?.final_matches ?? (kind === "gold" ? assessment.matched_output_ids : assessment.matched_gold_ids),
        review_note: decision?.review_note ?? "",
      };
    };
    return {
      case_id: proposed.case_id,
      gold_assessments: proposed.result.gold_assessments.map((item) => mapAssessment("gold", item, item.gold_id)),
      output_assessments: proposed.result.output_assessments.map((item) => mapAssessment("output", item, item.output_id)),
      errors: proposed.result.errors,
    };
  });
  return {
    schema_version: ADJUDICATION_SCHEMA_VERSION,
    status: "HUMAN_RISK_REVIEWED",
    run_id: state.run_id,
    reviewer_id: review.reviewer_id,
    updated_at: review.updated_at,
    prompt_version: state.prompt_version,
    cases,
    human_approval: review.human_approval,
    limitation: "人工逐项确认 Gold 覆盖与模型标记的非 USEFUL 输出；模型标记为 USEFUL 的输出未逐项人工复核。",
  };
}
