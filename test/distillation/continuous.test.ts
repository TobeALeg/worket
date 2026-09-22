import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createWorkCore } from '../../dist/core/index.js';
import { DistillationService } from '../../dist/distillation/service.js';
import { CONTINUOUS_CONSENT, CONTINUOUS_IDLE_MS } from '../../dist/distillation/continuous-evolution.js';
import { WorketAIClient } from '../../dist/ai-service/client.js';
import { hash } from '../../dist/definitions/storage.js';
import { FixtureClient, result, source } from './fixtures.ts';

const id = () => randomUUID();
const settle = () => new Promise(resolve => setImmediate(resolve));
async function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'worket-continuous-')), databasePath = join(directory, 'work.sqlite');
  const core = createWorkCore({ databasePath });
  let time = Date.now(), destination = 'service-one';
  const client = new FixtureClient();
  client.capabilities = async () => ({ ruleSchemaVersions: [1], skillSchemaVersions: [1], evolutionSchemaVersions: [1] });
  client.improvementIdentity = () => destination;
  client.get = async requestId => {
    const out = result(client.request);
    if (client.request.evolution) { out.content = null; out.evolution = { baseHash: client.request.evolution.contentHash, changes: [] }; }
    else for (const section of ['deliverables', 'constraints', 'acceptanceCriteria', 'methods']) for (const item of out.content[section]) item.rule = { scope: 'REUSABLE', status: 'ACTIVE' };
    return { requestId, status: 'SUCCEEDED', result: out };
  };
  const service = new DistillationService(core, client, () => time);
  const work = source(core);
  const snapshot = service.prepare({ workIds: [work.instance.id], includedFileIds: [] });
  const original = service.start({ preparationId: snapshot.id, expectedContentHash: snapshot.contentHash, consentVersion: 'worket-data-v1', commandId: id() });
  await settle(); const ready = await service.get(original.id);
  const publish = (job: any) => { const draft = core.definitions.read<any>('definition_drafts', job.draftId); return core.definitions.publish({ draftId: draft.id, expectedRevision: draft.revision, materialBindings: {}, commandId: id() }); };
  const base = publish(ready);
  const create = () => core.createWorkFromDefinition({ definitionId: base.id, inputs: { customer: '新客户', market: '新市场' }, referenceExampleIds: [], commandId: id() });
  const append = (work: any, text: string, kind = 'user.prompt') => {
    if (!core.getWork(work.instance.id).activeBinding) core.startExecutionEpisode(work.instance.id, { executor: { type: 'AGENT', name: 'QA' }, environment: { type: 'CODEX_DESKTOP', name: 'QA' }, source: { adapter: 'codex', conversationId: id() } });
    core.appendSourceEvents(work.instance.id, [{ externalId: id(), sequence: core.getWork(work.instance.id).sourceArchive.length + 1, kind, content: text, timestamp: new Date(time).toISOString(), executorType: 'HUMAN', environmentType: 'CODEX_DESKTOP', metadata: {}, artifactRefs: [] }]);
  };
  const advance = (ms = CONTINUOUS_IDLE_MS + 1) => { time += ms; };
  const enable = () => service.continuous.set(base.id, true, CONTINUOUS_CONSENT);
  const trigger = async () => { await service.tick(); advance(); await service.tick(); await settle(); };
  const automatic = () => core.definitions.list<any>('distillation_jobs').filter(j => j.automatic);
  return { directory, databasePath, core, client, service, base, create, append, advance, enable, trigger, automatic, publish, now: () => time, destination: (v: string) => destination = v };
}

test('opt-in future scope, idle batching, one review, and confirmation cursor work through the real service', async () => {
  const f = await setup();
  try {
    const work = f.create(); f.append(work, '开启前的旧文本');
    await f.trigger(); assert.equal(f.client.calls, 1, 'off by default');
    await assert.rejects(f.service.continuous.set(f.base.id, true), /CONSENT_REQUIRED/);
    await f.enable();
    const fresh = f.create(); await f.trigger(); assert.equal(f.client.calls, 1, 'input alone does not trigger');
    f.append(work, '隐藏推理', 'reasoning.summary'); f.append(work, '工具输出的文件正文', 'tool.result');
    f.append(work, '开启后的新要求');
    const path = join(f.directory, 'new.md'); writeFileSync(path, '不应自动读取的文件内容');
    f.core.addArtifactRef(work.instance.id, { path, filename: 'new.md', role: 'REFERENCE', mimeType: 'text/markdown', size: 10, sha256: hash('not read'), lastModifiedAt: new Date().toISOString(), availability: 'AVAILABLE' });
    await f.service.tick(); assert.equal(f.client.calls, 1);
    f.advance(); await Promise.all([f.service.tick(), f.service.tick(), f.service.tick()]); await settle();
    assert.equal(f.client.calls, 2); assert.equal(f.automatic().length, 1);
    const wire = JSON.stringify(f.client.request);
    assert.match(wire, /开启后的新要求/); assert.doesNotMatch(wire, /开启前的旧文本|隐藏推理|工具输出|不应自动读取/);
    assert.equal(f.client.request.sources.length, 1, 'unrelated instance inputs stay local');
    const job = await f.service.get(f.automatic()[0].id); assert.equal(job.status, 'AWAITING_REVIEW', job.error);
    f.append(fresh, '另一个实例的新要求'); await f.trigger(); assert.equal(f.client.calls, 2, 'pending review blocks accumulation');
    assert.equal(f.core.definitions.versions(f.base.definitionKey).length, 1, 'no automatic publication');
    f.publish(job); await f.trigger(); assert.equal(f.client.calls, 3);
    assert.doesNotMatch(JSON.stringify(f.client.request), /开启后的新要求/, 'confirmed event cursor advances');
    assert.equal(f.service.improvement.list().length, 0, 'continuous authorization does not enroll improvement samples');
  } finally { f.service.close(); f.core.close(); }
});

test('failed batch and rate limit persist across restart; toggling does not reset the 24-hour budget', async () => {
  const f = await setup();
  try {
    const work = f.create(); await f.enable();
    f.client.submit = async () => { f.client.calls++; throw new Error('network outcome unknown'); };
    for (let n = 0; n < 3; n++) { f.append(work, `新要求 ${n}`); await f.trigger(); }
    assert.equal(f.client.calls, 4);
    const reopened = createWorkCore({ databasePath: f.databasePath });
    const resumed = new DistillationService(reopened, f.client, f.now);
    try { await resumed.tick(); f.advance(); await resumed.tick(); assert.equal(f.client.calls, 4, 'same failed batch not retried after restart'); }
    finally { resumed.close(); reopened.close(); }
    await f.service.continuous.set(f.base.id, false); await f.enable();
    f.append(work, '重新开启后新要求'); await f.trigger(); assert.equal(f.client.calls, 4, 'toggle does not evade budget');
    assert.equal(f.service.continuous.status(f.base.id).remaining, 0);
    f.advance(86_400_001); await f.service.tick(); await settle(); assert.equal(f.client.calls, 5);
  } finally { f.service.close(); f.core.close(); }
});

test('stop and destination change while capabilities are pending prevent automatic submission', async () => {
  for (const mutation of ['stop', 'destination', 'delete']) {
    const f = await setup();
    try {
      const work = f.create(); await f.enable(); f.append(work, '以后交付字幕');
      let resolve: (value: any) => void;
      f.client.capabilities = () => new Promise(r => resolve = r);
      await f.trigger(); assert.equal(f.automatic().length, 1); assert.equal(f.client.calls, 1);
      if (mutation === 'stop') await f.service.continuous.set(f.base.id, false);
      if (mutation === 'destination') f.destination('another-service');
      if (mutation === 'delete') f.core.deleteWorkPermanently(work.instance.id, { confirmation: work.instance.id });
      resolve!({ ruleSchemaVersions: [1], skillSchemaVersions: [1], evolutionSchemaVersions: [1] }); await settle();
      assert.equal(f.client.calls, 1, mutation);
      assert.ok(['FAILED', 'CANCELLED'].includes(f.automatic()[0].status), f.automatic()[0].status);
    } finally { f.service.close(); f.core.close(); }
  }
});

test('a newer published version is the next baseline; stale pending auto request cannot silently use it', async () => {
  const f = await setup();
  try {
    const work = f.create(); await f.enable(); f.append(work, '以后增加新规则');
    let resolve: (value: any) => void;
    f.client.capabilities = () => new Promise(r => resolve = r);
    await f.trigger();
    const draft = f.core.definitions.revise({ definitionId: f.base.id, commandId: id() });
    const content = structuredClone(draft.content); content.name += '第二版';
    const revised = f.core.definitions.update({ draftId: draft.id, expectedRevision: draft.revision, content, issueResolutions: [] });
    const v2 = f.core.definitions.publish({ draftId: revised.id, expectedRevision: revised.revision, materialBindings: {}, commandId: id() });
    resolve!({ ruleSchemaVersions: [1], skillSchemaVersions: [1], evolutionSchemaVersions: [1] }); await settle();
    assert.equal(f.client.calls, 1); assert.match(f.automatic()[0].error, /BASE_DEFINITION_CHANGED/);
    f.client.capabilities = async () => ({ ruleSchemaVersions: [1], skillSchemaVersions: [1], evolutionSchemaVersions: [1] });
    f.append(work, '后续又有新交互'); await f.trigger();
    assert.equal(f.client.request.evolution.contentHash, v2.contentHash);
  } finally { f.service.close(); f.core.close(); }
});

test('production HTTP client rechecks consent after asynchronous connection, before any POST', async () => {
  let resolve: () => void, authorized = true, checked = false;
  const client = new WorketAIClient(() => ({ url: 'http://127.0.0.1:1', token: 'qa', development: true }), () => new Promise(r => resolve = r));
  const sending = client.submit({} as any, id(), () => { checked = true; assert.ok(authorized, 'consent was revoked'); });
  authorized = false; resolve!();
  await assert.rejects(sending, /consent was revoked/); assert.ok(checked);
});


test('authorization cannot move to another destination or override a concurrent stop', async () => {
  for (const mutation of ['destination', 'stop']) {
    const f = await setup();
    try {
      let resolve: (value: any) => void;
      f.client.capabilities = () => new Promise(r => resolve = r);
      const enabling = f.enable();
      if (mutation === 'destination') f.destination('other');
      else await f.service.continuous.set(f.base.id, false);
      resolve!({ evolutionSchemaVersions: [1] });
      await assert.rejects(enabling, /CONTINUOUS_STOPPED/);
      assert.equal(f.service.continuous.status(f.base.id).enabled, false);
    } finally { f.service.close(); f.core.close(); }
  }
});

test('remote status, acknowledgment and cancellation recheck destination after connection', async () => {
  for (const operation of ['get', 'ack', 'cancel']) {
    let resolve: () => void, authorized = true;
    const client = new WorketAIClient(() => ({ url: 'http://127.0.0.1:1', token: 'qa', development: true }), () => new Promise(r => resolve = r));
    const pending = client[operation]('private-request-id', () => assert.ok(authorized, 'destination changed'));
    authorized = false; resolve!();
    await assert.rejects(pending, /destination changed/);
  }
});

test('explicit retry after stopping retains the original destination across asynchronous submission', async () => {
  const f = await setup();
  try {
    const work = f.create(); await f.enable(); f.append(work, '以后交付字幕');
    f.client.submit = async () => { f.client.calls++; throw new Error('uncertain send'); };
    await f.trigger(); const old = f.automatic()[0]; assert.equal(old.status, 'INTERRUPTED');
    await f.service.continuous.set(f.base.id, false);
    f.client.submit = FixtureClient.prototype.submit.bind(f.client);
    let resolve: (value: any) => void;
    f.client.capabilities = () => new Promise(r => resolve = r);
    const snapshot = f.core.definitions.read<any>('source_snapshots', old.snapshotId);
    const retry = f.service.retry({ jobId: old.id, expectedContentHash: snapshot.contentHash, commandId: id() });
    f.destination('other'); resolve!({ ruleSchemaVersions: [1], skillSchemaVersions: [1], evolutionSchemaVersions: [1] }); await settle();
    const job = f.core.definitions.read<any>('distillation_jobs', retry.id);
    assert.equal(job.status, 'FAILED'); assert.match(job.error, /CONTINUOUS_STOPPED/); assert.equal(f.client.calls, 2);
  } finally { f.service.close(); f.core.close(); }
});
