import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID as id } from 'node:crypto';
import { makeService } from '../helpers/app-options.ts';
import { WorkPetMcpHandler } from '../../dist/bridge/mcp-handler.js';
import { skillContent, skillBasis } from '../../scripts/lib/skill-fixture.mjs';
function setup() {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'worket-receipts-')), 'work.sqlite');
  let fail = false;
  const open = () => makeService({ databasePath, launcher: { async openNewConversation() { if (fail) throw new Error('LAUNCH_FAILED'); } }, codex: { async listRecentThreads() { return []; }, async readThread() { throw new Error('unused'); }, close() {} } });
  const app = open(), core = app.core(), content = structuredClone(skillContent); content.materialRoles = []; content.methods = [];
  const draft = core.definitions.saveDraft({ id: id(), revision: 1, content, originalContent: structuredClone(content), refs: [], issues: [], resolutions: [] });
  core.definitions.db.prepare('INSERT INTO review_events VALUES (?,?,?)').run(skillBasis.reviewEventId, draft.id, JSON.stringify({ type: 'QA_BASELINE', content }));
  const definition = core.definitions.publish({ draftId: draft.id, expectedRevision: 1, materialBindings: {}, commandId: id() });
  const work = core.createWorkFromDefinition({ definitionId: definition.id, inputs: { subject: '合成接力' }, referenceExampleIds: [], commandId: id() });
  const mcp = new WorkPetMcpHandler(core);
  const read = (deliveryId?: string) => mcp.handle({ id: id(), method: 'tools/call', params: { name: 'get_work_context', arguments: { work_id: work.instance.id, ...(deliveryId ? { delivery_id: deliveryId } : {}) } } }) as any;
  const bind = (deliveryId: string, session: string) => app.syncHook('workbuddy', { hook_event_name: 'UserPromptSubmit', session_id: session, prompt: `[WORKPET:${work.instance.id}]\n[DELIVERY:${deliveryId}]`, turn_id: id() });
  const begin = async () => { await app.handoff(work.instance.id, 'workbuddy'); return core.getWork(work.instance.id)!.packageDeliveryId!; };
  return { app, core, work, read, bind, begin, open, fail: () => { fail = true; }, status: () => app.dashboard(work.instance.id).selectedWork!.captureStatus };
}
test('each delivery requires its own read; current read before Hook survives binding and restart', async () => {
  const f = setup(); let closed = false;
  try {
    const first = await f.begin(); assert.ok(first); assert.equal(f.status(), 'waiting');
    assert.equal(JSON.parse((await f.read()).result.content[0].text).deliveryReceipt.acknowledged, false);
    assert.equal(f.core.getWork(f.work.instance.id)!.packageReadAt, null);
    assert.equal(JSON.parse((await f.read(first)).result.content[0].text).deliveryReceipt.acknowledged, true);
    assert.equal(f.status(), 'waiting'); await f.bind(first, 'first-session'); assert.equal(f.status(), 'recording');
    const second = await f.begin(); assert.notEqual(first, second); await f.bind(second, 'second-session');
    assert.equal(f.status(), 'waiting', 'previous read cannot qualify a new target');
    assert.match((await f.read(first)).error.message, /DELIVERY_MISMATCH/); await f.read(); assert.equal(f.status(), 'waiting');
    await f.read(second); assert.equal(f.status(), 'recording');
    assert.notEqual(f.core.getLatestHandoffPackage(f.work.instance.id)!.id, second, 'fresh context snapshots do not replace delivery identity');
    f.app.close(); closed = true; const reopened = f.open(); try { assert.equal(reopened.dashboard(f.work.instance.id).selectedWork!.captureStatus, 'recording'); } finally { reopened.close(); }
  } finally { if (!closed) f.app.close(); }
});
test('cancel and failed launch restore the same conversation proof without lending it to a new delivery', async () => {
  const f = setup();
  try {
    const first = await f.begin(); await f.bind(first, 'original'); await f.read(first);
    const cancelled = await f.begin(); f.app.cancelHandoff(f.work.instance.id, '已确认未接手');
    assert.equal(f.status(), 'recording'); assert.equal(f.core.getWork(f.work.instance.id)!.activeBinding!.conversationId, 'original');
    assert.match((await f.read(cancelled)).error.message, /DELIVERY_MISMATCH/);
    f.fail(); await assert.rejects(f.begin(), /LAUNCH_FAILED/);
    assert.equal(f.status(), 'recording'); assert.equal(f.core.getWork(f.work.instance.id)!.packageDeliveryId, first);
    f.core.deleteWorkPermanently(f.work.instance.id, { confirmation: f.work.instance.id });
    assert.equal(f.core.definitions.db.prepare('SELECT count(*) n FROM work_package_receipts').get()!.n, 0);
  } finally { f.app.close(); }
});

test('pre-upgrade pending delivery restores correlation but never trusts a global read flag', async () => {
  const f = setup(); let closed = false;
  try {
    const deliveryId = await f.begin();
    f.core.definitions.db.prepare("INSERT INTO pending_dispatches VALUES (?,?,'WAITING','legacy-read')").run(f.work.instance.id, id());
    f.core.definitions.db.exec('DROP TABLE work_package_receipts');
    f.app.close(); closed = true;
    const app = f.open();
    try {
      const work = app.core().getWork(f.work.instance.id)!;
      assert.equal(work.packageDeliveryId, deliveryId); assert.equal(work.packageReadAt, null);
      const response: any = await new WorkPetMcpHandler(app.core()).handle({ id: id(), method: 'tools/call', params: { name: 'get_work_context', arguments: { work_id: work.instance.id, delivery_id: deliveryId } } });
      assert.ok(!response.error); assert.ok(app.core().getWork(work.instance.id)!.packageReadAt);
      assert.equal(app.dashboard(work.instance.id).selectedWork!.captureStatus, 'waiting', 'Hook still required');
    } finally { app.close(); }
  } finally { if (!closed) f.app.close(); }
});
