import { createHash } from "node:crypto";
import { currentSourceEvents, currentSourceState } from "../core/source-revisions.js";
import type { HandoffPackage, SourceEvent, WorkSnapshot, WorkState } from "../core/types.js";

export type ContinuationClaim = {
  text: string;
  sourceEventIds: string[];
  excerpts: Array<{ sourceEventId: string; text: string }>;
  manualStateIds?: string[];
};

export type ContinuationEvidence = {
  id: string;
  object: string;
  version: string;
  scope: string;
  result: string;
  sourceEventId: string;
  excerpt: string;
};

export type ContinuationBasis = {
  sourceDigest: string;
  stateDigest: string;
  materialDigest: string;
  throughSequence: number;
  coverage: "COMPLETE" | "PARTIAL";
  missingEvidenceIds: string[];
};

export type ContinuationSnapshot = {
  schemaVersion: 1;
  resolution: "RESOLVED" | "PARTIAL" | "UNRESOLVED";
  basis: ContinuationBasis;
  objective: ContinuationClaim[];
  currentStageId: string | null;
  currentStageBasis: ContinuationClaim[];
  stages: Array<{
    id: string;
    task: ContinuationClaim;
    execution: "UNKNOWN" | "NOT_STARTED" | "IN_PROGRESS" | "REPORTED_DONE" | "SUPPORTED_DONE";
    completionEvidence: ContinuationEvidence[];
    outcomes: Array<{
      id: string;
      summary: ContinuationClaim;
      artifactRefId: string | null;
      version: string;
      checks: ContinuationEvidence[];
      acceptance: "UNKNOWN" | "ACCEPTED" | "NEEDS_CHANGES";
      acceptanceEvidence: ContinuationEvidence[];
    }>;
    dependsOn: Array<{ stageId: string; outcomeId: string; version: string }>;
    remaining: ContinuationClaim[];
    blockers: ContinuationClaim[];
  }>;
  requirements: Array<{
    id: string;
    kind: "CONSTRAINT" | "DECISION" | "SUCCESS_CRITERION";
    claim: ContinuationClaim;
    scope: { kind: "WORK" | "STAGE" | "OUTCOME"; ids: string[] };
    status: "ACTIVE" | "SUPERSEDED" | "CONFLICT";
    supersedes: string[];
    replacementEvidence: ContinuationClaim[];
  }>;
  uncertainties: ContinuationClaim[];
};

export type ContinuationMaterials = Array<{ id: string; version: string; availability: string }>;
export type ContinuationGeneratorInput = {
  basis: ContinuationBasis;
  events: Array<Pick<SourceEvent, "id" | "sequence" | "kind" | "timestamp" | "executorType" | "content" | "metadata">>;
  state: WorkState;
  materials: ContinuationMaterials;
};
export interface ContinuationGenerator {
  generate(input: ContinuationGeneratorInput): Promise<unknown>;
}

export type ContinuationInput = {
  work: WorkSnapshot;
  materials: ContinuationMaterials;
  cached?: ContinuationSnapshot;
};
export type ContinuationLoader = (workId: string) => Promise<ContinuationInput>;
export type ContinuationGeneratorProvider = (workId: string) => ContinuationGenerator | null;

const MAX_MODEL_INPUT_CHARS = 80000;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (isRecord(value)) return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + stableJson(value[key])).join(",") + "}";
  return JSON.stringify(value) ?? "null";
}

const hash = (value: unknown) => createHash("sha256").update(stableJson(value)).digest("hex");

export function continuationEvents(work: WorkSnapshot): SourceEvent[] {
  return currentSourceEvents(work.sourceArchive).filter(event =>
    event.kind !== "reasoning.summary" &&
    !(event.metadata.toolName === "get_work_context" && event.metadata.outcome === "success"),
  );
}

export function buildContinuationBasis(work: WorkSnapshot, materials: ContinuationMaterials): ContinuationBasis {
  const events = continuationEvents(work);
  const state = currentSourceState(work.state, work.sourceArchive);
  return {
    sourceDigest: hash(events.map(({ id, sequence, kind, timestamp, executorType, content, metadata, artifactRefs }) => ({ id, sequence, kind, timestamp, executorType, content, metadata, artifactRefs }))),
    stateDigest: hash(state),
    materialDigest: hash({
      artifacts: work.artifactRefs.map(({ id, path, sha256, size, availability, lastModifiedAt }) => ({ id, path, sha256, size, availability, lastModifiedAt })),
      materials,
    }),
    throughSequence: Math.max(0, ...events.map(event => event.sequence)),
    coverage: "COMPLETE",
    missingEvidenceIds: [],
  };
}

export function continuationBasisMatches(work: WorkSnapshot, materials: ContinuationMaterials, basis: ContinuationBasis): boolean {
  const current = buildContinuationBasis(work, materials);
  return current.sourceDigest === basis.sourceDigest &&
    current.stateDigest === basis.stateDigest &&
    current.materialDigest === basis.materialDigest &&
    current.throughSequence === basis.throughSequence;
}

function unresolved(work: WorkSnapshot, materials: ContinuationMaterials, reason: string, missing?: string[], resolution: "PARTIAL" | "UNRESOLVED" = "UNRESOLVED"): ContinuationSnapshot {
  const basis = buildContinuationBasis(work, materials);
  const ids = missing ?? continuationEvents(work).map(event => event.id);
  basis.coverage = "PARTIAL";
  basis.missingEvidenceIds = ids;
  return {
    schemaVersion: 1,
    resolution,
    basis,
    objective: [],
    currentStageId: null,
    currentStageBasis: [],
    stages: [],
    requirements: [],
    uncertainties: [{ text: reason, sourceEventIds: ids.slice(-10), excerpts: [] }],
  };
}

function validClaim(value: unknown, eventMap: Map<string, SourceEvent>, stateMap: Map<string, { text: string }>): value is ContinuationClaim {
  if (!isRecord(value) || typeof value.text !== "string" || !value.text.trim() ||
      !Array.isArray(value.sourceEventIds) || !value.sourceEventIds.every(id => typeof id === "string") ||
      !Array.isArray(value.excerpts) || !value.excerpts.every(isRecord)) return false;
  const text = value.text;
  const sourceEventIds = value.sourceEventIds as string[];
  const excerpts = value.excerpts as Array<Record<string, unknown>>;
  const manualIds = asStringArray(value.manualStateIds) ? value.manualStateIds : [];
  const manual = manualIds.every(id => stateMap.has(id));
  const refsExist = sourceEventIds.every(id => eventMap.has(id));
  const excerptsValid = excerpts.every(excerpt =>
    typeof excerpt.sourceEventId === "string" && typeof excerpt.text === "string" && !!excerpt.text &&
    (eventMap.get(excerpt.sourceEventId)?.content?.includes(excerpt.text) ?? false));
  const manualBacked = manual && manualIds.some(id =>
    stateMap.get(id)!.text === text || text.includes(stateMap.get(id)!.text));
  return (refsExist && sourceEventIds.length > 0 && excerptsValid &&
    excerpts.some(excerpt => sourceEventIds.includes(excerpt.sourceEventId as string))) || manualBacked;
}

function validEvidence(value: unknown, eventMap: Map<string, SourceEvent>): value is ContinuationEvidence {
  if (!isRecord(value) || !["id", "object", "version", "scope", "result", "sourceEventId", "excerpt"]
    .every(key => typeof value[key] === "string" && !!value[key])) return false;
  const event = eventMap.get(value.sourceEventId as string);
  if (!event?.content?.includes(value.excerpt as string)) return false;
  const version = value.version as string;
  return version === "unknown" || /^(source|sha256|commit|event):/u.test(version) || /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/iu.test(version);
}

function asStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function hasDependencyCycle(stages: Record<string, unknown>[]): boolean {
  const byId = new Map(stages.map(stage => [stage.id as string, stage]));
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const stage = byId.get(id);
    for (const dependency of (stage?.dependsOn as Record<string, unknown>[] | undefined) ?? [])
      if (visit(dependency.stageId as string)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return [...byId.keys()].some(visit);
}

function validateCandidate(candidate: unknown, input: ContinuationInput, basis: ContinuationBasis, events: SourceEvent[]): ContinuationSnapshot | null {
  if (!isRecord(candidate) || !asStringArray(candidate.coveredSourceEventIds)) return null;
  const coveredSourceEventIds = candidate.coveredSourceEventIds as string[];
  const eventIds = events.map(event => event.id);
  if (coveredSourceEventIds.length !== eventIds.length || eventIds.some(id => !coveredSourceEventIds.includes(id))) return null;
  const eventMap = new Map(events.map(event => [event.id, event]));
  const state = currentSourceState(input.work.state, input.work.sourceArchive);
  const stateMap = new Map(Object.values(state).flat().map(item => [item.id, item]));
  const isClaimArray = (value: unknown) => Array.isArray(value) && value.every(item => validClaim(item, eventMap, stateMap));
  if (!isClaimArray(candidate.objective) || !candidate.objective.length ||
      !isClaimArray(candidate.currentStageBasis) || !isClaimArray(candidate.uncertainties) ||
      !Array.isArray(candidate.stages) || !candidate.stages.every(isRecord) ||
      !Array.isArray(candidate.requirements) || !candidate.requirements.every(isRecord)) return null;
  const stageIds = new Set<string>();
  for (const stage of candidate.stages) {
    if (typeof stage.id !== "string" || !stage.id || stageIds.has(stage.id) || !validClaim(stage.task, eventMap, stateMap)) return null;
    stageIds.add(stage.id);
    if (!["UNKNOWN", "NOT_STARTED", "IN_PROGRESS", "REPORTED_DONE", "SUPPORTED_DONE"].includes(String(stage.execution))) return null;
    const evidenceArray = (value: unknown) => Array.isArray(value) && value.every(item => validEvidence(item, eventMap));
    if (!evidenceArray(stage.completionEvidence) || !isClaimArray(stage.remaining) ||
        !isClaimArray(stage.blockers) || !Array.isArray(stage.outcomes) ||
        !stage.outcomes.every(isRecord) || !Array.isArray(stage.dependsOn) ||
        !stage.dependsOn.every(isRecord)) return null;
    if (stage.execution === "SUPPORTED_DONE" &&
        !stage.completionEvidence.some(item => {
          const evidence = item as ContinuationEvidence;
          const event = eventMap.get(evidence.sourceEventId);
          return ["tool.result", "browser.snapshot", "test.result"].includes(String(event?.kind)) &&
            !!event?.content?.includes(evidence.object);
        })) return null;
    for (const outcome of stage.outcomes) {
      if (typeof outcome.id !== "string" || !outcome.id || !validClaim(outcome.summary, eventMap, stateMap) ||
          typeof outcome.version !== "string" || !outcome.version || !evidenceArray(outcome.checks) ||
          !evidenceArray(outcome.acceptanceEvidence) ||
          !["UNKNOWN", "ACCEPTED", "NEEDS_CHANGES"].includes(String(outcome.acceptance))) return null;
      if (outcome.artifactRefId !== null) {
        const artifact = input.work.artifactRefs.find(item => item.id === outcome.artifactRefId && item.availability === "AVAILABLE");
        if (!artifact || outcome.version !== "sha256:" + artifact.sha256) return null;
      }
      if (outcome.acceptance === "ACCEPTED" &&
          !outcome.acceptanceEvidence.some(item => {
            const evidence = item as ContinuationEvidence;
            const event = eventMap.get(evidence.sourceEventId);
            return event?.kind === "user.prompt" && evidence.object === outcome.id &&
              !!event.content?.includes(String(outcome.id));
          })) return null;
    }
    for (const dependency of stage.dependsOn)
      if (typeof dependency.stageId !== "string" || typeof dependency.outcomeId !== "string" || typeof dependency.version !== "string") return null;
  }
  if (candidate.currentStageId !== null && (typeof candidate.currentStageId !== "string" || !stageIds.has(candidate.currentStageId))) return null;
  const outcomeIds = new Set(candidate.stages.flatMap(stage =>
    (stage.outcomes as Array<Record<string, unknown>>).map(outcome => String(outcome.id))));
  const requirements = candidate.requirements as Record<string, unknown>[];
  const requirementIds = new Set<string>();
  for (const req of requirements) {
    if (typeof req.id !== "string" || !req.id || requirementIds.has(req.id) ||
        !["CONSTRAINT", "DECISION", "SUCCESS_CRITERION"].includes(String(req.kind)) ||
        !validClaim(req.claim, eventMap, stateMap) || !isRecord(req.scope) ||
        !["WORK", "STAGE", "OUTCOME"].includes(String(req.scope.kind)) ||
        !asStringArray(req.scope.ids) || !["ACTIVE", "SUPERSEDED", "CONFLICT"].includes(String(req.status)) ||
        !asStringArray(req.supersedes) || !isClaimArray(req.replacementEvidence)) return null;
    requirementIds.add(req.id);
    if (req.scope.kind === "STAGE" && req.scope.ids.some(id => !stageIds.has(id))) return null;
    if (req.scope.kind === "OUTCOME" && req.scope.ids.some(id => !outcomeIds.has(id))) return null;
  }
  for (const req of requirements) for (const id of req.supersedes as string[]) if (!requirementIds.has(id)) return null;
  for (const req of requirements.filter(item => item.status === "SUPERSEDED"))
    if (!requirements.some(replacement =>
      (replacement.supersedes as string[]).includes(req.id as string) &&
      (replacement.replacementEvidence as unknown[]).length > 0)) return null;
  const outcomeVersions = new Map(candidate.stages.flatMap(stage =>
    (stage.outcomes as Record<string, unknown>[]).map(outcome =>
      [String(stage.id) + ":" + String(outcome.id), outcome.version as string] as const)));
  for (const stage of candidate.stages) for (const dependency of stage.dependsOn as Record<string, unknown>[]) {
    const version = outcomeVersions.get(String(dependency.stageId) + ":" + String(dependency.outcomeId));
    if (!stageIds.has(dependency.stageId as string) || !version || version !== dependency.version) return null;
  }
  if (hasDependencyCycle(candidate.stages as Record<string, unknown>[])) return null;
  return {
    schemaVersion: 1,
    resolution: candidate.currentStageId ? "RESOLVED" : "PARTIAL",
    basis: { ...basis, coverage: "COMPLETE", missingEvidenceIds: [] },
    objective: candidate.objective as ContinuationClaim[],
    currentStageId: candidate.currentStageId as string | null,
    currentStageBasis: candidate.currentStageBasis as ContinuationClaim[],
    stages: candidate.stages as ContinuationSnapshot["stages"],
    requirements: candidate.requirements as ContinuationSnapshot["requirements"],
    uncertainties: candidate.uncertainties as ContinuationClaim[],
  };
}

export class ContinuationService {
  readonly #load: ContinuationLoader;
  readonly #generator: ContinuationGeneratorProvider;
  readonly #pending = new Map<string, Promise<ContinuationSnapshot>>();
  constructor(options: { load: ContinuationLoader; generator: ContinuationGeneratorProvider }) {
    this.#load = options.load;
    this.#generator = options.generator;
  }
  prepareContinuation(workId: string): Promise<ContinuationSnapshot> {
    const existing = this.#pending.get(workId);
    if (existing) return existing;
    const pending = this.#prepare(workId).finally(() => this.#pending.delete(workId));
    this.#pending.set(workId, pending);
    return pending;
  }
  async #prepare(workId: string): Promise<ContinuationSnapshot> {
    const input = await this.#load(workId);
    const events = continuationEvents(input.work);
    const basis = buildContinuationBasis(input.work, input.materials);
    if (input.cached && input.cached.resolution !== "UNRESOLVED" &&
        continuationBasisMatches(input.work, input.materials, input.cached.basis)) return input.cached;
    const generator = this.#generator(workId);
    if (!generator) return unresolved(input.work, input.materials,
      "没有已许可且可用的整理模型；请先读取 v2 上下文与最新用户消息证据。",
      events.slice(-10).map(event => event.id));
    const modelInput: ContinuationGeneratorInput = {
      basis,
      events: events.map(({ id, sequence, kind, timestamp, executorType, content, metadata }) =>
        ({ id, sequence, kind, timestamp, executorType, content, metadata })),
      state: currentSourceState(input.work.state, input.work.sourceArchive),
      materials: input.materials,
    };
    if (JSON.stringify(modelInput).length > MAX_MODEL_INPUT_CHARS)
      return unresolved(input.work, input.materials,
        "来源范围超出一次整理上限；当前阶段未确认，需要分批读取或缩小范围。",
        events.map(event => event.id), "PARTIAL");
    let snapshot: ContinuationSnapshot | null = null;
    try { snapshot = validateCandidate(await generator.generate(modelInput), input, basis, events); }
    catch { /* A failed or malformed model response remains unresolved. */ }
    const latest = await this.#load(workId);
    if (!continuationBasisMatches(latest.work, latest.materials, basis))
      return unresolved(latest.work, latest.materials,
        "整理期间来源、状态或材料版本发生变化；旧候选已作废，请重新读取。",
        continuationEvents(latest.work).slice(-10).map(event => event.id));
    return snapshot ?? unresolved(latest.work, latest.materials,
      "阶段整理结果未通过来源、范围或依赖校验；请通过证据入口核对当前阶段。",
      events.slice(-10).map(event => event.id));
  }
}
