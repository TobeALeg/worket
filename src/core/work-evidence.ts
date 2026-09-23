import type { SourceEvent } from './types.js';
import { currentSourceEvents } from './source-revisions.js';

/** Current authorized business evidence; reading Worket itself is not new work. */
export function workEvidence(events: readonly SourceEvent[]): SourceEvent[] {
  return currentSourceEvents(events).filter(event => event.kind !== 'reasoning.summary' &&
    !(event.metadata.access === 'read' && event.metadata.outcome === 'success' &&
      typeof event.metadata.auditId === 'string' && event.metadata.auditId.startsWith('workpet:mcp:')) &&
    !(event.metadata.toolName === 'get_work_context' && event.metadata.outcome === 'success'));
}
