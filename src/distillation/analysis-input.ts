import { ensure, type WireEvent } from '../contracts/definition.js';
import { hash } from '../definitions/storage.js';

export const ANALYSIS_RULE_VERSION = 'contract-input-v2';
type Event = WireEvent & { id: string };
type Source = { key: string; workId: string; events: Event[] };
export type AnalysisEntry = {
  sourceKey: string; eventKey: string; sourceHash: string;
  action: 'KEEP' | 'EXCERPT' | 'OMIT' | 'DUPLICATE';
  reason: string; range?: { start: number; end: number }; duplicateOf?: string;
};
export type AnalysisInput = { schemaVersion: 1; ruleVersion: string; entries: AnalysisEntry[] };

/** Contract extraction uses dialogue and explicitly selected files, not execution logs.
 * The complete tool history stays in the immutable local snapshot for inspection.
 * EXCERPT/DUPLICATE remain readable for jobs frozen under older rule versions.
 */
export function prepareAnalysisInput(sources: readonly Source[]): AnalysisInput {
  const entries: AnalysisEntry[] = sources.flatMap(source => source.events.map(event => ({
    sourceKey: source.key, eventKey: event.key, sourceHash: event.hash,
    action: event.kind.startsWith('tool.') ? 'OMIT' : 'KEEP',
    reason: event.kind.startsWith('tool.') ? 'execution-detail' : 'contract-evidence',
  })));
  return { schemaVersion: 1, ruleVersion: ANALYSIS_RULE_VERSION, entries };
}

export function projectedEvents(source: Source, input: AnalysisInput): WireEvent[] {
  const decisions = new Map(input.entries.filter(e => e.sourceKey === source.key).map(e => [e.eventKey, e]));
  return source.events.flatMap(event => {
    const entry = decisions.get(event.key);
    ensure(entry && entry.sourceHash === event.hash && hash(event.content) === event.hash, 'SOURCE_CHANGED', '分析输入与固定来源不一致');
    if (entry.action === 'OMIT' || entry.action === 'DUPLICATE') return [];
    const content = entry.action === 'EXCERPT' ? event.content.slice(entry.range!.start, entry.range!.end) : event.content;
    return [{ key: event.key, sequence: event.sequence, kind: event.kind, content, hash: hash(content) }];
  });
}
