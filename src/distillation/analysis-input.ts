import { basename, extname } from 'node:path';
import { ensure, type WireEvent } from '../contracts/definition.js';
import { hash } from '../definitions/storage.js';

export const ANALYSIS_RULE_VERSION = 'distillation-input-v1';
export type ToolMetadata = { toolName?: string; callId?: string; status?: string; exitCode?: number };
type Event = WireEvent & { id: string; tool?: ToolMetadata };
type Source = { key: string; workId: string; events: Event[] };
export type AnalysisEntry = {
  sourceKey: string; eventKey: string; sourceHash: string;
  action: 'KEEP' | 'EXCERPT' | 'OMIT' | 'DUPLICATE';
  reason: string; range?: { start: number; end: number }; duplicateOf?: string;
};
export type AnalysisInput = { schemaVersion: 1; ruleVersion: string; entries: AnalysisEntry[] };

/** Copy only classification metadata; never duplicate output bodies or arbitrary tool arguments. */
export function toolMetadata(metadata: Record<string, unknown>): ToolMetadata {
  return {
    ...(typeof metadata.toolName === 'string' ? { toolName: metadata.toolName } : {}),
    ...(typeof metadata.callId === 'string' ? { callId: metadata.callId } : {}),
    ...(typeof metadata.status === 'string' ? { status: metadata.status } : {}),
    ...(typeof metadata.exitCode === 'number' ? { exitCode: metadata.exitCode } : {}),
  };
}

function argumentsOf(event: Event | undefined): Record<string, unknown> | null {
  if (!event) return null;
  try {
    const value = JSON.parse(event.content.slice(event.content.indexOf('\n') + 1));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

const codeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rs', '.go', '.java', '.c', '.h', '.cpp', '.css', '.scss', '.swift']);
const internalReads = new Set(['get_work_archive', 'mcp__worket__get_work_archive']);
const failed = (e: Event) => ['error', 'failed', 'cancelled', 'interrupted'].includes(e.tool?.status ?? '') || (e.tool?.exitCode !== undefined && e.tool.exitCode !== 0);

/** Recognize a single literal file read, optionally after `cd`; never execute shell text. */
function shellReadPath(command: unknown): string {
  if (typeof command !== 'string') return '';
  const path = String.raw`(?:"[^"$\x60\\\n]+"|'[^'\n]+'|[^\s;&|<>$\x60\\]+)`;
  const text = command.trim().replace(new RegExp(`^cd\\s+${path}\\s+&&\\s+`), '');
  const match = text.match(new RegExp(`^(?:cat(?:\\s+--)?|sed\\s+-n\\s+['"]?\\d+(?:,\\d+)?p['"]?)\\s+(${path})$`));
  return match ? match[1]!.replace(/^['"]|['"]$/g, '') : '';
}

function repeatedArchiveBody(content: string, source: Source): boolean {
  try {
    const value = JSON.parse(content);
    return value.workInstanceId === source.workId && Array.isArray(value.events) && value.events.length > 0 &&
      value.events.every((nested: { id?: string; content?: unknown; kind?: string }) => source.events.some(e =>
        e.id === nested.id && e.kind === nested.kind && typeof nested.content === 'string' && e.hash === hash(nested.content)));
  } catch { return false; }
}

/** Deterministic outbound view. Unknown tools and every conversation message remain intact. */
export function prepareAnalysisInput(sources: readonly Source[]): AnalysisInput {
  const entries: AnalysisEntry[] = [];
  for (const source of sources) {
    const userText = source.events.filter(e => e.kind === 'user.prompt').map(e => e.content).join('\n');
    // A deictic reference cannot reliably identify a file; conservatively protect all code reads.
    const refersToOutput = /(?:上面|刚才|上一条|前面).{0,16}(?:代码|输出|规范|规则|文件)|(?:这|那)段(?:代码|输出)|这个函数|(?:above|previous|earlier|preceding|that|this)\s+(?:code|output|function|file|spec|rule)/i.test(userText);
    const quotes = [...userText.matchAll(/```[^\n]*\n([\s\S]*?)```|`([^`\n]{8,})`/g)].map(m => (m[1] ?? m[2]!).trim()).filter(Boolean);
    const calls = new Map(source.events.filter(e => e.kind === 'tool.call' && e.tool?.callId).map(e => [e.tool!.callId!, e]));
    const failures = new Set(source.events.filter(e => e.kind === 'tool.result' && failed(e)).map(e => e.tool?.callId).filter(Boolean));
    const bodies = new Map<string, string>();
    for (const event of source.events) {
      const entry: AnalysisEntry = { sourceKey: source.key, eventKey: event.key, sourceHash: event.hash, action: 'KEEP', reason: 'protected-or-unknown' };
      entries.push(entry);
      if (!event.kind.startsWith('tool.')) continue;
      const call = event.kind === 'tool.call' ? event : calls.get(event.tool?.callId ?? '');
      const name = event.tool?.toolName ?? call?.tool?.toolName;
      const args = argumentsOf(call);
      const shellPath = name === 'Bash' ? shellReadPath(args?.command) : '';
      const path = typeof args?.file_path === 'string' ? args.file_path : typeof args?.path === 'string' ? args.path : shellPath;
      const protectedText = refersToOutput || !!(path && (userText.includes(path) || userText.includes(basename(path)))) || quotes.some(quote => event.content.includes(quote));
      if (protectedText || failed(event) || (event.tool?.callId && failures.has(event.tool.callId))) continue;
      const success = event.tool?.status === 'completed' || event.tool?.exitCode === 0;
      const script = !name && event.kind === 'tool.call' && event.tool?.exitCode === 0
        ? event.content.match(/^[^\n]*\b(?:node|python3?)\b[^\n]*<<\s*(['"]?)([A-Za-z_]\w*)\1[ \t]*\n/) : null;
      if (script && event.content.trimEnd().endsWith(`\n${script[2]}`)) {
        entry.action = 'EXCERPT'; entry.reason = 'generated-script-invocation'; entry.range = { start: 0, end: script[0].length };
      } else if (event.kind === 'tool.result' && name && internalReads.has(name) && success && args?.work_id === source.workId && repeatedArchiveBody(event.content, source)) {
        // This is a nested copy of the SAME authorized archive, not external work evidence.
        entry.action = 'OMIT'; entry.reason = 'same-work-archive-read';
      } else if (event.kind === 'tool.call' && ['Edit', 'Write', 'apply_patch', 'functions.apply_patch'].includes(name ?? '') && args && path && codeExtensions.has(extname(path).toLowerCase()) &&
                 (typeof args.old_string === 'string' || typeof args.content === 'string' || typeof args.patch === 'string')) {
        // The result event and the original call remain available in the local archive.
        entry.action = 'OMIT'; entry.reason = 'implementation-write-body';
      } else if (event.kind === 'tool.result' && path && codeExtensions.has(extname(path).toLowerCase()) && success &&
                 ((name === 'Read' && /^\s*\d+[\t│ ]/.test(event.content)) || (shellPath && !/^(?:cat|sed):|permission denied|no such file/i.test(event.content)))) {
        entry.action = 'OMIT'; entry.reason = 'implementation-file-read';
      } else if (event.kind === 'tool.result' && name === 'Bash' && typeof args?.command === 'string' && /\b(?:npm (?:run )?test|node\b[^\n;&|]*--test)\b/.test(args.command) && success && !/(?:^|\n)not ok\b/.test(event.content) && /(?:^|\n)# tests \d+\r?\n/.test(event.content) && /(?:^|\n)# fail 0(?:\r?\n|$)/.test(event.content)) {
        const start = event.content.search(/(?:^|\n)# tests \d+\r?\n/);
        entry.action = 'EXCERPT'; entry.reason = 'successful-tap-summary'; entry.range = { start, end: event.content.length };
      }
      // Replayed output for the SAME invocation is redundant; equal output from
      // a later invocation still carries timing/state evidence and must survive.
      if (entry.action === 'KEEP' && event.kind === 'tool.result' && name && event.tool?.callId && success) {
        const identity = `${name}\0${event.tool.callId}\0${event.hash}`;
        const previous = bodies.get(identity);
        if (previous) { entry.action = 'DUPLICATE'; entry.reason = 'identical-tool-body'; entry.duplicateOf = previous; }
        else bodies.set(identity, event.key);
      }
    }
  }
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
