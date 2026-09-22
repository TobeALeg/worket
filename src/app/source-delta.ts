import { createHash } from 'node:crypto';
import type { NormalizedSourceEvent, NormalizedThread } from '../adapters/types.js';
import type { SourceEvent, WorkSnapshot } from '../core/types.js';
import { sourceIdentity } from '../core/source-revisions.js';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]));
  return value;
}
function fingerprint(event: NormalizedSourceEvent | SourceEvent): string {
  const { worketSource, sourceSequence, ...metadata } = event.metadata ?? {};
  return hash(canonical({ kind: event.kind, content: event.content, executorType: event.executorType, environmentType: event.environmentType, metadata }));
}
/** Scope IDs to the active source and append changes as observations, never overwrite history. */
export function sourceDelta(work: WorkSnapshot, thread: NormalizedThread): NormalizedSourceEvent[] {
  const binding = work.activeBinding!;
  const episodes = new Set(work.bindings.filter(b => b.adapter === binding.adapter && b.conversationId === binding.conversationId).map(b => b.episodeId));
  const latest = new Map<string, SourceEvent>();
  for (const event of work.sourceArchive) {
    const identity = sourceIdentity(event);
    if (identity ? identity.adapter === binding.adapter && identity.conversationId === binding.conversationId : event.episodeId && episodes.has(event.episodeId)) latest.set(identity?.externalId ?? event.externalId, event);
  }
  const start = thread.events.findIndex(event => latest.has(event.externalId));
  const scope = start === -1 ? thread.events : thread.events.slice(start);
  const occupied = new Set(work.sourceArchive.map(event => event.externalId));
  const observed = new Set<string>();
  const output: NormalizedSourceEvent[] = [];
  const maxSequence = Math.max(0, ...work.sourceArchive.map(event => event.sequence));
  for (const event of scope) {
    if (observed.has(event.externalId)) continue;
    observed.add(event.externalId);
    const previous = latest.get(event.externalId);
    if (previous && fingerprint(previous) === fingerprint(event)) continue;
    const externalId = previous ? `worket-revision:${hash([previous.id, fingerprint(event)])}` : occupied.has(event.externalId) ? `worket-source:${hash([binding.adapter, binding.conversationId, event.externalId])}` : event.externalId;
    output.push({ ...event, id: externalId, externalId, sequence: maxSequence + output.length + 1,
      metadata: { ...event.metadata, sourceSequence: event.sequence, worketSource: {
        adapter: binding.adapter, conversationId: binding.conversationId, externalId: event.externalId,
        ...(previous ? { previousEventId: previous.id } : {}),
      } },
    });
  }
  return output;
}
