import type { NormalizedThread } from "../types.js";
import type { SourceEvent } from "../../core/types.js";
import { sourceIdentity } from "../../core/source-revisions.js";

/** Reuse original evidence IDs when an older transcript record is read through the SDK. */
export function reconcileLegacyEvents(thread: NormalizedThread, archive: readonly SourceEvent[]): NormalizedThread {
  const prefix = `workbuddy:${thread.threadId}:`;
  const legacy = archive.filter(event => event.externalId.startsWith(prefix) && /:(text|artifact):\d+$/.test(event.externalId)).sort((a, b) => a.sequence - b.sequence);
  if (!legacy.length) return thread;
  const legacyIds = new Set(legacy.map(event => event.externalId)), claimed = new Set<string>(), aliases = new Map<string, string>();
  for (const event of archive) {
    const nativeId = event.metadata?.workbuddyNativeExternalId;
    const originalId = sourceIdentity({ metadata: event.metadata ?? {} })?.externalId ?? event.externalId;
    if (typeof nativeId === 'string' && legacyIds.has(originalId)) aliases.set(nativeId, originalId);
  }
  const events = thread.events.map(event => {
    const originalId = aliases.get(event.externalId) ?? legacy.find(old => !claimed.has(old.externalId) && old.kind === event.kind && old.content?.trim() === event.content?.trim() && Date.parse(old.timestamp) === Date.parse(event.timestamp))?.externalId;
    if (!originalId) return event;
    claimed.add(originalId); aliases.set(event.externalId, originalId);
    return { ...event, id: originalId, externalId: originalId, metadata: { ...event.metadata, workbuddyNativeExternalId: event.externalId } };
  });
  const result: NormalizedThread = { ...thread, events };
  if (thread.history) {
    const mapped = new Set(aliases.values());
    // Unknown legacy aliases cannot establish absence (for example the first SDK read is mid-stream).
    if (legacy.some(event => !mapped.has(event.externalId) && !thread.history!.observedExternalIds.includes(event.externalId))) delete result.history;
    else result.history = { complete: true, observedExternalIds: thread.history.observedExternalIds.map(id => aliases.get(id) ?? id) };
  }
  return result;
}
