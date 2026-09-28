import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ANALYSIS_RULE_VERSION, prepareAnalysisInput, projectedEvents } from '../../dist/distillation/analysis-input.js';
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

test('contract filtering omits execution details while preserving dialogue, decisions and source hashes', () => {
  const source = record('请遵守 SPEC.md；这段代码是输入要求：\n```ts\nexport const code = 1;\n```');
  source.events.push(event('e10', 'work.acceptance', '仅本次接受英文；以后仍用中文。'));
  source.events.push(event('e11', 'tool.call', 'Write\n{"file_path":"SPEC.md","content":"自动生成的规范"}'));
  const before = structuredClone(source), input = prepareAnalysisInput([source]), view = projectedEvents(source, input);
  assert.deepEqual(view.map(e => e.key), ['e1', 'e2', 'e9', 'e10']);
  for (const e of view) assert.equal(e.content, source.events.find(original => original.key === e.key)!.content);
  assert.deepEqual(source, before);
  assert.equal(input.ruleVersion, ANALYSIS_RULE_VERSION);
  assert.ok(input.entries.filter(e => e.action === 'OMIT').every(e => e.reason === 'execution-detail'));
  validateRequest(wire(source));
  // Omitted bodies remain authenticated, so changing hidden history is detected too.
  source.events[3]!.content = 'changed implementation';
  assert.throws(() => projectedEvents(source, input), { code: 'SOURCE_CHANGED' });
});

test('an older frozen view remains readable without applying the new filter during receive', () => {
  const source = record(), input = prepareAnalysisInput([source]);
  input.ruleVersion = 'distillation-input-v1';
  const entry = input.entries.find(e => e.eventKey === 'e4')!;
  entry.action = 'EXCERPT'; entry.range = { start: 2, end: 24 };
  const excerpt = projectedEvents(source, input).find(e => e.key === 'e4')!;
  assert.equal(excerpt.content, source.events[3]!.content.slice(2, 24));
  assert.equal(excerpt.hash, hash(excerpt.content));
  assert.equal(input.ruleVersion, 'distillation-input-v1');
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

test('selected normative files survive contract filtering and keep their authoritative role', () => {
  const core = createWorkCore({ databasePath: join(mkdtempSync(join(tmpdir(), 'worket-contract-files-')), 'work.sqlite') });
  const service = new DistillationService(core, new FixtureClient());
  try {
    const snapshot = service.prepare({ workIds: [makeSource(core).instance.id], includedFileIds: [] });
    const s = snapshot.sources[0]!;
    s.events.push(event('tool-1', 'tool.result', '工具正文中另有一个未采纳的规则。'));
    s.files.push({ id: 'selected', name: 'SPEC.md', path: '/selected/SPEC.md',
      hash: hash('不得公开客户姓名。'), content: '不得公开客户姓名。', role: 'NORMATIVE' });
    snapshot.analysis = prepareAnalysisInput(snapshot.sources);
    const request = service.wire(snapshot);
    assert.ok(!request.sources[0]!.events.some(e => e.key === 'tool-1'));
    const file = request.sources[0]!.events.find(e => e.key === 'file-1')!;
    assert.equal(file.content, '不得公开客户姓名。');
    assert.equal(file.document?.role, 'NORMATIVE');
    assert.equal(request.analysis?.omittedEvents, 1);
    validateRequest(request);
  } finally { service.close(); core.close(); }
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

for (const version of [undefined, 'distillation-input-v1']) test(`retry upgrades ${version ?? 'legacy'} into a new frozen view without changing history`, async () => {
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
    const legacy = structuredClone(prepared);
    if (version) {
      legacy.analysis!.ruleVersion = version;
      for (const entry of legacy.analysis!.entries) { entry.action = 'KEEP'; entry.reason = 'protected-or-unknown'; }
    } else delete legacy.analysis;
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
    assert.equal(client.request.analysis.ruleVersion, ANALYSIS_RULE_VERSION);
    assert.equal(client.request.analysis.omittedEvents, 2);
    assert.ok(client.request.sources.every((s: any) => s.events.every((e: any) => !e.kind.startsWith('tool.'))));
    const current = core.definitions.read<any>('source_snapshots', job.snapshotId);
    assert.equal(current.analysis.ruleVersion, ANALYSIS_RULE_VERSION);
    assert.deepEqual(current.sources, legacy.sources);
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
