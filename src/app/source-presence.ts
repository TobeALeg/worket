import { createHash } from 'node:crypto';
import type { NormalizedThread } from '../adapters/types.js';
import type { SourceEvent, WorkSnapshot } from '../core/types.js';
import { sourceIdentity } from '../core/source-revisions.js';
import { latestSourceObservations } from './source-delta.js';

/** Absence is an observation, never an instruction to revoke a confirmed contract. */
export type SourceAbsence = { event: SourceEvent; confirmed: boolean };
export class SourcePresence {
  readonly #pending = new Map<string, string>();
  reset(workId: string): void { this.#pending.delete(workId); }
  observe(work: WorkSnapshot, thread: NormalizedThread): SourceAbsence[] {
    const workId = work.instance.id;
    if (thread.history?.complete !== true || !Array.isArray(thread.history.observedExternalIds) ||
        thread.history.observedExternalIds.some(id => typeof id !== 'string')) { this.reset(workId); return []; }
    const observed = new Set(thread.history.observedExternalIds);
    if (thread.events.some(event => !observed.has(event.externalId))) { this.reset(workId); return []; }
    const missing = [...latestSourceObservations(work).values()].filter(event =>
      event.kind !== 'source.absent' && !observed.has(sourceIdentity(event)?.externalId ?? event.externalId) &&
      (sourceIdentity(event) || event.environmentType !== 'WORKPET_LOCAL' && ['user.prompt', 'agent.response'].includes(event.kind)));
    if (!missing.length) { this.reset(workId); return []; }
    const fingerprint = createHash('sha256').update(JSON.stringify([work.activeBinding!.id, [...observed].sort(), missing.map(event => sourceIdentity(event)?.externalId ?? event.externalId).sort()])).digest('hex');
    const confirmed = this.#pending.get(workId) === fingerprint;
    this.#pending.set(workId, fingerprint);
    return missing.filter(event => confirmed || event.kind !== 'source.check').map(event => ({ event, confirmed }));
  }
}
