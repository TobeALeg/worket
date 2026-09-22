import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID as id } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, unlinkSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { createWorkCore } from '../../dist/core/index.js';
import { buildWorkPackage } from '../../dist/definitions/work-package.js';
import { hash } from '../../dist/definitions/storage.js';
import { currentSourceEvents } from '../../dist/core/source-revisions.js';
import { skillContent, skillBasis } from '../../scripts/lib/skill-fixture.mjs';
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'worket-instance-files-'));
  const core = createWorkCore({ databasePath: join(directory, 'work.sqlite') });
  const content = structuredClone(skillContent); content.methods = []; content.materialRoles = [];
  content.inputs.push({ key: 'script', text: '本次脚本', valueType: 'FILE', required: true, basis: skillBasis });
  const draft = core.definitions.saveDraft({ id: id(), revision: 1, content, originalContent: structuredClone(content), refs: [], issues: [], resolutions: [] });
  core.definitions.db.prepare('INSERT INTO review_events VALUES (?,?,?)').run(skillBasis.reviewEventId, draft.id, JSON.stringify({ type: 'QA_BASELINE', content }));
  const definition = core.definitions.publish({ draftId: draft.id, expectedRevision: 1, materialBindings: {}, commandId: id() });
  const path = join(directory, 'SCRIPT.md'); writeFileSync(path, '第一期');
  const create = (references: string[] = []) => core.createWorkFromDefinition({ definitionId: definition.id, inputs: { subject: id(), script: path }, referenceExampleIds: references, commandId: id() });
  const pkg = (workId: string) => buildWorkPackage(core.getWork(workId)!, core.definitions);
  return { core, directory, definition, path, create, pkg };
}
test('连续实例固定各自文件，原文件覆盖删除及另一实例删除不改变旧输入', () => {
  const f = setup(); try {
    const first = f.create(), old = f.pkg(first.instance.id);
    writeFileSync(f.path, '第二期'); const second = f.create(); unlinkSync(f.path);
    assert.equal(basename(String(old.inputs.script)), 'SCRIPT.md');
    assert.equal(readFileSync(String(f.pkg(first.instance.id).inputs.script), 'utf8'), '第一期');
    assert.equal(readFileSync(String(f.pkg(second.instance.id).inputs.script), 'utf8'), '第二期');
    assert.notEqual(old.inputs.script, f.path);
    f.core.deleteWorkPermanently(first.instance.id, { confirmation: first.instance.id });
    assert.equal(existsSync(String(old.inputs.script)), false);
    assert.equal(readFileSync(String(f.pkg(second.instance.id).inputs.script), 'utf8'), '第二期');
  } finally { f.core.close(); }
});
test('显式换文件修订当前输入，保留旧副本并拒绝陈旧表单；命令重试不重复事件', () => {
  const f = setup(); try {
    const work = f.create(), old = f.pkg(work.instance.id), expectedHash = hash(f.core.definitions.inputs(work.instance.id));
    writeFileSync(f.path, '修订稿');
    const command = { workId: work.instance.id, files: { script: f.path }, removeReferenceIds: [], expectedHash, commandId: id() };
    f.core.definitions.updateInstanceFiles(command); f.core.definitions.updateInstanceFiles(command);
    const current = f.core.getWork(work.instance.id)!;
    assert.equal(readFileSync(String(f.pkg(work.instance.id).inputs.script), 'utf8'), '修订稿');
    assert.equal(readFileSync(String(old.inputs.script), 'utf8'), '第一期');
    assert.equal(current.sourceArchive.filter(event => event.kind === 'work.input_provided').length, 2);
    assert.equal(currentSourceEvents(current.sourceArchive).filter(event => event.kind === 'work.input_provided').length, 1);
    assert.ok(current.state.facts.some(item => item.text === `script: ${f.pkg(work.instance.id).inputs.script}`));
    assert.throws(() => f.core.definitions.updateInstanceFiles({ ...command, commandId: id() }), /INSTANCE_INPUTS_CHANGED/);
    writeFileSync(String(f.pkg(work.instance.id).inputs.script), '副本被修改');
    assert.throws(() => f.pkg(work.instance.id), /MATERIAL_MISSING/);
  } finally { f.core.close(); }
});
test('历史未固定输入必须重选；参考按已知哈希固定，变更的参考必须明确移除', () => {
  const f = setup(); try {
    const first = f.create();
    const referencePath = join(f.directory, 'reference.md'); writeFileSync(referencePath, '参考甲');
    const reference = f.core.addArtifactRef(first.instance.id, { path: referencePath, filename: 'reference.md', role: 'DELIVERABLE', mimeType: null, size: Buffer.byteLength('参考甲'), sha256: hash('参考甲'), lastModifiedAt: new Date().toISOString(), availability: 'AVAILABLE' }).artifactRefs[0]!;
    const work = f.create([reference.id]), binding = f.core.definitions.inputs(work.instance.id);
    writeFileSync(referencePath, '参考乙');
    assert.equal(readFileSync(binding.referenceExamples[0]!.path, 'utf8'), '参考甲');
    delete binding.inputMaterials; binding.inputs.script = f.path;
    binding.referenceExamples[0]!.path = referencePath; delete binding.referenceExamples[0]!.material;
    f.core.definitions.db.prepare('UPDATE instance_inputs SET payload_json=? WHERE work_id=?').run(JSON.stringify(binding), work.instance.id);
    assert.throws(() => f.pkg(work.instance.id), /INPUT_FILE_UNVERIFIED/);
    const command = { workId: work.instance.id, files: { script: f.path }, removeReferenceIds: [], expectedHash: hash(binding), commandId: id() };
    assert.throws(() => f.core.definitions.updateInstanceFiles(command), /MATERIAL_MISSING/);
    f.core.definitions.updateInstanceFiles({ ...command, removeReferenceIds: [reference.id] });
    assert.equal(f.pkg(work.instance.id).referenceExamples.length, 0);
    unlinkSync(f.path); assert.equal(readFileSync(String(f.pkg(work.instance.id).inputs.script), 'utf8'), '第一期');
  } finally { f.core.close(); }
});
test('创建失败不留下实例文件，固定副本损坏不回退到原文件', () => {
  const f = setup(); try {
    assert.throws(() => f.create(['missing']), /MATERIAL_MISSING/);
    const root = join(f.core.definitions.materials.directory, 'instances');
    assert.deepEqual(readdirSync(root), []);
    const work = f.create(); const binding = f.core.definitions.inputs(work.instance.id);
    unlinkSync(String(binding.inputs.script)); assert.ok(existsSync(f.path));
    assert.throws(() => f.pkg(work.instance.id), /MATERIAL_MISSING/);
  } finally { f.core.close(); }
});
