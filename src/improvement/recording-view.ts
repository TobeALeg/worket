import type { SourceEvent } from '../core/types.js';
import { sourceIdentity } from '../core/source-revisions.js';
import type { RecordingEntry, RecordingView } from '../contracts/recording-view.js';
/** Only IDs of already allowed user/agent messages leave this projection. */
export function recordingView(events: readonly SourceEvent[]): RecordingView {
  const entries = new Map<string, RecordingEntry>(), ancestry = new Map<string, string>();
  let sequence = 0;
  for (const event of events) {
    const previous = sourceIdentity(event)?.previousEventId;
    const priorMessageId = previous ? ancestry.get(previous) : undefined;
    const message = ['user.prompt', 'agent.response'].includes(event.kind) && !!event.content?.trim();
    if (message) {
      if (priorMessageId) entries.set(priorMessageId, { sourceEventId: priorMessageId, status: 'SUPERSEDED', supersededBy: event.id });
      entries.set(event.id, { sourceEventId: event.id, status: 'CURRENT' });
      ancestry.set(event.id, event.id); sequence = Math.max(sequence, event.sequence);
    } else if (priorMessageId && ['source.check', 'source.absent'].includes(event.kind)) {
      entries.set(priorMessageId, { sourceEventId: priorMessageId, status: event.kind === 'source.check' ? 'PENDING' : 'ABSENT' });
      ancestry.set(event.id, priorMessageId); sequence = Math.max(sequence, event.sequence);
    }
  }
  return { sequence, entries: [...entries.values()] };
}
