import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as id } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorkCore } from '../../dist/core/index.js';
import { DistillationService } from '../../dist/distillation/service.js';
import { source, FixtureClient } from './fixtures.ts';

test('deleting an unused contract removes all versions and revision drafts, requires explicit confirmation and preserves the source work', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'worket-contract-delete-'));
  const core = createWorkCore({ databasePath: join(directory, 'work.sqlite') });
  const service = new DistillationService(core, new FixtureClient() as any);
  try {
    const original = source(core), r = core.definitions;
    const snapshot = service.prepare({ workIds: [original.instance.id], includedFileIds: [] });
    const job = service.start({ preparationId: snapshot.id, expectedContentHash: snapshot.contentHash, consentVersion: 'worket-data-v1', commandId: id() });
    await new Promise(resolve => setImmediate(resolve));
    const ready = await service.get(job.id);
    const first = r.publish({ draftId: ready.draftId!, expectedRevision: 1, materialBindings: {}, commandId: id() });
    const originalHash = first.contentHash;
    assert.equal(r.setCategory({ definitionKey: first.definitionKey, category: '市场调研' }), '市场调研');
    assert.equal(r.get(first.id).category, '市场调研');
    assert.equal(r.get(first.id).contentHash, originalHash);
    const draft = r.revise({ definitionId: first.id, commandId: id() });
    draft.content.deliverables[0]!.text = '附来源清单的竞品对比表';
    const saved = r.update({ draftId: draft.id, expectedRevision: draft.revision, content: draft.content, issueResolutions: [] });
    const second = r.publish({ draftId: draft.id, expectedRevision: saved.revision, materialBindings: {}, commandId: id() });
    assert.deepEqual(r.versions(first.definitionKey).map(version => version.category), ['市场调研', '市场调研']);
    const pending = r.revise({ definitionId: second.id, commandId: id() });
    assert.throws(() => r.delete({ definitionKey: first.definitionKey, confirmation: '删除', commandId: id() }), /CONFIRMATION_REQUIRED/);
    assert.equal(r.versions(first.definitionKey).length, 2);
    const command = { definitionKey: first.definitionKey, confirmation: '永久删除', commandId: id() };
    r.delete(command); r.delete(command);
    assert.equal(r.versions(first.definitionKey).length, 0);
    assert.equal(r.db.prepare('SELECT category FROM definition_categories WHERE definition_key=?').get(first.definitionKey), undefined);
    assert.throws(() => r.read('definition_drafts', pending.id), /NOT_FOUND/);
    assert.ok(core.getWork(original.instance.id));
    assert.deepEqual(core.getWork(original.instance.id)?.sourceEvents, original.sourceEvents);
  } finally { service.close(); core.close(); rmSync(directory, { recursive: true, force: true }); }
});
