import { currentSourceEvents } from "../core/source-revisions.js";
import type { HandoffPackage, SourceEvent, WorkSnapshot } from "../core/types.js";
import type { WorkPackage } from "../definitions/work-package.js";

const EVIDENCE_INDEX_LIMIT = 8;

export type HandoffContextV2 = {
  contextVersion: 2;
  workId: string;
  delivery: { id: string; generatedAt: string; definition: HandoffPackage["workDefinition"] };
  goal: {
    objective: WorkSnapshot["state"]["objective"];
    successCriteria: WorkSnapshot["state"]["successCriteria"];
    constraints: WorkSnapshot["state"]["constraints"];
  };
  position: {
    status: WorkSnapshot["instance"]["status"];
    checkpoint: null;
    completedActions: WorkSnapshot["state"]["completedActions"];
    pendingActions: WorkSnapshot["state"]["pendingActions"];
    note: string;
  };
  reusableWork: {
    artifacts: HandoffPackage["neededArtifacts"];
    sourceArchiveSummary: HandoffPackage["sourceArchiveSummary"];
  };
  conditions: {
    facts: WorkSnapshot["state"]["facts"];
    deferredFactCount: number;
    note: string;
    decisions: WorkSnapshot["state"]["decisions"];
  };
  firstAction: {
    candidateActionId: string | null;
    note: string;
  };
  workPackage?: Omit<WorkPackage, "state" | "nextStep" | "packageVersion"> & { packageVersion: 2 };
  evidenceIndex: Array<Pick<SourceEvent, "id" | "sequence" | "kind" | "timestamp">>;
  evidenceIndexTruncated: boolean;
};

export function buildHandoffContextV2(work: WorkSnapshot, handoff: HandoffPackage): HandoffContextV2 {
  const visible = currentSourceEvents(work.sourceArchive).filter(event => event.kind !== "reasoning.summary");
  const packageWithoutDuplicateState = handoff.workPackage
    ? (() => {
        const value = { ...handoff.workPackage! };
        delete (value as Partial<WorkPackage>).state;
        delete (value as Partial<WorkPackage>).nextStep;
        return { ...value, packageVersion: 2 as const };
      })()
    : undefined;
  return {
    contextVersion: 2,
    workId: handoff.workInstanceId,
    delivery: { id: handoff.id, generatedAt: handoff.generatedAt, definition: handoff.workDefinition },
    goal: {
      objective: work.state.objective,
      successCriteria: work.state.successCriteria,
      constraints: work.state.constraints,
    },
    position: {
      status: work.instance.status,
      checkpoint: null,
      completedActions: work.state.completedActions,
      pendingActions: work.state.pendingActions,
      note: "当前断点未被结构化记录；已完成项和待办项是记录，不代表已独立核验。",
    },
    reusableWork: {
      artifacts: handoff.neededArtifacts,
      sourceArchiveSummary: handoff.sourceArchiveSummary,
    },
    conditions: {
      facts: work.state.facts.filter(item => item.origin === "USER_STATED" || item.origin === "USER_EDITED"),
      deferredFactCount: work.state.facts.filter(item => item.origin !== "USER_STATED" && item.origin !== "USER_EDITED").length,
      note: "主包保留用户陈述或编辑的事实；其他来源不明、提议或推断事实仍可按来源读取，不据此判断其无效。",
      decisions: work.state.decisions,
    },
    firstAction: {
      candidateActionId: work.state.pendingActions[0]?.id ?? null,
      note: work.state.pendingActions.length
        ? "这是记录中的候选动作，接手者应先对照证据确认仍适用。"
        : "没有记录首个动作；依据目标和证据选择，不推断缺失状态。",
    },
    ...(packageWithoutDuplicateState ? { workPackage: packageWithoutDuplicateState } : {}),
    evidenceIndex: visible.slice(0, EVIDENCE_INDEX_LIMIT).map(({ id, sequence, kind, timestamp }) => ({ id, sequence, kind, timestamp })),
    evidenceIndexTruncated: visible.length > EVIDENCE_INDEX_LIMIT,
  };
}

export function buildHandoffContextV3(work: WorkSnapshot, handoff: HandoffPackage, fallbackV2: HandoffContextV2) {
  const continuation = handoff.continuation;
  if (!continuation) throw new Error("CONTINUATION_SNAPSHOT_MISSING");
  const events = currentSourceEvents(work.sourceArchive).filter(event => event.kind !== "reasoning.summary");
  const currentStage = continuation.currentStageId
    ? continuation.stages.find(stage => stage.id === continuation.currentStageId) ?? null
    : null;
  const currentIds = new Set<string>();
  const addClaim = (claim: { sourceEventIds: string[] }) => claim.sourceEventIds.forEach(id => currentIds.add(id));
  const addEvidence = (evidence: Array<{ sourceEventId: string }>) => evidence.forEach(item => currentIds.add(item.sourceEventId));
  continuation.objective.forEach(addClaim);
  continuation.currentStageBasis.forEach(addClaim);
  continuation.uncertainties.forEach(addClaim);
  continuation.requirements.forEach(requirement => {
    addClaim(requirement.claim);
    requirement.replacementEvidence.forEach(addClaim);
  });
  continuation.stages.forEach(stage => {
    addClaim(stage.task);
    stage.remaining.forEach(addClaim);
    stage.blockers.forEach(addClaim);
    addEvidence(stage.completionEvidence);
    stage.outcomes.forEach(outcome => {
      addClaim(outcome.summary);
      addEvidence(outcome.checks);
      addEvidence(outcome.acceptanceEvidence);
    });
  });
  const evidenceIndex = events.filter(event => currentIds.has(event.id))
    .map(({ id, sequence, kind, timestamp }) => ({ id, sequence, kind, timestamp }));
  const latestUserMessages = events.filter(event => event.kind === "user.prompt").slice(-3)
    .map(event => ({ eventId: event.id, sequence: event.sequence, excerpt: (event.content ?? "").slice(0, 600) }));
  const workPackage = handoff.workPackage
    ? (() => {
        const value = { ...handoff.workPackage! };
        delete (value as Partial<WorkPackage>).state;
        delete (value as Partial<WorkPackage>).nextStep;
        return { ...value, packageVersion: 3 as const };
      })()
    : undefined;
  return {
    contextVersion: 3 as const,
    workId: handoff.workInstanceId,
    delivery: { id: handoff.id, generatedAt: handoff.generatedAt, definition: handoff.workDefinition },
    resolution: continuation.resolution,
    basis: continuation.basis,
    overallObjective: continuation.objective,
    currentStage,
    currentStageBasis: continuation.currentStageBasis,
    completedPriorStages: continuation.stages.filter(stage =>
      stage.id !== continuation.currentStageId && (stage.execution === "SUPPORTED_DONE" || stage.execution === "REPORTED_DONE")),
    remainingStages: continuation.stages.filter(stage =>
      stage.id !== continuation.currentStageId &&
      (stage.execution !== "SUPPORTED_DONE" && stage.execution !== "REPORTED_DONE" || stage.remaining.length > 0 || stage.blockers.length > 0)),
    activeRequirements: continuation.requirements.filter(requirement => requirement.status === "ACTIVE"),
    supersededRequirements: continuation.requirements.filter(requirement => requirement.status === "SUPERSEDED"),
    conflicts: continuation.requirements.filter(requirement => requirement.status === "CONFLICT"),
    uncertainties: continuation.uncertainties,
    firstAction: currentStage?.remaining[0] ?? null,
    evidenceIndex,
    latestUserMessages,
    ...(continuation.resolution === "RESOLVED" ? {} : { fallbackV2 }),
    ...(workPackage ? { workPackage } : {}),
    sourceArchiveSummary: handoff.sourceArchiveSummary,
  };
}

export function readHandoffEvidence(
  work: WorkSnapshot,
  options: { eventIds?: string[]; afterSequence?: number; limit?: number },
) {
  const events = currentSourceEvents(work.sourceArchive).filter(event => event.kind !== "reasoning.summary");
  if (options.eventIds?.length) {
    const ids = new Set(options.eventIds);
    return { workId: work.instance.id, events: events.filter(event => ids.has(event.id)) };
  }
  const afterSequence = options.afterSequence ?? 0;
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  const page = events.filter(event => event.sequence > afterSequence).slice(0, limit);
  return {
    workId: work.instance.id,
    events: page,
    nextAfterSequence: page.length === limit ? page.at(-1)!.sequence : null,
  };
}
