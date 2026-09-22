import { existsSync, realpathSync, readFileSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";

export const REVIEW_SCHEMA_VERSION = 1;

export const REVIEW_ACTIONS = Object.freeze([
  "UNREVIEWED",
  "KEEP",
  "MODIFY",
  "DELETE",
  "REPLACED",
  "ADDED",
]);

export const REVIEW_STATUSES = Object.freeze([
  "PENDING",
  "CONFIRMED",
  "MODIFIED",
  "DELETED",
  "REPLACED",
  "ADDED",
]);

export const CASE_REVIEW_STATUSES = Object.freeze([
  "PENDING",
  "REVIEWED",
  "NO_REQUIREMENTS",
]);

export const SCOPE_VALUES = Object.freeze([
  "INSTANCE",
  "WORK_FAMILY",
  "GLOBAL",
  "HISTORICAL",
  "NO_STRUCTURED_VIEW",
]);

export const CRITICALITY_VALUES = Object.freeze(["CRITICAL", "NORMAL"]);

export const SOURCE_ORIGIN_VALUES = Object.freeze([
  "USER_STATED",
  "USER_ACCEPTED_ASSISTANT",
  "ASSISTANT_PROPOSAL",
  "INFERRED",
  "TOOL_METADATA",
  "UNKNOWN",
]);

export const DESTINATION_VALUES = Object.freeze([
  "S_ACTIVE",
  "D_REUSABLE_CANDIDATE",
  "D_CLARIFICATION",
  "HISTORY",
  "NO_STRUCTURED_VIEW",
]);

const DEFAULT_UNIT = Object.freeze({
  semantic_content: "",
  evidence_refs: [],
  source_origin: "UNKNOWN",
  adoption_status: "EXPLICIT_REQUIREMENT",
  validity: "ACTIVE_AT_CUTOFF",
  scope: "INSTANCE",
  destinations: ["S_ACTIVE"],
  criticality: "NORMAL",
  required: true,
  utility_reason: "",
  acceptable_variants: [],
  forbidden_inferences: [],
});

function string(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim());
}

function evidenceRefs(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) return [{ event_id: item.trim(), excerpt: "" }];
    if (!item || typeof item !== "object") return [];
    const eventId = string(item.event_id || item.source_id || item.id).trim();
    if (!eventId) return [];
    return [{ event_id: eventId, excerpt: string(item.excerpt).trim() }];
  });
}

function normalizeUnit(unit, index, caseId) {
  const source = unit && typeof unit === "object" ? unit : {};
  const { review_decision: _legacyReviewDecision, ...sourceFields } = source;
  const action = REVIEW_ACTIONS.includes(source.review_action) ? source.review_action : "UNREVIEWED";
  const status = REVIEW_STATUSES.includes(source.review_status)
    ? source.review_status
    : action === "KEEP" ? "CONFIRMED"
      : action === "MODIFY" ? "MODIFIED"
        : action === "DELETE" ? "DELETED"
          : action === "REPLACED" ? "REPLACED"
            : action === "ADDED" ? "ADDED" : "PENDING";
  const destinations = stringList(source.destinations ?? source.destination);
  return {
    ...DEFAULT_UNIT,
    ...sourceFields,
    gold_id: string(source.gold_id || source.unit_id || `${caseId}-unit-${String(index + 1).padStart(3, "0")}`),
    semantic_content: string(source.semantic_content).trim(),
    evidence_refs: evidenceRefs(source.evidence_refs),
    source_origin: string(source.source_origin, DEFAULT_UNIT.source_origin),
    adoption_status: string(source.adoption_status, DEFAULT_UNIT.adoption_status),
    validity: string(source.validity, DEFAULT_UNIT.validity),
    scope: SCOPE_VALUES.includes(source.scope) ? source.scope : DEFAULT_UNIT.scope,
    destinations: destinations.length ? destinations : [...DEFAULT_UNIT.destinations],
    criticality: CRITICALITY_VALUES.includes(source.criticality) ? source.criticality : DEFAULT_UNIT.criticality,
    required: action === "DELETE" || action === "REPLACED" ? false : source.required !== false,
    utility_reason: string(source.utility_reason).trim(),
    acceptable_variants: stringList(source.acceptable_variants),
    forbidden_inferences: stringList(source.forbidden_inferences),
    review_action: action,
    review_status: status,
  };
}

function normalizeCase(reviewCase, sourceCase) {
  const draft = reviewCase && typeof reviewCase === "object" ? reviewCase : {};
  const source = sourceCase && typeof sourceCase === "object" ? sourceCase : {};
  const caseId = string(draft.case_id || source.case_id).trim();
  const units = Array.isArray(draft.units) ? draft.units : [];
  const caseStatus = CASE_REVIEW_STATUSES.includes(draft.review_status) ? draft.review_status : "PENDING";
  return {
    case_id: caseId,
    display_name: string(draft.display_name || source.display_name || caseId).trim(),
    work_id: string(draft.work_id || source.work_id).trim(),
    cutoff_event_id: string(draft.cutoff_event_id || source.cutoff_event_id || source.cutoff_id).trim(),
    cutoff_id: string(draft.cutoff_id || source.cutoff_id || source.cutoff_event_id).trim(),
    task_family: string(draft.task_family || source.task_family).trim(),
    source_type: string(draft.source_type || source.source_type).trim(),
    source_snapshot_sha256: string(draft.source_snapshot_sha256 || source.source_snapshot_sha256).trim(),
    source_origin: string(draft.source_origin || source.source_type || "AUTHORIZED_REAL").trim(),
    review_status: caseStatus,
    units: units.map((unit, index) => normalizeUnit(unit, index, caseId)),
  };
}

function sourceMessages(sourceCase) {
  if (!Array.isArray(sourceCase?.events) && Array.isArray(sourceCase?.messages)) {
    return sourceCase.messages
      .filter((message) => message && (message.kind === "user.prompt" || message.kind === "agent.response"))
      .map((message, index) => ({
        event_id: string(message.event_id || message.id || `event-${index + 1}`),
        sequence: Number.isFinite(message.sequence) ? message.sequence : index + 1,
        kind: string(message.kind),
        content: string(message.content),
        occurred_at: message.occurred_at ?? null,
      }));
  }
  const events = Array.isArray(sourceCase?.events) ? sourceCase.events : [];
  return events
    .filter((event) => event && (event.kind === "user.prompt" || event.kind === "agent.response"))
    .map((event, index) => ({
      event_id: string(event.id || `event-${index + 1}`),
      sequence: Number.isFinite(event.sequence) ? event.sequence : index + 1,
      kind: string(event.kind),
      content: string(event.content),
      occurred_at: event.occurred_at ?? null,
    }));
}

function sourceCaseView(sourceCase) {
  const sourceFiles = Array.isArray(sourceCase?.source_files) ? sourceCase.source_files : [];
  return {
    case_id: string(sourceCase?.case_id).trim(),
    display_name: string(sourceCase?.display_name || sourceCase?.case_id).trim(),
    work_id: string(sourceCase?.work_id).trim(),
    cutoff_event_id: string(sourceCase?.cutoff_event_id || sourceCase?.cutoff_id).trim(),
    cutoff_id: string(sourceCase?.cutoff_id || sourceCase?.cutoff_event_id).trim(),
    task_family: string(sourceCase?.task_family).trim(),
    source_type: string(sourceCase?.source_type).trim(),
    source_snapshot_sha256: string(sourceCase?.source_snapshot_sha256).trim(),
    source_origin: string(sourceCase?.source_type || "AUTHORIZED_REAL").trim(),
    attachment_policy: string(sourceCase?.attachment_policy).trim(),
    source_files: sourceFiles.map((file) => ({
      relative_path: string(file?.relative_path).trim(),
      sha256: string(file?.sha256).trim(),
      size_bytes: Number.isFinite(file?.size_bytes) ? file.size_bytes : null,
    })),
    messages: sourceMessages(sourceCase),
  };
}

export function normalizeSourceCases(sourceCases) {
  if (!Array.isArray(sourceCases)) throw new Error("SOURCE_CASES_MUST_BE_ARRAY");
  return sourceCases
    .map(sourceCaseView)
    .filter((sourceCase) => sourceCase.case_id);
}

export function parseSourceCaseJsonl(text) {
  const lines = String(text).split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const values = lines.flatMap((line, lineIndex) => {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new Error(`INVALID_SOURCE_JSONL_LINE:${lineIndex + 1}:${error.message}`);
    }
    return Array.isArray(parsed) ? parsed : [parsed];
  });
  return normalizeSourceCases(values);
}

export function readSourceCaseJsonl(path) {
  return parseSourceCaseJsonl(readFileSync(path, "utf8"));
}

export function parseReviewDraft(value) {
  if (!value || typeof value !== "object") return { schema_version: REVIEW_SCHEMA_VERSION, status: "DRAFT", cases: [], human_approval: null };
  const cases = Array.isArray(value.cases)
    ? value.cases
    : value.case_id
      ? [value]
      : [];
  return {
    schema_version: REVIEW_SCHEMA_VERSION,
    status: string(value.status, "DRAFT"),
    reviewer_id: string(value.reviewer_id).trim(),
    source_manifest: string(value.source_manifest).trim(),
    updated_at: value.updated_at ?? null,
    cases,
    human_approval: value.human_approval ?? null,
  };
}

export function buildReviewState(sourceCases, draftValue) {
  const sources = normalizeSourceCases(sourceCases);
  const draft = parseReviewDraft(draftValue);
  const drafts = new Map(draft.cases.map((item) => [string(item?.case_id).trim(), item]));
  const cases = sources.map((sourceCase) => normalizeCase(drafts.get(sourceCase.case_id), sourceCase));
  for (const [caseId, draftCase] of drafts) {
    if (!cases.some((item) => item.case_id === caseId)) cases.push(normalizeCase(draftCase, { case_id: caseId }));
  }
  return {
    schema_version: REVIEW_SCHEMA_VERSION,
    status: draft.status === "HUMAN_APPROVED" ? "HUMAN_APPROVED" : "DRAFT",
    reviewer_id: draft.reviewer_id,
    source_manifest: draft.source_manifest,
    updated_at: draft.updated_at,
    cases: cases.map((item) => ({ ...item, source: sources.find((source) => source.case_id === item.case_id) ?? null })),
    human_approval: draft.human_approval,
  };
}

function outputCase(reviewCase) {
  const { source: _source, ...rest } = reviewCase;
  return rest;
}

export function serializeReviewDocument(state, { status = "DRAFT", reviewerId = "", humanApproval = null } = {}) {
  return {
    schema_version: REVIEW_SCHEMA_VERSION,
    status,
    reviewer_id: reviewerId || state.reviewer_id || "",
    updated_at: new Date().toISOString(),
    cases: state.cases.map(outputCase),
    human_approval: humanApproval,
  };
}

export function normalizeReviewDocument(document) {
  if (!document || typeof document !== "object") return document;
  return {
    ...document,
    cases: Array.isArray(document.cases) ? document.cases.map((reviewCase) => ({
      ...reviewCase,
      display_name: string(reviewCase?.display_name || reviewCase?.case_id).trim(),
      units: Array.isArray(reviewCase?.units) ? reviewCase.units.map((unit) => ({
        ...unit,
        required: unit?.review_action === "DELETE" || unit?.review_action === "REPLACED"
          ? false
          : unit?.required !== false,
      })) : reviewCase?.units,
    })) : document.cases,
  };
}

export function validateReviewDocument(document, { final = false, sourceCases = null } = {}) {
  const errors = [];
  if (!document || typeof document !== "object") errors.push("DOCUMENT_MUST_BE_OBJECT");
  if (document?.schema_version !== REVIEW_SCHEMA_VERSION) errors.push("INVALID_SCHEMA_VERSION");
  if (!Array.isArray(document?.cases) || document.cases.length === 0) errors.push("CASES_REQUIRED");
  const ids = new Set();
  const sourceByCase = sourceCases
    ? new Map(normalizeSourceCases(sourceCases).map((sourceCase) => [sourceCase.case_id, sourceCase]))
    : null;
  for (const reviewCase of document?.cases ?? []) {
    const caseId = string(reviewCase?.case_id).trim();
    if (!caseId) errors.push("CASE_ID_REQUIRED");
    if (ids.has(caseId)) errors.push(`DUPLICATE_CASE:${caseId}`);
    ids.add(caseId);
    const sourceCase = sourceByCase?.get(caseId);
    if (final && sourceByCase && !sourceCase) errors.push(`SOURCE_CASE_NOT_FOUND:${caseId}`);
    if (!CASE_REVIEW_STATUSES.includes(reviewCase?.review_status)) errors.push(`INVALID_CASE_STATUS:${caseId}`);
    if (!Array.isArray(reviewCase?.units)) errors.push(`UNITS_REQUIRED:${caseId}`);
    const unitIds = new Set();
    for (const unit of reviewCase?.units ?? []) {
      const unitId = string(unit?.gold_id).trim();
      if (!unitId) errors.push(`UNIT_ID_REQUIRED:${caseId}`);
      if (unitIds.has(unitId)) errors.push(`DUPLICATE_UNIT:${caseId}:${unitId}`);
      unitIds.add(unitId);
      if (!REVIEW_ACTIONS.includes(unit?.review_action)) errors.push(`INVALID_REVIEW_ACTION:${caseId}:${unit?.gold_id}`);
      if (!REVIEW_STATUSES.includes(unit?.review_status)) errors.push(`INVALID_REVIEW_STATUS:${caseId}:${unit?.gold_id}`);
      if (!string(unit?.semantic_content).trim() && unit?.review_action !== "DELETE") errors.push(`SEMANTIC_CONTENT_REQUIRED:${caseId}:${unit?.gold_id}`);
      if (!Array.isArray(unit?.evidence_refs)) errors.push(`EVIDENCE_REFS_REQUIRED:${caseId}:${unit?.gold_id}`);
      if (!SOURCE_ORIGIN_VALUES.includes(unit?.source_origin)) errors.push(`INVALID_SOURCE_ORIGIN:${caseId}:${unit?.gold_id}`);
      if (!Array.isArray(unit?.destinations) || unit.destinations.length === 0) errors.push(`DESTINATIONS_REQUIRED:${caseId}:${unit?.gold_id}`);
      else for (const destination of unit.destinations) {
        if (!DESTINATION_VALUES.includes(destination)) errors.push(`INVALID_DESTINATION:${caseId}:${unit?.gold_id}:${destination}`);
      }
      if (!CRITICALITY_VALUES.includes(unit?.criticality)) errors.push(`INVALID_CRITICALITY:${caseId}:${unit?.gold_id}`);
      if (!SCOPE_VALUES.includes(unit?.scope)) errors.push(`INVALID_SCOPE:${caseId}:${unit?.gold_id}`);
      if (final && unit?.review_action === "UNREVIEWED") errors.push(`UNREVIEWED_UNIT:${caseId}:${unit?.gold_id}`);
      if (final && unit?.review_action !== "DELETE" && unit?.evidence_refs?.length === 0) errors.push(`EVIDENCE_REQUIRED:${caseId}:${unit?.gold_id}`);
      if (final && (unit?.review_action === "DELETE" || unit?.review_action === "REPLACED") && unit?.required !== false) {
        errors.push(`INACTIVE_UNIT_CANNOT_BE_REQUIRED:${caseId}:${unit?.gold_id}`);
      }
      if (final && sourceCase && Array.isArray(unit?.evidence_refs)) {
        for (const reference of unit.evidence_refs) {
          const eventId = string(reference?.event_id).trim();
          const excerpt = string(reference?.excerpt).trim();
          const event = sourceCase.messages.find((message) => message.event_id === eventId);
          if (!event) errors.push(`EVIDENCE_EVENT_NOT_IN_CASE:${caseId}:${unit?.gold_id}:${eventId}`);
          else if (!excerpt) errors.push(`EVIDENCE_EXCERPT_REQUIRED:${caseId}:${unit?.gold_id}:${eventId}`);
          else if (!event.content.includes(excerpt)) errors.push(`EVIDENCE_EXCERPT_NOT_FOUND:${caseId}:${unit?.gold_id}:${eventId}`);
        }
      }
    }
    if (final && reviewCase?.review_status === "PENDING") errors.push(`UNREVIEWED_CASE:${caseId}`);
  }
  if (final && document?.status !== "HUMAN_APPROVED") errors.push("FINAL_STATUS_REQUIRED");
  if (final && !string(document?.reviewer_id).trim()) errors.push("REVIEWER_ID_REQUIRED");
  if (final && !string(document?.human_approval?.reviewer_id).trim()) errors.push("HUMAN_APPROVAL_REVIEWER_REQUIRED");
  if (final && string(document?.human_approval?.reviewer_id).trim() !== string(document?.reviewer_id).trim()) errors.push("REVIEWER_ID_MISMATCH");
  if (final && !string(document?.human_approval?.approved_at).trim()) errors.push("APPROVED_AT_REQUIRED");
  if (final && !string(document?.human_approval?.method).trim()) errors.push("APPROVAL_METHOD_REQUIRED");
  return { valid: errors.length === 0, errors };
}

export function assertPathInside(root, candidate, label, { mustExist = false } = {}) {
  const base = resolve(root);
  const physicalBase = existsSync(base) ? resolve(realpathSync(base)) : base;
  const path = resolve(candidate);
  const relativePath = relative(base, path);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || relativePath.startsWith(sep)) {
    throw new Error(`PATH_OUTSIDE_ROOT:${label}`);
  }
  if (mustExist && !existsSync(path)) throw new Error(`PATH_NOT_FOUND:${label}`);
  let existing = path;
  const tail = [];
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) break;
    tail.unshift(basename(existing));
    existing = parent;
  }
  if (existsSync(existing)) {
    const physical = resolve(realpathSync(existing), ...tail);
    const physicalRelative = relative(physicalBase, physical);
    if (physicalRelative === ".." || physicalRelative.startsWith(`..${sep}`) || physicalRelative.startsWith(sep)) {
      throw new Error(`PATH_OUTSIDE_ROOT:${label}`);
    }
  }
  return path;
}

export function relativePath(root, path) {
  return relative(resolve(root), resolve(path)) || basename(path);
}
