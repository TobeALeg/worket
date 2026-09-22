import type { SampleEvent } from './improvement.js';
export type RecordingEntry = { sourceEventId: string; status: 'CURRENT' | 'SUPERSEDED' | 'PENDING' | 'ABSENT'; supersededBy?: string };
export type RecordingView = { sequence: number; baseSequence?: number; entries: RecordingEntry[] };
type Message = { sourceEventId: string; sequence: number; kind: string; timestamp: string; content: string; parts: number; part: number };
/** A complete view is required; raw append-only messages alone cannot prove currentness. */
export function projectRecordingSample(events: SampleEvent[]) {
  const views = events.filter(e => e.kind === 'RECORDING_VIEW').map(e => e.data as unknown as RecordingView).sort((a, b) => a.sequence - b.sequence);
  const issues = new Set<string>(), checkpoint = views.findLast(view => view.baseSequence === undefined);
  let view = checkpoint;
  const effective = new Map(checkpoint?.entries.map(entry => [entry.sourceEventId, entry]) ?? []);
  const seen = new Map<number, string>();
  for (const next of views.filter(next => !checkpoint || next.sequence >= checkpoint.sequence)) {
    const fingerprint = JSON.stringify(next);
    if (seen.has(next.sequence)) {
      if (seen.get(next.sequence) !== fingerprint) issues.add('CONFLICTING_VIEW');
      continue;
    }
    seen.set(next.sequence, fingerprint);
    if (next.baseSequence === undefined) continue;
    if (!view || next.baseSequence !== view.sequence) { issues.add('VIEW_CHAIN_INCOMPLETE'); continue; }
    for (const entry of next.entries) effective.set(entry.sourceEventId, entry);
    view = { sequence: next.sequence, entries: [...effective.values()] };
  }
  const groups = new Map<string, { header: string; value: Message; pieces: Map<number, string> }>();
  for (const event of events) {
    if (event.kind !== 'MESSAGE') continue;
    const data = event.data as unknown as Message;
    const { part, content, ...header } = data;
    const key = JSON.stringify([header.sourceEventId, header.sequence, header.kind, header.timestamp, header.parts]);
    let group = groups.get(data.sourceEventId);
    if (!group) { group = { header: key, value: data, pieces: new Map() }; groups.set(data.sourceEventId, group); }
    if (group.header !== key || group.pieces.has(part) && group.pieces.get(part) !== content) issues.add('CONFLICTING_MESSAGE');
    group.pieces.set(part, content);
  }
  if (!view) issues.add('VIEW_UNAVAILABLE');
  const entries = new Map(view?.entries.map(entry => [entry.sourceEventId, entry]) ?? []);
  for (const entry of entries.values()) {
    if (!groups.has(entry.sourceEventId)) issues.add('MISSING_MESSAGE');
    if (entry.status === 'PENDING') issues.add('SOURCE_PENDING');
    if (entry.supersededBy) {
      const source = groups.get(entry.sourceEventId)?.value, target = groups.get(entry.supersededBy)?.value;
      if (!target || source && target.sequence <= source.sequence) issues.add('INVALID_REVISION');
    }
  }
  // A revision keeps its original position in the conversation, even when observed later.
  const ordered = [...groups.values()].sort((a, b) => a.value.sequence - b.value.sequence);
  const positions = new Map(ordered.map(group => [group.value.sourceEventId, group.value.sequence]));
  for (const group of ordered) {
    const id = group.value.sourceEventId, target = entries.get(id)?.supersededBy;
    if (target && positions.has(target)) positions.set(target, Math.min(positions.get(target)!, positions.get(id)!));
  }
  const messages = ordered.sort((a, b) => positions.get(a.value.sourceEventId)! - positions.get(b.value.sourceEventId)! || a.value.sequence - b.value.sequence).map(group => {
    const data = group.value, entry = entries.get(data.sourceEventId);
    const complete = Number.isSafeInteger(data.parts) && data.parts > 0 && data.parts <= 1000 && group.pieces.size === data.parts && [...Array(data.parts).keys()].every(part => group.pieces.has(part));
    if (!complete) issues.add('INCOMPLETE_MESSAGE');
    if (view && (!entry || data.sequence > view.sequence)) issues.add('VIEW_BEHIND_MESSAGES');
    return { sourceEventId: data.sourceEventId, sequence: data.sequence, kind: data.kind, timestamp: data.timestamp,
      content: complete ? [...Array(data.parts).keys()].map(part => group.pieces.get(part)).join('') : '', complete,
      status: entry?.status ?? 'UNKNOWN', ...(entry?.supersededBy ? { supersededBy: entry.supersededBy } : {}) };
  });
  const ready = issues.size === 0;
  return { ready, throughSequence: view?.sequence ?? null, issues: [...issues], messages,
    current: ready ? messages.filter(message => message.status === 'CURRENT') : [] };
}
