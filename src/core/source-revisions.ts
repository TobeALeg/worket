import type { SourceEvent, WorkState } from './types.js';

export type SourceIdentity = { adapter: string; conversationId: string; externalId: string; previousEventId?: string; scopeStartExternalId?: string };
export function sourceIdentity(event: Pick<SourceEvent, 'metadata'>): SourceIdentity | null {
  const source = event.metadata.worketSource as Partial<SourceIdentity> | undefined;
  return source && typeof source.adapter === 'string' && typeof source.conversationId === 'string' && typeof source.externalId === 'string' ? source as SourceIdentity : null;
}
/** The archive is append-only. Consumers of current content omit explicitly superseded observations. */
export function supersededSources(events: readonly SourceEvent[]): Set<string> {
  const seen = new Map<string, SourceEvent>(), superseded = new Set<string>();
  for (const event of events) {
    let previous = event.kind === 'source.check' ? undefined : seen.get(sourceIdentity(event)?.previousEventId ?? '');
    while (previous) {
      superseded.add(previous.id); superseded.add(previous.externalId);
      previous = previous.kind === 'source.check' ? seen.get(sourceIdentity(previous)?.previousEventId ?? '') : undefined;
    }
    seen.set(event.id, event);
  }
  return superseded;
}
export function currentSourceObservations<T extends Pick<SourceEvent, 'id' | 'metadata'>>(events: readonly T[]): T[] {
  const current: T[] = [], positions = new Map<string, number>();
  for (const event of events) {
    const previous = sourceIdentity(event)?.previousEventId;
    const position = previous ? positions.get(previous) : undefined;
    const index = position ?? current.length;
    current[index] = event; positions.set(event.id, index);
  }
  return current;
}
export function currentSourceEvents(events: readonly SourceEvent[]): SourceEvent[] {
  const byId = new Map(events.map(event => [event.id, event]));
  return currentSourceObservations(events).flatMap(event => {
    let visible: SourceEvent | undefined = event;
    while (visible?.kind === 'source.check') visible = byId.get(sourceIdentity(visible)?.previousEventId ?? '');
    return visible && visible.kind !== 'source.absent' ? [visible] : [];
  });
}
export function hasPendingSourceChecks(events: readonly SourceEvent[]): boolean {
  return currentSourceObservations(events).some(event => event.kind === 'source.check');
}
export function assertSourcePresenceReady(events: readonly SourceEvent[]): void {
  if (hasPendingSourceChecks(events))
    throw new Error('SOURCE_CHECK_PENDING: 来源变化待复核，请刷新记录后再交接或提炼');
}
export function sourceAvailabilityNotice(events: readonly SourceEvent[]): string | undefined {
  if (hasPendingSourceChecks(events)) return '来源变化待复核，暂缓交接和提炼。请刷新记录继续核对。';
  const count = currentSourceObservations(events).filter(event => event.kind === 'source.absent').length;
  return count ? `${count} 条历史记录已不在当前来源中，已停止自动采用。已确认约定仍按原版本执行。` : undefined;
}
export function currentSourceState(state: WorkState, events: readonly SourceEvent[]): WorkState {
  const superseded = supersededSources(events);
  return Object.fromEntries(Object.entries(state).map(([field, items]) => [field,
    items.filter(item => item.origin === 'USER_EDITED' || !item.sourceMessageIds.some(id => superseded.has(id)))
  ])) as WorkState;
}
/** Keep manual edits and deletion decisions attached to the logical source across revisions. */
export function sourceRoots(events: readonly Pick<SourceEvent, 'id' | 'externalId' | 'metadata'>[]): Map<string, string> {
  const roots = new Map<string, string>();
  for (const event of events) {
    const previous = sourceIdentity(event)?.previousEventId;
    const root = (previous && roots.get(previous)) || event.id;
    roots.set(event.id, root); roots.set(event.externalId, root);
  }
  return roots;
}
