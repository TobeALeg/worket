import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeService } from '../helpers/app-options.ts';
import { normalizeCodexThread } from '../../dist/adapters/codex/normalize.js';
import { currentSourceEvents, sourceIdentity } from '../../dist/core/source-revisions.js';
import { DistillationService } from '../../dist/distillation/service.js';
import { FixtureClient } from '../distillation/fixtures.ts';
import { LocalRuleExtractor } from '../../dist/extractor/local-rule-extractor.js';
import { sourceFixture, finishSource, reviseSource } from '../../scripts/lib/source-revision-fixture.mjs';
function setup(legacy = false) {
  const directory = mkdtempSync(join(tmpdir(), 'worket-source-revisions-')), payload = sourceFixture(directory);
  if (legacy) delete payload.turns[0].status; // Old producer captured a reply before completion.
  const options = { databasePath: join(directory, 'work.sqlite'), codex: { async listRecentThreads() { return []; }, async readThread() { return normalizeCodexThread(payload); }, close() {} } };
  return { directory, payload, open: () => makeService(options) };
}
test('streaming content waits, terminal content arrives once, and failed/interrupted terminal turns remain observable', async () => {
  const f = setup(), app = f.open();
  try {
    const id = (await app.createWorkFromConversation({ executorId: 'codex', threadId: f.payload.id, allowCloudExtraction: false })).selectedWorkId!;
    assert.equal(app.dashboard(id).selectedWork!.latestActivity, undefined);
    assert.equal(app.core().getWork(id)!.sourceArchive.some(e => e.kind === 'tool.call'), false);
    finishSource(f.payload); await app.syncRecordedWorks();
    const work = app.core().getWork(id)!;
    assert.equal(app.dashboard(id).selectedWork!.latestActivity!.text, f.payload.turns[0].items[1].text);
    assert.equal(work.sourceArchive.find(e => e.kind === 'tool.call')!.metadata.exitCode, 0);
    await app.syncRecordedWorks(); assert.equal(app.core().getWork(id)!.sourceArchive.length, work.sourceArchive.length);
    for (const status of ['failed', 'interrupted']) { f.payload.turns[0].status = status; assert.ok(normalizeCodexThread(f.payload).events.some(e => e.kind === 'agent.response')); }
  } finally { app.close(); rmSync(f.directory, { recursive: true, force: true }); }
});
test('legacy partial content is revised without overwriting history; extraction order, snapshots, retries and restart use latest evidence', async t => {
  const f = setup(true); let app = f.open();
  try {
    const id = (await app.createWorkFromConversation({ executorId: 'codex', threadId: f.payload.id, allowCloudExtraction: false })).selectedWorkId!;
    const original = structuredClone(app.core().getWork(id)!);
    const oldHandoff = app.core().createHandoffPackage(id);
    const service = new DistillationService(app.core(), new FixtureClient());
    const prepared = service.prepare({ workIds: [id], includedFileIds: [] });
    finishSource(f.payload); await app.syncRecordedWorks();
    let work = app.core().getWork(id)!;
    assert.deepEqual(work.sourceArchive.slice(0, original.sourceArchive.length), original.sourceArchive);
    assert.equal(work.handoffPackages.find(h => h.id === oldHandoff.id)!.state.completedActions[0].text, '已完成');
    assert.equal(work.state.completedActions.some(i => i.text === '已完成'), false);
    assert.ok(work.state.pendingActions.some(i => i.text === '请核对来源。'));
    assert.throws(() => service.assertSources(prepared, true), /SOURCE_CHANGED/);
    const newSnapshot = service.prepare({ workIds: [id], includedFileIds: [] });
    assert.equal(newSnapshot.sources[0].events.some(e => e.content === '已完成'), false);
    assert.ok(currentSourceEvents(work.sourceArchive).some(e => e.kind === 'tool.call' && e.metadata.exitCode === 0));
    // Fail state derivation after a source edit; current reads must hide stale derived claims immediately.
    const originalExtract = LocalRuleExtractor.prototype.extract; let fail = true;
    t.mock.method(LocalRuleExtractor.prototype, 'extract', async function(input) { if (fail) throw new Error('synthetic extraction interruption'); return originalExtract.call(this, input); });
    reviseSource(f.payload); await app.syncRecordedWorks();
    work = app.core().getWork(id)!;
    assert.equal(work.state.constraints.some(i => i.text === '每次报告必须包含来源链接。'), false);
    assert.equal(work.state.pendingActions.some(i => i.text === '请核对来源。'), false);
    app.close(); app = f.open(); fail = false; await app.syncRecordedWorks();
    work = app.core().getWork(id)!;
    assert.ok(work.state.constraints.some(i => i.text.includes('发布日期')));
    assert.ok(work.state.pendingActions.some(i => i.text === '确认日期后交付。'));
    const current = currentSourceEvents(work.sourceArchive);
    assert.ok(current.findIndex(e => e.kind === 'user.prompt') < current.findIndex(e => e.kind === 'agent.response'), 'edited prompt stays at its original logical position');
    const before = work.sourceArchive.length; await app.syncRecordedWorks(); assert.equal(app.core().getWork(id)!.sourceArchive.length, before);
    // A->B->A is a new observation, not a duplicate of the first A.
    f.payload.turns[0].items[1].text = '已完成报告。下一步：请核对来源。'; await app.syncRecordedWorks();
    assert.equal(app.core().getWork(id)!.sourceArchive.length, before + 1);
    assert.equal(app.dashboard(id).selectedWork!.latestActivity!.text, f.payload.turns[0].items[1].text);
    service.close();
  } finally { app.close(); rmSync(f.directory, { recursive: true, force: true }); }
});
test('equal external IDs in another conversation do not collide, and same-source manual edits remain authoritative', async () => {
  const f = setup(); finishSource(f.payload); const app = f.open();
  try {
    const id = (await app.createWorkFromConversation({ executorId: 'codex', threadId: f.payload.id, allowCloudExtraction: false })).selectedWorkId!;
    const state = structuredClone(app.core().getWork(id)!.state), edited = state.constraints[0];
    edited.origin = 'USER_EDITED'; edited.originalText = edited.text; edited.text = '用户手动确认的规则';
    app.core().definitions.db.prepare('UPDATE work_records SET state_json=? WHERE work_instance_id=?').run(JSON.stringify(state), id);
    reviseSource(f.payload); await app.syncRecordedWorks();
    assert.deepEqual(app.core().getWork(id)!.state.constraints.map(i => i.text), ['用户手动确认的规则']);
    f.payload.id = 'different-source';
    app.core().startExecutionEpisode(id, { executor: { type: 'AGENT', name: 'Codex' }, environment: { type: 'CODEX_DESKTOP', name: 'Codex' }, source: { adapter: 'codex', conversationId: f.payload.id }, endCurrentEpisode: true });
    await app.syncRecordedWorks(); const work = app.core().getWork(id)!;
    const prompts = currentSourceEvents(work.sourceArchive).filter(e => e.kind === 'user.prompt');
    assert.equal(prompts.length, 2); assert.notEqual(prompts[0].externalId, prompts[1].externalId);
    assert.ok(prompts.some(e => sourceIdentity(e)?.conversationId === 'different-source'));
    const before = work.sourceArchive.length; await app.syncRecordedWorks(); assert.equal(app.core().getWork(id)!.sourceArchive.length, before);
  } finally { app.close(); rmSync(f.directory, { recursive: true, force: true }); }
});
test('split picker exposes the current message and resolves its revision back to the source application ID', async () => {
  const f = setup(); finishSource(f.payload); const app = f.open();
  try {
    const id = (await app.createWorkFromConversation({ executorId: 'codex', threadId: f.payload.id, allowCloudExtraction: false })).selectedWorkId!;
    const oldPoint = (await app.listSplitPoints(id))[0];
    reviseSource(f.payload); await app.syncRecordedWorks();
    const points = await app.listSplitPoints(id);
    assert.equal(points.length, 1); assert.match(points[0].label, /发布日期/); assert.notEqual(points[0].externalId, oldPoint.externalId);
    await assert.rejects(app.createWorkFromMessage({ sourceWorkId: id, startExternalId: oldPoint.externalId }), /已改变/);
    const split = await app.createWorkFromMessage({ sourceWorkId: id, startExternalId: points[0].externalId });
    assert.notEqual(split.selectedWorkId, id);
    assert.ok(split.selectedWork!.state.constraints.some(i => i.text.includes('发布日期')));
    assert.ok(app.core().getWork(split.selectedWorkId!)!.sourceArchive.some(e => e.externalId === 'user-1:text-0'));
  } finally { app.close(); rmSync(f.directory, { recursive: true, force: true }); }
});
