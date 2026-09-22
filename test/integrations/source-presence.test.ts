import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { makeService } from '../helpers/app-options.ts';
import { normalizeCodexThread } from '../../dist/adapters/codex/normalize.js';
import { currentSourceEvents } from '../../dist/core/source-revisions.js';
import { DistillationService } from '../../dist/distillation/service.js';
import { FixtureClient } from '../distillation/fixtures.ts';
import { skillContent, skillBasis } from '../../scripts/lib/skill-fixture.mjs';
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'worket-presence-'));
  const raw: any = { id: 'presence', name: '来源存在性', cwd: directory, createdAt: 1, updatedAt: 2, turns: [{ id: 'turn', status: 'completed', items: [{ id: 'u', type: 'userMessage', content: [{ type: 'text', text: '每次必须保留来源链接。' }] }, { id: 'a', type: 'agentMessage', text: '已完成来源核对。' }] }] };
  let complete = true, fail = false;
  const options = { databasePath: join(directory, 'work.sqlite'), codex: { async listRecentThreads() { return []; }, async readThread() { if (fail) throw new Error('read failure'); return { ...normalizeCodexThread(raw), ...(complete ? { history: { complete: true, observedExternalIds: normalizeCodexThread(raw, true).events.map(e => e.externalId) } } : {}) }; }, close() {} } };
  return { directory, raw, open: () => makeService(options), complete: (value: boolean) => { complete = value; }, fail: (value: boolean) => { fail = value; } };
}
test('two complete reads mark current absence, keep immutable evidence/contract, and restoration survives restart', async () => {
  const f = fixture(); let app = f.open();
  try {
    const id = (await app.createWorkFromConversation({ executorId: 'codex', threadId: 'presence', allowCloudExtraction: false })).selectedWorkId!;
    const core = app.core(), original = structuredClone(core.getWork(id)!.sourceArchive), handoff = core.createHandoffPackage(id);
    const content = structuredClone(skillContent); content.materialRoles = []; content.methods = [];
    const draft = core.definitions.saveDraft({ id: randomUUID(), revision: 1, content, originalContent: content, refs: [], issues: [], resolutions: [] });
    core.definitions.db.prepare('INSERT INTO review_events VALUES (?,?,?)').run(skillBasis.reviewEventId, draft.id, JSON.stringify({ type: 'QA_BASELINE', content }));
    const definition = core.definitions.publish({ draftId: draft.id, expectedRevision: 1, materialBindings: {}, commandId: randomUUID() });
    const instance = core.createWorkFromDefinition({ definitionId: definition.id, inputs: { subject: '新主题' }, referenceExampleIds: [], commandId: randomUUID() });
    const oldContract = JSON.stringify(core.definitions.get(definition.id));
    const removed = f.raw.turns; f.raw.turns = [];
    await app.syncRecordedWorks(); assert.ok(core.getWork(id)!.state.constraints.length);
    assert.throws(() => core.createHandoffPackage(id), /SOURCE_CHECK_PENDING/);
    const pendingService = new DistillationService(core, new FixtureClient());
    assert.throws(() => pendingService.prepare({ workIds: [id], includedFileIds: [] }), /SOURCE_CHECK_PENDING/);
    pendingService.close();
    await app.syncRecordedWorks(); let work = core.getWork(id)!;
    assert.equal(work.state.constraints.length, 0); assert.equal(work.state.completedActions.length, 0);
    assert.deepEqual(work.sourceArchive.slice(0, original.length), original);
    assert.ok(work.sourceArchive.some(e => e.kind === 'source.absent'));
    assert.equal(work.handoffPackages.find(h => h.id === handoff.id)!.state.constraints.length, 1);
    assert.equal(JSON.stringify(core.definitions.get(definition.id)), oldContract);
    assert.equal(core.getWork(instance.instance.id)!.definition.id, definition.id);
    const service = new DistillationService(core, new FixtureClient());
    const snapshot = service.prepare({ workIds: [id], includedFileIds: [] });
    assert.ok(!snapshot.sources[0].events.some(e => e.content.includes('保留来源链接')));
    assert.ok(core.createHandoffPackage(id).sourceNotice);
    const count = work.sourceArchive.length; await app.syncRecordedWorks(); assert.equal(core.getWork(id)!.sourceArchive.length, count);
    service.close(); app.close(); app = f.open();
    assert.equal(app.core().getWork(id)!.state.constraints.length, 0);
    f.raw.turns = removed; await app.syncRecordedWorks(); work = app.core().getWork(id)!;
    assert.equal(work.state.constraints.length, 1); assert.equal(app.dashboard(id).selectedWork!.sourceNotice, undefined);
    assert.equal(currentSourceEvents(work.sourceArchive).filter(e => e.kind === 'user.prompt').length, 1);
  } finally { app.close(); rmSync(f.directory, { recursive: true, force: true }); }
});
test('failure, incomplete history and restart reset absence confirmation; live IDs prevent false disappearance', async () => {
  const f = fixture(); let app = f.open();
  try {
    const id = (await app.createWorkFromConversation({ executorId: 'codex', threadId: 'presence', allowCloudExtraction: false })).selectedWorkId!;
    f.raw.turns[0].status = 'inProgress'; await app.syncRecordedWorks(); await app.syncRecordedWorks();
    assert.equal(app.core().getWork(id)!.state.completedActions.length, 1, 'live but unarchivable content is not absent');
    f.raw.turns = []; await app.syncRecordedWorks();
    f.fail(true); await app.syncRecordedWorks(); f.fail(false); await app.syncRecordedWorks();
    assert.equal(app.core().getWork(id)!.state.constraints.length, 1);
    f.complete(false); await app.syncRecordedWorks(); f.complete(true); await app.syncRecordedWorks();
    assert.equal(app.core().getWork(id)!.state.constraints.length, 1);
    app.close(); app = f.open(); await app.syncRecordedWorks();
    assert.equal(app.core().getWork(id)!.state.constraints.length, 1);
    await app.syncRecordedWorks(); assert.equal(app.core().getWork(id)!.state.constraints.length, 0);
  } finally { app.close(); rmSync(f.directory, { recursive: true, force: true }); }
});
test('rollback before an explicitly selected message does not import earlier history; user can select a new range', async () => {
  const f = fixture(), app = f.open();
  try {
    f.raw.turns.unshift({ id: 'earlier', status: 'completed', items: [{ id: 'before', type: 'userMessage', content: [{ type: 'text', text: '不能自动纳入所选起点之前的历史。' }] }] });
    const id = (await app.createWorkFromConversation({ executorId: 'codex', threadId: 'presence', allowCloudExtraction: false })).selectedWorkId!;
    const split = await app.createWorkFromMessage({ sourceWorkId: id, startExternalId: 'u:text-0' });
    const newId = split.selectedWorkId!; f.raw.turns.pop();
    await app.syncRecordedWorks(); await app.syncRecordedWorks();
    assert.ok(!currentSourceEvents(app.core().getWork(newId)!.sourceArchive).some(e => e.content?.includes('起点之前')));
    assert.match(app.dashboard(newId).selectedWork!.sourceNotice!, /重新选择范围/);
    const points = await app.listSplitPoints(newId); assert.equal(points[0].externalId, 'before:text-0');
    const reset = await app.createWorkFromMessage({ sourceWorkId: newId, startExternalId: points[0].externalId });
    assert.notEqual(reset.selectedWorkId, newId); assert.ok(reset.selectedWork!.state.constraints.some(i => i.text.includes('起点之前')));
  } finally { app.close(); rmSync(f.directory, { recursive: true, force: true }); }
});
