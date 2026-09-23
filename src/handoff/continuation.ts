import { createHash } from "node:crypto";
import { workEvidence } from "../core/work-evidence.js";
import { hasExactExcerpt, coversExactly } from "../contracts/evidence.js";
import { CONTINUATION_MAX_CHARS } from "../contracts/continuation.js";
import { currentSourceState } from "../core/source-revisions.js";
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
  artifacts: Array<Pick<WorkSnapshot['artifactRefs'][number], 'id' | 'filename' | 'sha256' | 'availability' | 'role'>>;
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

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (isRecord(value)) return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + stableJson(value[key])).join(",") + "}";
  return JSON.stringify(value) ?? "null";
}

const hash = (value: unknown) => createHash("sha256").update(stableJson(value)).digest("hex");

export function continuationEvents(work: WorkSnapshot): SourceEvent[] {
  return workEvidence(work.sourceArchive);
}

function evidenceState(work: WorkSnapshot, events: SourceEvent[]): WorkState {
  const ids = new Map(events.flatMap(event => [[event.id, event.id], [event.externalId, event.id]]));
  return Object.fromEntries(Object.entries(currentSourceState(work.state, work.sourceArchive)).map(([field, items]) =>
    [field, items.map(item => ({ ...item, sourceMessageIds: item.sourceMessageIds.map(id => ids.get(id) ?? id) }))])) as WorkState;
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
    hasExactExcerpt(eventMap.get(excerpt.sourceEventId)?.content, excerpt.text));
  const manualBacked = manual && manualIds.some(id =>
    stateMap.get(id)!.text === text || text.includes(stateMap.get(id)!.text));
  return refsExist && excerptsValid && manual && ((sourceEventIds.length > 0 &&
    excerpts.some(excerpt => sourceEventIds.includes(excerpt.sourceEventId as string))) || manualBacked);
}

function validEvidence(value: unknown, eventMap: Map<string, SourceEvent>): value is ContinuationEvidence {
  if (!isRecord(value) || !["id", "object", "version", "scope", "result", "sourceEventId", "excerpt"]
    .every(key => typeof value[key] === "string" && !!value[key])) return false;
  const event = eventMap.get(value.sourceEventId as string);
  if (!hasExactExcerpt(event?.content, value.excerpt)) return false;
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
  if (!coversExactly(coveredSourceEventIds, eventIds)) return null;
  const eventMap = new Map(events.map(event => [event.id, event]));
  const state = evidenceState(input.work, events);
  const stateMap = new Map(Object.values(state).flat().filter(item => item.origin === "USER_EDITED" ||
    item.sourceMessageIds.some(id => eventMap.get(id)?.kind.startsWith("work.")))
    .map(item => [item.id, item]));
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
            if (event?.kind === "user.prompt") return evidence.object === outcome.id &&
              !!event.content?.includes(String(outcome.id));
            if (event?.kind !== "work.acceptance" || event.environmentType !== "WORKPET_LOCAL") return false;
            try {
              const acceptance = JSON.parse(event.content ?? "{}");
              return acceptance.completed === true && Array.isArray(acceptance.artifacts) &&
                acceptance.artifacts.some((artifact: { id: string; sha256: string }) =>
                  artifact.id === outcome.artifactRefId && outcome.version === "sha256:" + artifact.sha256);
            } catch { return false; }
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
      ((replacement.replacementEvidence as unknown[]).length > 0 ||
        (req.replacementEvidence as unknown[]).length > 0))) return null;
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
  prepareContinuation(workId: string, generator?: ContinuationGenerator): Promise<ContinuationSnapshot> {
    const key = workId + (generator ? ":authorized" : ":cached");
    const existing = this.#pending.get(key);
    if (existing) return existing;
    const pending = this.#prepare(workId, generator).finally(() => this.#pending.delete(key));
    this.#pending.set(key, pending);
    return pending;
  }
  async #prepare(workId: string, authorizedGenerator?: ContinuationGenerator): Promise<ContinuationSnapshot> {
    const input = await this.#load(workId);
    const events = continuationEvents(input.work);
    const basis = buildContinuationBasis(input.work, input.materials);
    if (input.cached && input.cached.resolution !== "UNRESOLVED" &&
        continuationBasisMatches(input.work, input.materials, input.cached.basis)) return input.cached;
    const generator = authorizedGenerator ?? this.#generator(workId);
    if (!generator) return unresolved(input.work, input.materials,
      "工作状态尚未准备完成；交接时会自动准备，当前可先核对最新用户原话。",
      events.slice(-10).map(event => event.id));
    const modelInput: ContinuationGeneratorInput = {
      basis,
      events: events.map(({ id, sequence, kind, timestamp, executorType, content, metadata }) =>
        ({ id, sequence, kind, timestamp, executorType, content: content ?? "", metadata: {} })),
      state: evidenceState(input.work, events),
      materials: input.materials,
      artifacts: input.work.artifactRefs.map(({ id, filename, sha256, availability, role }) =>
        ({ id, filename, sha256, availability, role })),
    };
    if (JSON.stringify(modelInput).length > CONTINUATION_MAX_CHARS)
      return unresolved(input.work, input.materials,
        "记录超出自动处理范围；当前阶段未确认，请先核对原始记录。",
        events.map(event => event.id), "PARTIAL");
    let snapshot: ContinuationSnapshot | null = null;
    let reason = "工作状态未通过来源、范围或依赖校验；请通过证据入口核对当前阶段。";
    try { snapshot = validateCandidate(await generator.generate(modelInput), input, basis, events); }
    catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      reason = code === "SERVICE_UPGRADE_REQUIRED" ? "服务暂不支持自动准备工作状态，需要升级后台；原始记录保持可用。"
        : code === "QUOTA_EXCEEDED" ? "工作状态更新额度不足；原始记录保持可用。"
        : "工作状态暂未更新，可能是服务不可用或来源已变化；交接时会重试，原始记录保持可用。";
    }
    const latest = await this.#load(workId);
    if (!continuationBasisMatches(latest.work, latest.materials, basis))
      return unresolved(latest.work, latest.materials,
        "处理期间来源、状态或材料版本发生变化；旧候选已作废，请重新读取。",
        continuationEvents(latest.work).slice(-10).map(event => event.id));
    return snapshot ?? unresolved(latest.work, latest.materials,
      reason,
      events.slice(-10).map(event => event.id));
  }
}
