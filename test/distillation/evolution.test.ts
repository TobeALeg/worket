import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync, mkdtempSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createWorkCore } from '../../dist/core/index.js';
import { DistillationService } from '../../dist/distillation/service.js';
import { effectiveRules, ruleItems } from '../../dist/contracts/rules.js';
import { validateResult } from '../../dist/contracts/definition.js';
import { extractDefinition } from '../../server/workflow.mjs';
import { hash } from '../../dist/definitions/storage.js';
import { buildWorkPackage, packageMarkdown } from '../../dist/definitions/work-package.js';
import { evolutionBaseline } from '../../dist/definitions/evolution.js';
import { FixtureClient, source, result } from './fixtures.ts';

const id = () => randomUUID();
const active = { scope: 'REUSABLE', status: 'ACTIVE' };
async function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'worket-evolution-'));
  const core = createWorkCore({ databasePath: join(directory, 'work.sqlite') });
  const messages = JSON.parse(readFileSync(new URL('../fixtures/contracts/video/request-1.json', import.meta.url), 'utf8'));
  const events = JSON.parse(messages[1].content).events;
  const work = source(core, events[0].content), file = events[1];
  const path = join(directory, 'FRAME.md'); writeFileSync(path, file.content);
  const artifact = core.addArtifactRef(work.instance.id, { path, filename: 'FRAME.md', role: 'REFERENCE', mimeType: 'text/markdown', size: Buffer.byteLength(file.content), sha256: hash(file.content), lastModifiedAt: new Date().toISOString(), availability: 'AVAILABLE' }).artifactRefs.at(-1)!;
  const client = new FixtureClient(); client.capabilities = async () => ({ ruleSchemaVersions: [1], skillSchemaVersions: [1], evolutionSchemaVersions: [1] });
  const service = new DistillationService(core, client);
  client.get = async () => ({ requestId: client.latest.requestId, status: 'SUCCEEDED', result: JSON.parse(readFileSync(new URL('../fixtures/contracts/video/response-2.json', import.meta.url), 'utf8')).result });
  const snapshot = service.prepare({ workIds: [work.instance.id], includedFileIds: [artifact.id], fileRoles: { [artifact.id]: 'NORMATIVE' } });
  const run = async (snapshot: any) => {
    const job = service.start({ preparationId: snapshot.id, expectedContentHash: snapshot.contentHash, consentVersion: 'worket-data-v1', commandId: id() });
    await new Promise(r => setImmediate(r));
    const done = await service.get(job.id); assert.equal(done.status, 'AWAITING_REVIEW', done.error);
    return core.definitions.read<any>('definition_drafts', done.draftId!);
  };
  const publish = (draft: any) => core.definitions.publish({ draftId: draft.id, expectedRevision: draft.revision, materialBindings: {}, commandId: id() });
  let draft = await run(snapshot);
  if (draft.issues.length) draft = core.definitions.update({ draftId: draft.id, expectedRevision: draft.revision, content: draft.content, issueResolutions: draft.issues.map(i => ({ issueId: i.id, action: 'ACCEPT', explanation: '合成基准已检查' })) });
  const base = publish(draft);
  const create = (definition = base) => core.createWorkFromDefinition({ definitionId: definition.id, inputs: Object.fromEntries(definition.content.inputs.map(i => [i.key, '本期全新脚本'])), referenceExampleIds: [], commandId: id() });
  const append = (work: any, text: string) => {
    if (!core.getWork(work.instance.id).activeBinding) core.startExecutionEpisode(work.instance.id, { executor: { type: 'AGENT', name: 'Codex' }, environment: { type: 'CODEX_DESKTOP', name: 'Codex' }, source: { adapter: 'codex', conversationId: id() } });
    return core.appendSourceEvents(work.instance.id, [{ externalId: id(), sequence: core.getWork(work.instance.id).sourceArchive.length + 1, kind: 'user.prompt', content: text, timestamp: new Date().toISOString(), executorType: 'HUMAN', environmentType: 'CODEX_DESKTOP', metadata: {}, artifactRefs: [] }]);
  };
  const prepare = (work: any, definition = base) => service.prepare({ baseDefinitionId: definition.id, workIds: [work.instance.id], includedFileIds: [] });
  const changesFor = (snapshot: any, changes: any[]) => {
    const request = service.wire(snapshot), out = result(request);
    out.content = null;
    out.evolution = { baseHash: request.evolution.contentHash, changes: changes.map(change => ({ ...change, item: { ...change.item, basis: { type: 'SOURCE', origin: 'USER_STATED', refs: [{ snapshotId: 'wire', workId: request.sources[0].key, eventId: request.sources[0].events.find(e => e.kind === 'user.prompt').key }] } } })) };
    return out;
  };
  const mock = (value: any) => { client.get = async () => ({ requestId: client.latest.requestId, status: 'SUCCEEDED', result: structuredClone(value) }); };
  return { directory, core, client, service, path, base, create, append, prepare, run, publish, changesFor, mock };
}

test('delta retains untouched inputs/documents, separates instance exceptions, publishes v2 and preserves old dispatch', async () => {
  const f = await setup();
  try {
    const work = f.create(); f.append(work, '以后文案限 30 words，交付逐句字幕；本次在 12 秒切换画面。此前蓝色背景的提议已撤销。');
    const snapshot = f.prepare(work), rows = ruleItems(effectiveRules(f.base.content).content);
    const limit = rows.find(r => /50 words/.test(r.item.text))!;
    const out = f.changesFor(snapshot, [
      { kind: 'REPLACES', section: 'constraints', target: limit.address, item: { key: 'newLimit', text: '文案不超过 30 words', rule: active } },
      { kind: 'ADD', section: 'deliverables', item: { key: 'subtitles', text: '逐句字幕', rule: active } },
      { kind: 'ADD', section: 'constraints', item: { key: 'timestamp', text: '12 秒切换画面', rule: { scope: 'INSTANCE', status: 'ACTIVE' } } },
      { kind: 'ADD', section: 'constraints', item: { key: 'oldProposal', text: '蓝色背景', rule: { scope: 'REUSABLE', status: 'RETIRED' } } },
    ]);
    f.mock(out); const draft = await f.run(snapshot);
    assert.deepEqual(draft.content.inputs, f.base.content.inputs);
    assert.deepEqual(draft.content.purpose, f.base.content.purpose);
    assert.equal(draft.evolution.ignored.length, 2);
    const v2 = f.publish(draft); assert.equal(v2.version, 2);
    assert.ok(v2.materials.some(m => m.hash === f.base.materials[0].hash));
    unlinkSync(f.path);
    const pkg = buildWorkPackage(f.create(v2), f.core.definitions), md = packageMarkdown(pkg);
    assert.match(md, /30 words/); assert.match(md, /逐句字幕/); assert.ok(!md.includes('50 words')); assert.ok(!md.includes('12 秒')); assert.ok(!md.includes('蓝色背景'));
    assert.match(packageMarkdown(buildWorkPackage(work, f.core.definitions)), /50 words/);
    assert.equal(f.service.evolutionSources(v2.id).find(s => s.workId === work.instance.id)?.count, 0);
  } finally { f.core.close(); }
});

test('duplicate-only confirmation adds traceable evidence, no version; persisted cursor skips only confirmed event hashes', async () => {
  const f = await setup();
  try {
    const work = f.create(); f.append(work, '以后仍然交付 MP4。');
    const snapshot = f.prepare(work), target = ruleItems(effectiveRules(f.base.content).content).find(r => /MP4/.test(r.item.text))!;
    const repeated = f.changesFor(snapshot, [{ kind: 'DUPLICATE', section: target.section, target: target.address, item: { key: 'repeat', text: '交付 MP4', rule: active } }]);
    repeated.evolution.changes[0].item.basis.refs[0].eventId = snapshot.sources[0].events.find(e => e.kind === 'user.prompt').key;
    repeated.evolution.changes[0].item.basis.refs[0].excerpt = '以后仍然交付 MP4。';
    f.mock(repeated);
    const draft = await f.run(snapshot);
    assert.deepEqual(draft.content, f.base.content);
    assert.ok(f.service.evolutionSources(f.base.id).find(s => s.workId === work.instance.id)!.count > 0, 'unreviewed result cannot advance cursor');
    const confirmed = f.publish(draft); assert.equal(confirmed.id, f.base.id);
    assert.equal(f.core.definitions.versions(f.base.definitionKey).length, 1);
    assert.equal((await f.service.get(draft.jobId)).status, 'SAVED');
    assert.equal(f.core.definitions.evolutionHistory(f.base.definitionKey)[0].evidence[0].refs[0].workId, work.instance.id);
    assert.throws(() => f.prepare(work), /MISSING_INFORMATION/);
    f.append(work, '以后还要交付字幕。');
    assert.equal(f.prepare(work).sources[0].events.length, 1);
    const reopened = createWorkCore({ databasePath: join(f.directory, 'work.sqlite') });
    try { assert.equal(new DistillationService(reopened, f.client).evolutionSources(f.base.id).find(s => s.workId === work.instance.id)?.count, 1); } finally { reopened.close(); }
    f.core.deleteWorkPermanently(work.instance.id, { confirmation: work.instance.id });
    const evidence = f.core.definitions.evolutionHistory(f.base.definitionKey)[0].evidence[0].refs[0];
    assert.equal(evidence.deleted, true); assert.equal(evidence.excerpt, undefined);
    assert.ok(!JSON.stringify(f.core.definitions.list('source_snapshots')).includes('以后还要交付字幕。'));
  } finally { f.core.close(); }
});

test('stale base, forged target, scope-changing duplicate and old backend cannot silently evolve a contract', async () => {
  const f = await setup();
  try {
    const work = f.create(); f.append(work, '以后也交付字幕'); const snapshot = f.prepare(work);
    const out = f.changesFor(snapshot, [{ kind: 'ADD', section: 'deliverables', item: { key: 'captions', text: '字幕', rule: active } }]);
    const bad = structuredClone(out); bad.evolution.baseHash = 'other'; assert.throws(() => validateResult(bad, f.service.wire(snapshot)), /BASE_DEFINITION_CHANGED/);
    const forged = structuredClone(out); Object.assign(forged.evolution.changes[0], { kind: 'DUPLICATE', target: 'constraints.missing' });
    assert.throws(() => validateResult(forged, f.service.wire(snapshot)), /INVALID_RULE_TARGET/);
    const scoped = structuredClone(out), target = ruleItems(effectiveRules(f.base.content).content)[0];
    Object.assign(scoped.evolution.changes[0], { kind: 'DUPLICATE', target: target.address }); scoped.evolution.changes[0].item.rule.scope = 'INSTANCE';
    assert.throws(() => validateResult(scoped, f.service.wire(snapshot)), /RULE_SCOPE_MISMATCH/);
    f.mock(out); const draft = await f.run(snapshot);
    f.client.capabilities = async () => ({ ruleSchemaVersions: [1], skillSchemaVersions: [1] });
    const before = f.client.calls;
    const job = f.service.start({ preparationId: snapshot.id, expectedContentHash: snapshot.contentHash, consentVersion: 'worket-data-v1', commandId: id() });
    await new Promise(r => setImmediate(r));
    assert.equal((await f.service.get(job.id)).status, 'FAILED'); assert.equal(f.client.calls, before);
    const manual = f.core.definitions.revise({ definitionId: f.base.id, commandId: id() });
    const content = structuredClone(manual.content); content.name += '修订';
    f.publish(f.core.definitions.update({ draftId: manual.id, expectedRevision: manual.revision, content, issueResolutions: [] }));
    assert.throws(() => f.publish(draft), /BASE_DEFINITION_CHANGED/);
    assert.throws(() => f.service.start({ preparationId: snapshot.id, expectedContentHash: snapshot.contentHash, consentVersion: 'worket-data-v1', commandId: id() }), /BASE_DEFINITION_CHANGED/);
  } finally { f.core.close(); }
});

test('evolution workflow sends a path-free baseline and validates new evidence through both model phases', async () => {
  const f = await setup();
  try {
    const work = f.create(); f.append(work, '以后交付字幕'); const snapshot = f.prepare(work), request = f.service.wire(snapshot);
    assert.ok(!JSON.stringify(request.evolution).includes(f.directory));
    assert.ok(!JSON.stringify(request.evolution).includes('snapshotId'));
    const augmented = structuredClone(f.base.content); augmented.purpose.localCachePath = f.directory;
    assert.ok(!JSON.stringify(evolutionBaseline(f.base, augmented)).includes(f.directory), 'unknown local metadata must not leak through the baseline projection');
    const expected = f.changesFor(snapshot, [{ kind: 'ADD', section: 'deliverables', item: { key: 'captions', text: '字幕', rule: active } }]);
    let calls = 0;
    const value = await extractDefinition(request, { model: 'controlled-fixture', async call(messages: any[]) {
      calls++; const body = JSON.parse(messages[1].content);
      if (body.phase === 'extract') return { result: { requirements: [], issues: [], eventKeys: body.events.map(e => `${e.sourceKey}/${e.key}`) } };
      assert.deepEqual(body.baseline, request.evolution); assert.ok(messages[0].content.endsWith('No deletion by omission. No tool use. No generic rules unsupported by new evidence.'));
      return { result: expected };
    } }, new AbortController().signal);
    assert.equal(calls, 2); assert.equal(value.versions.prompt, 'work-definition-evolution-v1.7'); assert.equal(value.content, null);
  } finally { f.core.close(); }
});

test('replacing a fixed material role requires a fresh binding while the old instance keeps its bytes', async () => {
  const f = await setup();
  try {
    const oldPath = join(f.directory, 'old-logo.txt'), newPath = join(f.directory, 'new-logo.txt');
    writeFileSync(oldPath, 'old brand'); writeFileSync(newPath, 'new brand');
    let manual = f.core.definitions.revise({ definitionId: f.base.id, commandId: id() });
    const content = structuredClone(manual.content);
    content.materialRoles.push({ key: 'logo', text: '品牌标志', required: true, basis: { type: 'INFERRED', refs: [], rationale: 'test' } });
    manual = f.core.definitions.update({ draftId: manual.id, expectedRevision: manual.revision, content, issueResolutions: [] });
    const base = f.core.definitions.publish({ draftId: manual.id, expectedRevision: manual.revision, materialBindings: { logo: oldPath }, commandId: id() });
    const work = f.create(base); f.append(work, '以后改用新版品牌标志，必须使用新版资料。');
    const snapshot = f.prepare(work, base);
    f.mock(f.changesFor(snapshot, [{ kind: 'REPLACES', section: 'materialRoles', target: 'materialRoles.logo', item: { key: 'logo', text: '新版品牌标志', required: true } }]));
    const draft = await f.run(snapshot);
    assert.throws(() => f.publish(draft), /MATERIAL_MISSING/);
    const next = f.core.definitions.publish({ draftId: draft.id, expectedRevision: draft.revision, materialBindings: { logo: newPath }, commandId: id() });
    assert.equal(next.materials.find(m => m.role === 'logo').hash, hash('new brand'));
    assert.equal(buildWorkPackage(work, f.core.definitions).fixedMaterials.find(m => m.role === 'logo').hash, hash('old brand'));
  } finally { f.core.close(); }
});

test('explicit adoption keeps a separate Agent context reference through local receive and immutable publication', async () => {
  const f = await setup();
  try {
    const work = f.create(); f.append(work, '字幕按你建议的，以后每期都加。');
    f.core.appendSourceEvents(work.instance.id, [{ externalId: id(), sequence: f.core.getWork(work.instance.id).sourceArchive.length + 1, kind: 'agent.response', content: '建议逐句字幕。', timestamp: new Date().toISOString(), executorType: 'AGENT', environmentType: 'CODEX_DESKTOP', metadata: {}, artifactRefs: [] }]);
    const snapshot = f.prepare(work), value = f.changesFor(snapshot, [{ kind: 'ADD', section: 'constraints', item: { key: 'subtitles', text: '每期逐句字幕', rule: active } }]);
    const agent = snapshot.sources[0].events.find(e => e.kind === 'agent.response');
    value.evolution.changes[0].item.basis.refs.push({ snapshotId: 'wire', workId: 'work-1', eventId: agent.key, excerpt: '建议逐句字幕。', role: 'CONTEXT' });
    f.mock(value); const draft = await f.run(snapshot);
    const rule = draft.content.constraints.find(i => i.key === 'subtitles');
    assert.equal(rule.basis.origin, 'USER_STATED'); assert.equal(rule.basis.refs[1].role, 'CONTEXT');
    assert.equal(rule.basis.refs[1].workId, work.instance.id); assert.equal(rule.basis.refs[1].eventId, agent.id);
    const saved = f.publish(draft); assert.equal(saved.content.constraints.find(i => i.key === 'subtitles').basis.refs[1].role, 'CONTEXT');
  } finally { f.core.close(); }
});
