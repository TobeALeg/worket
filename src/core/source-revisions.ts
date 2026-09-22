import type { SourceEvent, WorkState } from './types.js';

export type SourceIdentity = { adapter: string; conversationId: string; externalId: string; previousEventId?: string };
export function sourceIdentity(event: Pick<SourceEvent, 'metadata'>): SourceIdentity | null {
  const source = event.metadata.worketSource as Partial<SourceIdentity> | undefined;
  return source && typeof source.adapter === 'string' && typeof source.conversationId === 'string' && typeof source.externalId === 'string' ? source as SourceIdentity : null;
}
/** The archive is append-only. Consumers of current content omit explicitly superseded observations. */
export function supersededSources(events: readonly SourceEvent[]): Set<string> {
  const seen = new Map<string, SourceEvent>(), superseded = new Set<string>();
  for (const event of events) {
    const previous = seen.get(sourceIdentity(event)?.previousEventId ?? '');
    if (previous) { superseded.add(previous.id); superseded.add(previous.externalId); }
    seen.set(event.id, event);
  }
  return superseded;
}
export function currentSourceEvents(events: readonly SourceEvent[]): SourceEvent[] {
  const current: SourceEvent[] = [], positions = new Map<string, number>();
  for (const event of events) {
    const previous = sourceIdentity(event)?.previousEventId;
    const position = previous ? positions.get(previous) : undefined;
    const index = position ?? current.length;
    current[index] = event; positions.set(event.id, index);
  }
  return current;
}
export function currentSourceState(state: WorkState, events: readonly SourceEvent[]): WorkState {
  const superseded = supersededSources(events);
  return Object.fromEntries(Object.entries(state).map(([field, items]) => [field,
    items.filter(item => item.origin === 'USER_EDITED' || !item.sourceMessageIds.some(id => superseded.has(id)))
  ])) as WorkState;
}
/** Keep manual edits and deletion decisions attached to the logical source across revisions. */
export function sourceRoots(events: readonly SourceEvent[]): Map<string, string> {
  const roots = new Map<string, string>();
  for (const event of events) {
    const previous = sourceIdentity(event)?.previousEventId;
    const root = (previous && roots.get(previous)) || event.id;
    roots.set(event.id, root); roots.set(event.externalId, root);
  }
  return roots;
}
