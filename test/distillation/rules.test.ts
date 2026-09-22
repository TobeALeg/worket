import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, unlinkSync, renameSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorkCore } from '../../dist/core/index.js';
import { DistillationService } from '../../dist/distillation/service.js';
import { effectiveRules, clauseText, acceptanceChecks } from '../../dist/contracts/rules.js';
import { validateContent, validateResult } from '../../dist/contracts/definition.js';
import { hash } from '../../dist/definitions/storage.js';
import { buildWorkPackage, packageMarkdown } from '../../dist/definitions/work-package.js';
import { previewDocumentRevision, adoptDocumentRevision } from '../../dist/definitions/document-revision.js';
import { source, FixtureClient, result } from './fixtures.ts';
const id = () => randomUUID();
const policy = () => ({ scope: 'REUSABLE', status: 'ACTIVE' });
const item = (key: string, text: string, relation?: any) => ({ key, text, basis: { type: 'INFERRED', refs: [], rationale: 'test' }, rule: { ...policy(), ...(relation ? { relation } : {}) } });
function content() {
  const c = result({ sources: [{ key: 'w', events: [{ key: 'e' }] }] }).content;
  c.constraints = [item('limit', '每个平台文案不超过 50 words')];
  return c;
}

test('cross-field duplicates share one effective rule; supplementation preserves independent detail', () => {
  const c = content();
  c.acceptanceCriteria = [item('copy', '每个平台最多五十个英文单词', { kind: 'DUPLICATE', target: 'constraints.limit' })];
  c.constraints.push(item('language', '文案使用英文', { kind: 'SUPPLEMENTS', target: 'constraints.limit' }));
  const view = effectiveRules(c);
  assert.equal(view.content.constraints.length, 2);
  assert.equal(view.content.acceptanceCriteria.length, 0);
  assert.equal(view.omitted[0].retained, 'constraints.limit');
  assert.equal(c.acceptanceCriteria.length, 1, 'source must remain immutable');
  assert.deepEqual(acceptanceChecks(c).map(i => i.rule), ['constraints.limit']);
  assert.match(acceptanceChecks(c, [{ target: 'constraints.limit', text: '本次 80 words' }])[0].text, /80/);
});
test('replacement is distinct from duplicate and only instance override changes new instance view', () => {
  const c = content(); c.constraints[0].text = '不超过 120 words';
  c.constraints.push(item('newLimit', '不超过 50 words', { kind: 'REPLACES', target: 'constraints.limit' }));
  c.constraints.push({ ...item('oldTime', '48 秒修正'), rule: { scope: 'INSTANCE', status: 'ACTIVE' } });
  c.constraints.push({ ...item('proposal', '所有视频必须蓝色'), rule: { scope: 'REUSABLE', status: 'PROPOSED' } });
  const baseline = effectiveRules(c);
  const changed = effectiveRules(c, [{ target: 'constraints.newLimit', text: '本次不超过 80 words' }]);
  assert.deepEqual(baseline.content.constraints.map(i => i.text), ['不超过 50 words']);
  assert.deepEqual(changed.content.constraints.map(i => i.text), ['本次不超过 80 words']);
  assert.equal(effectiveRules(c).content.constraints[0].text, '不超过 50 words');
});
test('cycles, missing keep targets, cross-condition deletion, and competing replacements fail explicitly', () => {
  let c = content(); c.constraints[0].rule.relation = { kind: 'DUPLICATE', target: 'constraints.missing' };
  assert.throws(() => effectiveRules(c), /INVALID_RULE_TARGET/);
  c = content(); c.constraints.push(item('two', '50 words', { kind: 'DUPLICATE', target: 'constraints.limit' }));
  c.constraints[0].rule.relation = { kind: 'DUPLICATE', target: 'constraints.two' };
  assert.throws(() => effectiveRules(c), /RULE_CYCLE/);
  c = content(); c.constraints.push({ ...item('two', '50 words', { kind: 'DUPLICATE', target: 'constraints.limit' }), rule: { ...policy(), condition: 'TikTok', relation: { kind: 'DUPLICATE', target: 'constraints.limit' } } });
  assert.throws(() => effectiveRules(c), /RULE_SCOPE_MISMATCH/);
  c = content(); c.constraints.push(item('one', '30 words', { kind: 'REPLACES', target: 'constraints.limit' }), item('two', '80 words', { kind: 'REPLACES', target: 'constraints.limit' }));
  assert.throws(() => effectiveRules(c), /UNRESOLVED_RULE_CONFLICT/);
  c = content(); c.constraints[0].rule.status = 'RETIRED'; c.constraints.push(item('two', '50 words', { kind: 'DUPLICATE', target: 'constraints.limit' }));
  assert.throws(() => effectiveRules(c), /INVALID_RULE_TARGET/);
});

async function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'worket-rule-'));
  const core = createWorkCore({ databasePath: join(directory, 'work.sqlite') });
  const work = source(core, '以后每个平台文案不超过 50 words。FRAME.md 是已确认的制作规范。');
  const text = '# 制作规范\n## 文案\n每个平台文案不超过 50 words。\n## 参考\n曾经使用蓝色背景。\n';
  const path = join(directory, 'FRAME.md'); writeFileSync(path, text);
  const file = core.addArtifactRef(work.instance.id, { path, filename: 'FRAME.md', role: 'REFERENCE', mimeType: 'text/markdown', size: Buffer.byteLength(text), sha256: hash(text), lastModifiedAt: new Date().toISOString(), availability: 'AVAILABLE' }).artifactRefs.at(-1)!;
  const client = new FixtureClient(), service = new DistillationService(core, client);
  const snapshot = service.prepare({ workIds: [work.instance.id], includedFileIds: [file.id], fileRoles: { [file.id]: 'NORMATIVE' } });
  const request = service.wire(snapshot);
  const response = result(request);
  const e = request.sources[0].events.find(e => e.kind === 'file.content')!;
  response.content.constraints = [{ key: 'limit', text: '每个平台文案不超过 50 words。', rule: policy(), document: { source: { snapshotId: 'wire', workId: 'work-1', eventId: e.key }, hash: e.hash, name: 'FRAME.md', startLine: 3, endLine: 3 }, basis: { type: 'SOURCE', origin: 'DOCUMENT_STATED', refs: [{ snapshotId: 'wire', workId: 'work-1', eventId: e.key }] } },
    { ...item('duplicate', '每个平台最多五十词', { kind: 'DUPLICATE', target: 'constraints.limit' }), basis: structuredClone(response.content.purpose.basis) }];
  response.content.acceptanceCriteria = [item('review', '检查文案是否满足规范')];
  client.get = async () => ({ requestId: client.latest.requestId, status: 'SUCCEEDED', result: response });
  const job = service.start({ preparationId: snapshot.id, expectedContentHash: snapshot.contentHash, consentVersion: 'worket-data-v1', commandId: id() });
  await new Promise(r => setImmediate(r));
  const done = await service.get(job.id);
  assert.equal(done.status, 'AWAITING_REVIEW', done.error);
  const draft = core.definitions.read<any>('definition_drafts', done.draftId!);
  const publish = (d = draft) => core.definitions.publish({ draftId: d.id, expectedRevision: d.revision, materialBindings: {}, commandId: id() });
  const create = (definition: any, ruleOverrides: any[] = []) => core.createWorkFromDefinition({ definitionId: definition.id, inputs: { customer: '客户乙', market: '新市场' }, referenceExampleIds: [], ruleOverrides, commandId: id() });
  return { directory, core, service, snapshot, request, response, path, text, draft, publish, create };
}

test('actual snapshot → local draft → published definition → instance → handoff uses frozen clauses once', async () => {
  const f = await setup();
  try {
    f.draft.content.acceptanceCriteria = [];
    f.core.definitions.write('definition_drafts', f.draft);
    const definition = f.publish();
    const moved = join(f.directory, 'renamed.md'); renameSync(f.path, moved); unlinkSync(moved);
    const work = f.create(definition);
    const pkg = buildWorkPackage(work, f.core.definitions), md = packageMarkdown(pkg);
    assert.equal(pkg.definition.content.constraints.length, 1);
    assert.equal((md.match(/每个平台文案不超过 50 words。/g) ?? []).length, 1);
    assert.ok(!md.includes('曾经使用蓝色'));
    assert.equal(pkg.ruleSources[0].hash, hash(f.text));
    assert.equal(pkg.fixedMaterials.length, 0, 'normative text is inline, not a broken local link');
    assert.ok(pkg.acceptanceChecks.some(c => c.rule === 'constraints.limit'), 'deduplication must preserve actual acceptance checks');
    assert.ok(f.core.createHandoffPackage(work.instance.id).workPackage.ruleSources.length);
    const changed = buildWorkPackage(f.create(definition, [{ target: 'constraints.limit', text: '本次不超过 80 words' }]), f.core.definitions);
    assert.equal(changed.definition.content.constraints[0].text, '本次不超过 80 words');
    assert.equal(changed.ruleSources.length, 0, 'old clause is not sent as a second instruction');
    assert.equal(buildWorkPackage(f.create(definition), f.core.definitions).definition.content.constraints[0].text, '每个平台文案不超过 50 words。');
  } finally { f.core.close(); }
});

test('previewed file update publishes v2, old instance remains v1, tampering and invalid selectors block', async () => {
  const f = await setup();
  try {
    const v1 = f.publish(), first = f.create(v1);
    let draft = f.core.definitions.revise({ definitionId: v1.id, commandId: id() });
    writeFileSync(f.path, '# 制作规范\n## 文案\n每个平台文案不超过 30 words。\n');
    const preview = previewDocumentRevision(f.core.definitions, { draftId: draft.id, address: 'constraints.limit', path: f.path });
    assert.equal(preview.changed, true);
    assert.throws(() => adoptDocumentRevision(f.core.definitions, { draftId: draft.id, expectedRevision: draft.revision, address: 'constraints.limit', path: f.path, expectedHash: 'stale', startLine: 3, endLine: 3 }), /SOURCE_CHANGED/);
    assert.throws(() => adoptDocumentRevision(f.core.definitions, { draftId: draft.id, expectedRevision: draft.revision, address: 'constraints.limit', path: f.path, expectedHash: preview.hash, startLine: 3, endLine: 999 }), /INVALID_SOURCE_REF/);
    draft = adoptDocumentRevision(f.core.definitions, { draftId: draft.id, expectedRevision: draft.revision, address: 'constraints.limit', path: f.path, expectedHash: preview.hash, startLine: 3, endLine: 3 });
    assert.throws(() => f.publish(draft), /UNRESOLVED_ISSUES/);
    assert.equal(draft.content.constraints[1].rule.status, 'PROPOSED');
    // The old 50-word duplicate no longer supports the new 30-word clause.
    const reconciled = structuredClone(draft.content); reconciled.constraints = reconciled.constraints.filter(i => i.key !== 'duplicate');
    draft = f.core.definitions.update({ draftId: draft.id, expectedRevision: draft.revision, content: reconciled, issueResolutions: draft.issues.map(i => ({ issueId: i.id, action: 'DELETE', explanation: '旧重复条目不再支持新规则' })) });
    const v2 = f.publish(draft);
    assert.equal(v2.version, 2);
    assert.equal(buildWorkPackage(first, f.core.definitions).definition.content.constraints[0].text, '每个平台文案不超过 50 words。');
    assert.equal(buildWorkPackage(f.create(v2), f.core.definitions).definition.content.constraints[0].text, '每个平台文案不超过 30 words。');
    const material = v2.materials.find(m => m.role.startsWith('document:'))!;
    writeFileSync(material.path, 'corrupt');
    assert.throws(() => f.create(v2), /MATERIAL_MISSING/);
  } finally { f.core.close(); }
});

test('metadata/reference/input cannot masquerade as adopted normative text; file ranges are checked', async () => {
  const f = await setup();
  try {
    for (const role of ['REFERENCE', 'INPUT']) {
      const r = structuredClone(f.request); r.sources[0].events.find(e => e.kind === 'file.content').document.role = role;
      assert.throws(() => validateResult(f.response, r), /INVALID_SOURCE_REF/);
    }
    const r = structuredClone(f.request); r.sources[0].events.find(e => e.kind === 'file.content').kind = 'file.metadata';
    assert.throws(() => validateResult(f.response, r), /INVALID_SOURCE_REF/);
    const output = structuredClone(f.response); output.content.constraints[0].document.endLine = 999;
    assert.throws(() => validateResult(output, f.request), /INVALID_SOURCE_REF/);
    const v = f.publish(); unlinkSync(v.materials[0].path);
    assert.throws(() => f.create(v), /MATERIAL_MISSING/);
  } finally { f.core.close(); }
});

test('editing a document-derived rule explicitly detaches the old clause rather than reverting the edit', async () => {
  const f = await setup();
  try {
    const content = structuredClone(f.draft.content); content.constraints[0].text = '今后不超过 40 words';
    const draft = f.core.definitions.update({ draftId: f.draft.id, expectedRevision: f.draft.revision, content, issueResolutions: [] });
    assert.equal(draft.content.constraints[0].document, undefined);
    const pkg = buildWorkPackage(f.create(f.publish(draft)), f.core.definitions);
    assert.equal(pkg.definition.content.constraints[0].text, '今后不超过 40 words');
  } finally { f.core.close(); }
});
