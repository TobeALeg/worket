import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorkCore } from '../../dist/core/index.js';
import { DistillationService } from '../../dist/distillation/service.js';
import { sourceReview } from '../../dist/definitions/source-review.js';
import { source, FixtureClient } from './fixtures.ts';

async function setup() {
  const core = createWorkCore({ databasePath: join(mkdtempSync(join(tmpdir(), 'worket-source-review-')), 'work.sqlite') });
  const work = source(core), client = new FixtureClient(), service = new DistillationService(core, client);
  const snapshot = service.prepare({ workIds: [work.instance.id], includedFileIds: [] });
  const job = service.start({ preparationId: snapshot.id, expectedContentHash: snapshot.contentHash, consentVersion: 'worket-data-v1', commandId: randomUUID() });
  await new Promise(r => setImmediate(r));
  const ready = await service.get(job.id); assert.equal(ready.status, 'AWAITING_REVIEW');
  const draft = core.definitions.read<any>('definition_drafts', ready.draftId!);
  let previous = work.sourceArchive[0]!;
  function observe(kind: string, content: string | null, linked = true) {
    const externalId = randomUUID();
    const event = core.appendSourceEvents(work.instance.id, [{ externalId, sequence: core.getWork(work.instance.id)!.sourceArchive.length + 1,
      kind: kind as any, content, timestamp: new Date().toISOString(), executorType: 'HUMAN', environmentType: 'CODEX_DESKTOP', artifactRefs: [],
      metadata: linked ? { worketSource: { adapter: 'codex', conversationId: 'qa', externalId: 'logical-user', previousEventId: previous.id } } : {} }]).work.sourceArchive.at(-1)!;
    if (linked) previous = event;
  }
  const status = () => sourceReview(core.definitions, draft);
  const input = (sourceReviewHash?: string) => ({ draftId: draft.id, expectedRevision: draft.revision, materialBindings: {}, commandId: randomUUID(), ...(sourceReviewHash ? { sourceReviewHash } : {}) });
  return { core, work, draft, snapshot, observe, status, input };
}

test('changed selected evidence requires current explicit confirmation; unrelated additions do not invalidate it', async () => {
  const f = await setup();
  try {
    assert.equal(f.status().changes.length, 0);
    f.observe('user.prompt', '其他新消息', false); assert.equal(f.status().changes.length, 0);
    f.observe('user.prompt', '以后无需来源链接。'); const first = f.status();
    assert.equal(first.changes[0]?.status, 'REVISED');
    assert.throws(() => f.core.definitions.publish(f.input()), /SOURCE_REVIEW_REQUIRED/);
    f.observe('user.prompt', '以后仅引用一手来源。');
    assert.throws(() => f.core.definitions.publish(f.input(first.hash)), /SOURCE_REVIEW_REQUIRED/);
    const latest = f.status(); f.observe('agent.response', '无关进展', false);
    assert.equal(f.status().hash, latest.hash);
    const input = f.input(latest.hash), published = f.core.definitions.publish(input);
    assert.equal(published.content.constraints[0]?.text, f.draft.content.constraints[0].text);
    assert.deepEqual(f.core.definitions.read('source_snapshots', f.snapshot.id), f.snapshot);
    f.observe('user.prompt', '第三次修改'); assert.equal(f.core.definitions.publish(input).id, published.id, 'completed command is idempotent');
    const audit = f.core.definitions.db.prepare('SELECT payload_json FROM review_events WHERE owner_id=?').all(published.id).map(r=>JSON.parse(String(r.payload_json))).find(r=>r.type==='SOURCE_SNAPSHOT_CONFIRMED');
    assert.equal(audit.sourceReviewHash, latest.hash); assert.equal(audit.changes.length, 1);
    assert.ok(!JSON.stringify(audit).includes('以后仅引用一手来源'), 'audit stores hashes and references, not extra raw text');
  } finally { f.core.close(); }
});

test('pending, absent and restored observations are distinct; identical restoration needs no override', async () => {
  const f = await setup();
  try {
    f.observe('source.check', null); const pending=f.status(); assert.equal(pending.changes[0]?.status, 'PENDING');
    assert.throws(()=>f.core.definitions.publish(f.input()),/SOURCE_REVIEW_REQUIRED/);
    f.observe('source.absent', null); const absent=f.status(); assert.equal(absent.changes[0]?.status, 'ABSENT');
    assert.notEqual(absent.hash,pending.hash); assert.throws(()=>f.core.definitions.publish(f.input(pending.hash)),/SOURCE_REVIEW_REQUIRED/);
    f.observe('user.prompt', f.snapshot.sources[0]!.events[0]!.content);
    assert.equal(f.status().changes.length,0); assert.ok(f.core.definitions.publish(f.input()).id);
  } finally { f.core.close(); }
});

test('explicitly adopting historical evidence never changes a previously published instance', async () => {
  const f=await setup();
  try {
    const published=f.core.definitions.publish(f.input());
    const instance=f.core.createWorkFromDefinition({definitionId:published.id,inputs:{customer:'新客户',market:'新市场'},referenceExampleIds:[],commandId:randomUUID()});
    f.observe('user.prompt','已更换长期要求');
    assert.deepEqual(f.core.definitions.get(published.id),published);
    const manual=f.core.definitions.revise({definitionId:published.id,commandId:randomUUID()});
    assert.equal(sourceReview(f.core.definitions,manual).changes.length,0,'confirmed baseline evidence is historical by design');
    assert.equal(f.core.getWork(instance.instance.id)!.definition.id,published.id);
  } finally { f.core.close(); }
});
