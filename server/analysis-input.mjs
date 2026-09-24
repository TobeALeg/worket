import { LIMITS, ensure } from '../dist/contracts/definition.js';
import { hasExactExcerpt } from '../dist/contracts/evidence.js';

export const ANALYSIS_EXTRACT_PROMPT = `
The input is a versioned analysis view. Some mechanical tool bodies were omitted locally; you have NOT read those bodies. Coverage describes only the supplied view.
Return only {requirements:[{id,text,scope,sourceKeys,replacedBy}],eventKeys:["sourceKey/eventKey"],issues:[],evidence:[{sourceKey,eventKey,excerpt}]}. Every requirement must have a verbatim evidence excerpt for EACH of its sourceKeys. Include all explicit requirements, corrections, negations, temporary exceptions, adoption statements and relevant Agent proposals; do not turn code implementation details or tool progress into reusable obligations. Preserve Chinese wording and qualifications. No generalization yet.
Long events have part.start/end offsets and part.startLine, but retain the SAME event key. Cover each supplied part. Use a unique requirement id including the event key and part.start when present. An excerpt must be an exact contiguous substring of the supplied content, without added ellipses. Keep enough surrounding text to preserve conditions and negation. Source kinds and document roles are authoritative. The later phase will receive your candidates plus these excerpts, NOT the full history.`;

/** Split large events at text boundaries. The original key/hash and line offsets survive. */
export function analysisChunks(request) {
  const chunks = [];
  let current = [];
  const flush = () => { if (current.length) chunks.push(current); current = []; };
  const fits = items => Buffer.byteLength(JSON.stringify({ phase: 'extract', events: items })) <= LIMITS.chunkBytes;
  for (const source of request.sources) for (const event of source.events) {
    // Content hashes remain in the request and are restored in the evidence catalog;
    // the first extraction pass only needs immutable source/event keys and text.
    const { hash: _hash, ...body } = event;
    const item = { sourceKey: source.key, ...body };
    if (fits([...current, item])) {
      current.push(item);
      continue;
    }
    let start = 0, startLine = 1;
    while (start < event.content.length) {
      const make = end => ({ ...item, content: event.content.slice(start, end), part: { start, end, startLine } });
      let low = start, high = event.content.length;
      while (low < high) {
        const end = Math.ceil((low + high) / 2);
        if (fits([...current, make(end)])) low = end; else high = end - 1;
      }
      let end = low;
      // Fill useful remaining space rather than wasting a nearly empty batch on
      // the next event. Avoid creating tiny fragments just to fill the last bytes.
      if (current.length && end - start < 1024) { flush(); continue; }
      if (end < event.content.length && /[\uD800-\uDBFF]/.test(event.content[end - 1] ?? '')) end--;
      const newline = event.content.lastIndexOf('\n', end - 1) + 1;
      if (end < event.content.length && newline > start + (end - start) * 0.6) end = newline;
      ensure(end > start, 'INPUT_TOO_LARGE', '单条来源的元数据已超出分块预算');
      const part = make(end);
      current.push(part);
      if (end < event.content.length) flush();
      startLine += (part.content.match(/\n/g) ?? []).length;
      start = end;
    }
  }
  flush();
  ensure(chunks.length + 1 <= LIMITS.maxCalls, 'INPUT_TOO_LARGE', `保留的必要内容需要 ${chunks.length} 批，当前最多处理 ${LIMITS.maxCalls - 1} 批，请缩小来源范围`);
  return chunks;
}

/** Reject invented quotes before aggregation; offsets are computed, never trusted. */
export function validateAnalysisEvidence(result, chunk) {
  ensure(Array.isArray(result.evidence), 'INVALID_MODEL_OUTPUT', '分块提取未返回原文依据');
  const evidence = result.evidence.map(ref => {
    const event = chunk.find(e => e.sourceKey === ref.sourceKey && e.key === ref.eventKey);
    ensure(event && hasExactExcerpt(event.content, ref.excerpt), 'INVALID_SOURCE_REF', '分块依据必须是所处理片段的原文');
    const offset = event.content.indexOf(ref.excerpt);
    return { sourceKey: ref.sourceKey, eventKey: ref.eventKey, excerpt: ref.excerpt,
      start: (event.part?.start ?? 0) + offset,
      startLine: (event.part?.startLine ?? 1) + (event.content.slice(0, offset).match(/\n/g) ?? []).length };
  });
  for (const requirement of result.requirements) {
    ensure(Array.isArray(requirement.sourceKeys) && requirement.sourceKeys.length > 0, 'INVALID_SOURCE_REF');
    for (const key of requirement.sourceKeys)
      ensure(evidence.some(e => `${e.sourceKey}/${e.eventKey}` === key), 'INVALID_SOURCE_REF', '候选缺少对应原文依据');
  }
  return evidence;
}

export function analysisAggregate(request, intermediates) {
  const evidence = new Map();
  for (const intermediate of intermediates) for (const ref of intermediate.evidence) {
    const event = request.sources.find(s => s.key === ref.sourceKey)?.events.find(e => e.key === ref.eventKey);
    ensure(event && event.content.slice(ref.start, ref.start + ref.excerpt.length) === ref.excerpt, 'INVALID_SOURCE_REF');
    const key = JSON.stringify([ref.sourceKey, ref.eventKey, ref.start, ref.excerpt]);
    // Hashes authenticate the frozen request locally; repeating one per excerpt
    // consumes model context without adding evidence. Keep every verified quote.
    evidence.set(key, { workId: ref.sourceKey, eventId: ref.eventKey, kind: event.kind,
      content: ref.excerpt, excerptOnly: true, startLine: ref.startLine,
      ...(event.document ? { document: event.document } : {}) });
  }
  return {
    phase: 'reconcile-and-generalize',
    ...(request.evolution ? { baseline: request.evolution } : {}),
    sourceKeys: request.sources.map(s => s.key),
    analysis: request.analysis,
    evidence: [...evidence.values()],
    chunks: intermediates.map(({ requirements, issues }) => ({ requirements, issues })),
  };
}
