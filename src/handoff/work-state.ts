import type { WorkSnapshot, WorkStateItem, WorkState } from '../core/types.js';
import { isUserEvidence } from '../contracts/evidence.js';
import type { ContinuationClaim, ContinuationSnapshot } from './continuation.js';

/** One projection for the desktop, exported package, and every MCP context version. */
export function continuationWorkState(work: WorkSnapshot, snapshot: ContinuationSnapshot): WorkState {
  const events = new Map(work.sourceArchive.flatMap(event => [[event.id, event], [event.externalId, event]]));
  const item = (claim: ContinuationClaim, id: string): WorkStateItem => ({
    id: `continuation:${id}`,
    text: claim.text,
    origin: claim.sourceEventIds.length && claim.sourceEventIds.every(id => isUserEvidence(events.get(id)?.kind ?? ''))
      ? 'USER_STATED' : 'SYSTEM_INFERRED',
    sourceMessageIds: claim.sourceEventIds,
  });
  const current = snapshot.stages.find(stage => stage.id === snapshot.currentStageId);
  const outcomes = new Set([...(current?.outcomes.map(outcome => outcome.id) ?? []), ...(current?.dependsOn.map(dependency => dependency.outcomeId) ?? [])]);
  const requirements = snapshot.requirements.filter(requirement => requirement.status === 'ACTIVE' && (
    requirement.scope.kind === 'WORK' ||
    requirement.scope.kind === 'STAGE' && requirement.scope.ids.includes(current?.id ?? '') ||
    requirement.scope.kind === 'OUTCOME' && requirement.scope.ids.some(id => outcomes.has(id))
  ));
  const rows = (kind: string) => requirements.filter(r => r.kind === kind).map(r => item(r.claim, r.id));
  return {
    objective: snapshot.objective.map((claim, index) => item(claim, `objective-${index}`)),
    constraints: rows('CONSTRAINT'),
    decisions: rows('DECISION'),
    successCriteria: rows('SUCCESS_CRITERION'),
    facts: work.state.facts.filter(fact => fact.origin === 'USER_STATED' || fact.origin === 'USER_EDITED'),
    completedActions: snapshot.stages.filter(stage => ['REPORTED_DONE', 'SUPPORTED_DONE'].includes(stage.execution)).map(stage => ({
      ...item(stage.task, stage.id),
      ...(stage.execution === 'REPORTED_DONE' ? { text: `执行者自述：${stage.task.text}`, origin: 'AGENT_PROPOSED' as const } : {}),
    })),
    pendingActions: current?.remaining.map((claim, index) => item(claim, `next-${index}`)) ?? [],
    artifacts: work.state.artifacts,
  };
}
