import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { prepareAnalysisInput, projectedEvents } from '../../dist/distillation/analysis-input.js';
import { DistillationService } from '../../dist/distillation/service.js';
import { createWorkCore } from '../../dist/core/index.js';
import { hash } from '../../dist/definitions/storage.js';
import { LIMITS, validateRequest } from '../../dist/contracts/definition.js';
import { chunksFor, extractDefinition } from '../../server/workflow.mjs';
import { analysisAggregate } from '../../server/analysis-input.mjs';
import { normalizeUnconfirmedDuplicates } from '../../server/normalize-unconfirmed-rules.mjs';
import { validateRuleGraph } from '../../dist/contracts/rules.js';
import { FixtureClient, source as makeSource, result as fixtureResult } from './fixtures.ts';
import { jobError } from '../../dist/distillation/activity.js';

function event(key: string, kind: string, content: string, tool?: any) {
  return { id: key, key, sequence: Number(key.replace(/\D/g, '')) || 1, kind, content, hash: hash(content), ...(tool ? { tool } : {}) };
}
function record(user = '默认用中文，失败时保留具体原因。') {
  return { key: 'work-1', workId: 'w', events: [
    event('e1', 'user.prompt', user),
    event('e2', 'agent.response', '建议逐条展示，点击后查看引用。'),
    event('e3', 'tool.call', 'Read\n{"file_path":"/project/app.ts"}', { toolName: 'Read', callId: 'read' }),
    event('e4', 'tool.result', '1\texport const code = 1;\n'.repeat(2000), { toolName: 'Read', callId: 'read', status: 'completed' }),
    event('e5', 'tool.call', 'Read\n{"file_path":"/project/SPEC.md"}', { toolName: 'Read', callId: 'spec' }),
    event('e6', 'tool.result', '不得公开客户姓名。', { toolName: 'Read', callId: 'spec', status: 'completed' }),
    event('e7', 'tool.result', '错误：无法连接服务', { toolName: 'Bash', status: 'failed' }),
    event('e8', 'tool.result', 'unknown source must survive'.repeat(1200)),
    event('e9', 'user.prompt', '本次可以英文，以后仍用中文。按刚才的建议展示；不要自动提交。'),
  ] };
}
function wire(source: ReturnType<typeof record>) {
  const input = prepareAnalysisInput([source]);
  const events = projectedEvents(source, input);
  return { schemaVersion: 1 as const, snapshotHash: 'test', analysis: { schemaVersion: 1 as const, ruleVersion: input.ruleVersion,
    originalEvents: source.events.length, omittedEvents: source.events.length - events.length, excerptEvents: input.entries.filter(e => e.action === 'EXCERPT').length }, sources: [{ key: source.key, events }] };
}

test('filtering protects conversation, normative reads, errors and unknown output; only known code bodies disappear', () => {
  const source = record(), before = structuredClone(source), input = prepareAnalysisInput([source]);
  const view = projectedEvents(source, input);
  assert.equal(view.some(e => e.key === 'e4'), false);
  for (const key of ['e1', 'e2', 'e6', 'e7', 'e8', 'e9']) assert.equal(view.find(e => e.key === key)?.content, source.events.find(e => e.key === key)!.content);
  assert.deepEqual(source, before);
  validateRequest(wire(source));
  source.events[0]!.content = 'changed';
  assert.throws(() => projectedEvents(source, input), { code: 'SOURCE_CHANGED' });
});

test('user code fences, explicit filenames and ambiguous references protect implementation evidence', () => {
  for (const text of ['请修改 app.ts，验收按里面的条件。', '上面代码里的限制照办。', '保留这个例子：\n```ts\nexport const code = 1;\n```']) {
    const source = record(text), view = projectedEvents(source, prepareAnalysisInput([source]));
    assert.equal(view.find(e => e.key === 'e1')?.content, text);
    assert.ok(view.some(e => e.key === 'e4'));
  }
});

test('literal shell code reads are recognized but document reads, mixed commands and substitutions remain intact', () => {
  for (const [command, expected] of [
    ['cd /project && cat src/app.ts', 'OMIT'],
    ["sed -n '1,120p' src/app.ts", 'OMIT'],
    ["sed -n '1,120p' docs/SPEC.md", 'KEEP'],
    ['cat src/app.ts && cat requirements.md', 'KEEP'],
    ['cat $(choose-file).ts', 'KEEP'],
  ]) {
    const source = record();
    source.events.push(event('e10', 'tool.call', `Bash\n${JSON.stringify({ command })}`, { toolName: 'Bash', callId: 'shell' }));
    source.events.push(event('e11', 'tool.result', 'export const setting = 1;\n'.repeat(100), { toolName: 'Bash', callId: 'shell', status: 'completed' }));
    assert.equal(prepareAnalysisInput([source]).entries.at(-1)?.action, expected, command);
  }
});

test('test summaries are exact substrings; unrelated success cannot erase failure or its attempted patch', () => {
  const source = record();
  source.events.push(event('e10', 'tool.call', 'Edit\n{"file_path":"app.ts","old_string":"old","new_string":"new"}', { toolName: 'Edit', callId: 'edit' }));
  source.events.push(event('e11', 'tool.result', 'patch failed', { toolName: 'Edit', callId: 'edit', status: 'failed' }));
  const output = 'ok 1 - first\nok 2 - second\n# tests 2\n# pass 2\n# fail 0\n';
  source.events.push(event('e12', 'tool.call', 'Bash\n{"command":"npm test"}', { toolName: 'Bash', callId: 'tests' }));
  source.events.push(event('e13', 'tool.result', output, { toolName: 'Bash', callId: 'tests', status: 'completed' }));
  const input = prepareAnalysisInput([source]), view = projectedEvents(source, input);
  assert.ok(view.some(e => e.key === 'e7')); assert.ok(view.some(e => e.key === 'e10'));
  const summary = view.find(e => e.key === 'e13')!;
  assert.ok(output.includes(summary.content)); assert.ok(summary.content.includes('# fail 0'));
  assert.ok(summary.content.length < output.length);
});

test('identical output from a later invocation stays; only a replay of the same call is deduplicated', () => {
  const source = record();
  for (const [key, callId] of [['e10', 'first'], ['e11', 'second'], ['e12', 'second']])
    source.events.push(event(key!, 'tool.result', 'success', { toolName: 'Bash', callId, status: 'completed' }));
  const view = projectedEvents(source, prepareAnalysisInput([source]));
  assert.ok(view.some(e => e.key === 'e10')); assert.ok(view.some(e => e.key === 'e11'));
  assert.ok(!view.some(e => e.key === 'e12'));
});

test('writing a requirements document is protected even without an explicit filename in the user message', () => {
  const source = record();
  source.events.push(event('e10', 'tool.call', 'Write\n{"file_path":"SPEC.md","content":"每条事实必须有来源"}', { toolName: 'Write', callId: 'doc' }));
  assert.equal(prepareAnalysisInput([source]).entries.at(-1)?.action, 'KEEP');
});

test('a completed generated script retains its invocation; failed scripts and trailing commands stay whole', () => {
  for (const [exitCode, suffix, expected] of [[0, '', 'EXCERPT'], [1, '', 'KEEP'], [0, '\necho next', 'KEEP']] as const) {
    const source = record();
    source.events.push(event('e10', 'tool.call', "node --input-type=module <<'JS'\nconsole.log('generated code');\nJS" + suffix, { exitCode }));
    const input = prepareAnalysisInput([source]);
    assert.equal(input.entries.at(-1)?.action, expected);
    if (expected === 'EXCERPT') assert.equal(projectedEvents(source, input).at(-1)?.content, "node --input-type=module <<'JS'\n");
  }
});

test('nested archive is omitted only when every embedded event is already in the selected snapshot', () => {
  const source = record();
  source.events.push(event('e10', 'tool.call', 'mcp__worket__get_work_archive\n{"work_id":"w"}', { toolName: 'mcp__worket__get_work_archive', callId: 'archive' }));
  const nested = event('e11', 'tool.result', JSON.stringify({ workInstanceId: 'w', events: [source.events[0]] }), { toolName: 'mcp__worket__get_work_archive', callId: 'archive', status: 'completed' });
  source.events.push(nested);
  assert.equal(prepareAnalysisInput([source]).entries.at(-1)?.action, 'OMIT');
  nested.content = JSON.stringify({ workInstanceId: 'w', events: [{ id: 'missing', kind: 'user.prompt', content: '额外要求' }] }); nested.hash = hash(nested.content);
  assert.equal(prepareAnalysisInput([source]).entries.at(-1)?.action, 'KEEP');
});

test('long protected Chinese/emoji and documents split losslessly; legacy request behavior stays unchanged', () => {
  const source = record('不要删除任何要求。\n中文🙂'.repeat(3000));
  const request = wire(source), chunks = chunksFor(request);
  assert.ok(chunks.length > 2);
  for (const chunk of chunks) assert.ok(Buffer.byteLength(JSON.stringify({ phase: 'extract', events: chunk })) <= LIMITS.chunkBytes);
  for (const e of request.sources[0]!.events) {
    const parts = chunks.flat().filter((p: any) => p.key === e.key);
    assert.equal(parts.map((p: any) => p.content).join(''), e.content);
    for (const p of parts) assert.ok(!/[\uD800-\uDBFF]$/.test(p.content));
  }
  const legacy = { ...request }; delete legacy.analysis;
  assert.throws(() => chunksFor(legacy), { code: 'INPUT_TOO_LARGE' });
});

test('real extraction seam validates per-part quotes, aggregates only evidence and reports actual view coverage', async () => {
  const request = wire(record()); let aggregate: any;
  const provider = { model: 'fixture', async call(messages: any) {
    const body = JSON.parse(messages[1].content);
    if (body.phase === 'extract') {
      const user = body.events.filter((e: any) => e.kind === 'user.prompt');
      return { result: { eventKeys: body.events.map((e: any) => `${e.sourceKey}/${e.key}`), issues: [],
        requirements: user.map((e: any) => ({ id: e.key, text: e.content, scope: 'REUSABLE', sourceKeys: [`${e.sourceKey}/${e.key}`], replacedBy: null })),
        evidence: user.map((e: any) => ({ sourceKey: e.sourceKey, eventKey: e.key, excerpt: e.content })) } };
    }
    aggregate = body; return { result: fixtureResult(request) };
  } };
  const result = await extractDefinition(request, provider, new AbortController().signal);
  assert.equal(result.coverage.inputEvents, request.sources[0]!.events.length);
  assert.ok(Buffer.byteLength(JSON.stringify(aggregate)) < 5000);
  assert.ok(!JSON.stringify(aggregate).includes('unknown source must survive'));
  assert.ok(aggregate.evidence.some((e: any) => e.content.includes('以后仍用中文')));
  const forged = { ...provider, async call(messages: any) { const out = await provider.call(messages); if (out.result.evidence?.length) out.result.evidence[0].excerpt = '伪造用户要求'; return out; } };
  await assert.rejects(extractDefinition(request, forged, new AbortController().signal), { code: 'INVALID_SOURCE_REF' });
});

test('dense evidence fits the final budget while preserving every quote and candidate relationship', () => {
  const lines = Array.from({ length: 200 }, (_, i) => `第 ${i} 项：${'默认中文，引用必须逐字保留。'.repeat(5)}`);
  const e = event('e1', 'user.prompt', lines.join('\n'));
  const request = wire({ key: 'work-1', workId: 'w', events: [e] });
  let start = 0;
  const evidence = lines.map((excerpt, i) => {
    const ref = { sourceKey: 'work-1', eventKey: 'e1', excerpt, start, startLine: i + 1 };
    start += excerpt.length + 1;
    return ref;
  });
  const requirements = lines.map((_, i) => ({ id: `r${i}`, text: `保留第 ${i} 项条件`, scope: 'REUSABLE',
    sourceKeys: ['work-1/e1'], replacedBy: i === 0 ? 'r1' : null }));
  const aggregate = analysisAggregate(request, [{ requirements, evidence, issues: [] }]);
  assert.ok(Buffer.byteLength(JSON.stringify(aggregate)) <= LIMITS.chunkBytes * 4);
  assert.deepEqual(aggregate.evidence.map((ref: any) => ref.content), lines);
  assert.deepEqual(aggregate.chunks[0].requirements, requirements);
  assert.equal(request.sources[0]!.events[0]!.hash, hash(e.content));
});

test('document evidence keeps the file identity needed to pin an exact normative clause', () => {
  const content = '标题\n每条结论必须附原始出处。\n末尾';
  const e = { ...event('file-1', 'file.content', content), document: { role: 'NORMATIVE', name: 'SPEC.md' } };
  const request = { sources: [{ key: 'work-1', events: [e] }] };
  const aggregate = analysisAggregate(request, [{ requirements: [], issues: [], evidence: [{ sourceKey: 'work-1',
    eventKey: e.key, excerpt: '每条结论必须附原始出处。', start: 3, startLine: 2 }] }]);
  assert.deepEqual(aggregate.evidence[0].document, e.document);
  assert.equal(aggregate.evidence[0].hash, e.hash);
  assert.equal(aggregate.evidence[0].startLine, 2);
});

test('an unconfirmed duplicate stays independent and blocks review; active scope conflicts still fail', () => {
  const active = { key: 'language', text: '默认中文', rule: { scope: 'REUSABLE', status: 'ACTIVE' } };
  const proposed = { key: 'new_candidates', text: '新候选中文，旧候选不翻译', rule: { scope: 'UNCERTAIN',
    status: 'PROPOSED', relation: { kind: 'DUPLICATE', target: 'constraints.language' } } };
  const result: any = { content: { deliverables: [], constraints: [active], acceptanceCriteria: [proposed], methods: [] }, issues: [] };
  const before = structuredClone(result);
  normalizeUnconfirmedDuplicates(result);
  validateRuleGraph(result.content);
  assert.deepEqual(result.content.constraints, before.content.constraints);
  const candidate = result.content.acceptanceCriteria[0];
  assert.deepEqual(candidate, { ...before.content.acceptanceCriteria[0], rule: { scope: 'UNCERTAIN', status: 'PROPOSED' } });
  assert.equal(result.issues[0].blocking, true);
  assert.equal(result.issues[0].field, 'acceptanceCriteria.new_candidates');
  normalizeUnconfirmedDuplicates(result);
  assert.equal(result.issues.length, 1);
  for (const kind of ['DUPLICATE', 'REPLACES']) {
    const invalid = structuredClone(before);
    invalid.content.acceptanceCriteria[0].rule = { scope: 'INSTANCE', status: 'ACTIVE', relation: { kind, target: 'constraints.language' } };
    normalizeUnconfirmedDuplicates(invalid);
    assert.throws(() => validateRuleGraph(invalid.content), { code: 'RULE_SCOPE_MISMATCH' });
  }
});

test('retry migrates a failed legacy snapshot into a separate frozen view and preserves the old job and source', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'worket-analysis-'));
  const core = createWorkCore({ databasePath: join(directory, 'work.sqlite') }), work = makeSource(core), client = new FixtureClient();
  const service = new DistillationService(core, client);
  try {
    core.appendSourceEvents(work.instance.id, [
      { ...event('read', 'tool.call', 'Read\n{"file_path":"/project/app.ts"}'), externalId: 'read', timestamp: new Date().toISOString(), executorType: 'TOOL', environmentType: 'CODEX_DESKTOP', metadata: { toolName: 'Read', callId: 'read' }, artifactRefs: [] },
      { ...event('out', 'tool.result', '1\texport const code = 1;\n'.repeat(2000)), externalId: 'out', timestamp: new Date().toISOString(), executorType: 'TOOL', environmentType: 'CODEX_DESKTOP', metadata: { toolName: 'Read', callId: 'read', status: 'completed' }, artifactRefs: [] },
    ] as any);
    const prepared = service.prepare({ workIds: [work.instance.id], includedFileIds: [] });
    assert.ok(prepared.analysis);
    const legacy = structuredClone(prepared); delete legacy.analysis; for (const s of legacy.sources) for (const e of s.events) delete e.tool;
    legacy.id = randomUUID(); legacy.contentHash = hash(legacy.sources); core.definitions.db.prepare('INSERT INTO source_snapshots VALUES (?,?)').run(legacy.id, JSON.stringify(legacy));
    const old = { id: randomUUID(), snapshotId: legacy.id, status: 'INTERRUPTED', attempt: 1, commandId: randomUUID(), createdAt: new Date().toISOString(), error: 'INPUT_TOO_LARGE' };
    core.definitions.db.prepare('INSERT INTO distillation_jobs VALUES (?,?,?)').run(old.id, legacy.id, JSON.stringify(old));
    const before = core.getWork(work.instance.id);
    const job = service.retry({ jobId: old.id, expectedContentHash: legacy.contentHash, commandId: randomUUID() });
    await new Promise(r => setImmediate(r));
    assert.equal((await service.get(job.id)).status, 'AWAITING_REVIEW');
    assert.notEqual(job.snapshotId, legacy.id);
    assert.deepEqual(core.definitions.read('source_snapshots', legacy.id), legacy);
    assert.deepEqual(core.definitions.read('distillation_jobs', old.id), old);
    assert.deepEqual(core.getWork(work.instance.id), before);
    assert.ok(client.request.analysis.omittedEvents > 0);
  } finally { service.close(); core.close(); }
});

test('oversize job errors display an actionable explanation instead of repeated codes', () => {
  assert.ok(!jobError('INPUT_TOO_LARGE: INPUT_TOO_LARGE').includes('INPUT_TOO_LARGE'));
});

test('a backend without the analysis capability receives no filtered request', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'worket-analysis-capability-'));
  const core = createWorkCore({ databasePath: join(directory, 'work.sqlite') }), work = makeSource(core), client = new FixtureClient();
  const service = new DistillationService(core, client);
  try {
    core.appendSourceEvents(work.instance.id, [{ ...event('long', 'user.prompt', '不要删除这些要求。\n'.repeat(3000)), externalId: 'long', timestamp: new Date().toISOString(), executorType: 'HUMAN', environmentType: 'CODEX_DESKTOP', metadata: {}, artifactRefs: [] }] as any);
    const snapshot = service.prepare({ workIds: [work.instance.id], includedFileIds: [] });
    assert.ok(snapshot.analysis);
    client.capabilities = async () => ({ ruleSchemaVersions: [1], skillSchemaVersions: [1] } as any);
    const job = service.start({ preparationId: snapshot.id, expectedContentHash: snapshot.contentHash, consentVersion: 'worket-data-v1', commandId: randomUUID() });
    await new Promise(r => setImmediate(r));
    assert.equal(client.calls, 0);
    assert.match(core.definitions.read<any>('distillation_jobs', job.id).error, /^SERVICE_UPGRADE_REQUIRED/);
  } finally { service.close(); core.close(); }
});
