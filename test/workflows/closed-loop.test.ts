import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createWorkCore } from '../../dist/core/index.js';
import { confirmOutputTypes } from '../../dist/definitions/output-ports.js';
import { currentNode } from '../../dist/workflows/types.js';
import { buildWorkPackage } from '../../dist/definitions/work-package.js';
import { WorkPetMcpHandler } from '../../dist/bridge/mcp-handler.js';
import { seedWorkflow } from '../../scripts/lib/workflow-fixture.mjs';
const cid = () => randomUUID();

// Confirm real domain definitions, without an extractor, provider or external executor.

function fixture(t: any) {
  const directory = mkdtempSync(join(tmpdir(), 'worket-workflow-')), databasePath = join(directory, 'work.sqlite');
  let core = createWorkCore({ databasePath });
  t.after(() => { core.close(); rmSync(directory, { recursive: true, force: true }); });
  const seed = seedWorkflow(core), definition = core.workflows.save({ content: seed.content, commandId: cid() });
  const file = join(directory, 'source.md'); writeFileSync(file, '客户甲品牌资料');
  const create = (name: string) => core.workflows.create({ workflowId: definition.id, name, inputs: { brand: file }, commandId: cid() });
  const cmd = (runId: string, nodeId: string) => ({ runId, nodeId, generation: currentNode(core.workflows.run(runId), nodeId).generation, expectedRevision: core.workflows.run(runId).revision, commandId: cid() });
  const prepare = (runId: string, nodeId: string) => core.workflows.prepare(cmd(runId, nodeId));
  const submit = (runId: string, nodeId: string, outputs: any) => core.workflows.submit({ ...cmd(runId, nodeId), outputs });
  const pass = (runId: string, nodeId: string) => core.workflows.review({ ...cmd(runId, nodeId), decision: 'PASS', criteria: { complete: 'PASS', correct: 'PASS' } });
  const finish = (runId: string, nodeId: string, outputs: any) => { prepare(runId, nodeId); submit(runId, nodeId, outputs); pass(runId, nodeId); };
  return { directory, file, seed, definition, get core() { return core; }, restart() { core.close(); core = createWorkCore({ databasePath }); }, create, cmd, prepare, submit, pass, finish };
}
test('typed connections validate missing inputs, mismatches and cycles before saving immutable versions', t => {
  const f = fixture(t), w = f.core.workflows;
  const mismatch = structuredClone(f.seed.content); mismatch.nodes[2].bindings.script.key = 'copy';
  assert.throws(() => w.save({ content: mismatch, commandId: cid() }), /INPUT_TYPE_MISMATCH/);
  const cycle = structuredClone(f.seed.content); cycle.nodes[0].after = ['pack'];
  assert.throws(() => w.save({ content: cycle, commandId: cid() }), /WORKFLOW_CYCLE/);
  const missing = structuredClone(f.seed.content); missing.nodes[1].bindings = {};
  assert.throws(() => w.save({ content: missing, commandId: cid() }), /INPUT_REQUIRED/);
  assert.equal(w.definitions().length, 1);
  const old = f.seed.make('旧 Contract', [], [{ key: 'text' }]);
  const next = confirmOutputTypes(f.core.definitions, { definitionId: old.id, expectedHash: old.contentHash, types: { text: 'TEXT' }, commandId: cid() });
  assert.equal(next.version, old.version + 1); assert.equal(f.core.definitions.get(old.id).content.deliverables[0].valueType, undefined);
  assert.throws(() => f.core.definitions.delete({ definitionKey: f.seed.script.definitionKey, confirmation: '永久删除', commandId: cid() }), /DEFINITION_IN_USE/);
});
test('two full runs isolate snapshots; user rejection creates a new generation; parallel results join only after acceptance', async t => {
  const f = fixture(t), a = f.create('客户甲'); writeFileSync(f.file, '客户乙品牌资料'); const b = f.create('客户乙');
  const aWork = f.prepare(a, 'research'), bWork = f.prepare(b, 'research'); assert.notEqual(aWork, bWork);
  assert.equal(readFileSync(f.core.definitions.inputs(aWork).inputs.brand, 'utf8'), '客户甲品牌资料');
  assert.equal(readFileSync(f.core.definitions.inputs(bWork).inputs.brand, 'utf8'), '客户乙品牌资料');
  assert.notEqual(buildWorkPackage(f.core.getWork(aWork)!, f.core.definitions).workflow!.directory, buildWorkPackage(f.core.getWork(bWork)!, f.core.definitions).workflow!.directory);
  assert.throws(() => f.prepare(a, 'script'), /WORKFLOW_NODE_NOT_READY/);
  writeFileSync(f.file, '甲调研'); f.submit(a, 'research', { report: f.file });
  assert.throws(() => f.prepare(a, 'script'), /WORKFLOW_NODE_NOT_READY/);
  const pending = f.cmd(a, 'research'); assert.throws(() => f.core.workflows.review({ ...pending, decision: 'PASS', criteria: { complete: 'PASS', correct: 'NEEDS_REVISION' } }), /INPUT_REQUIRED/);
  f.pass(a, 'research'); writeFileSync(f.file, '原路径已改变'); const scriptWork = f.prepare(a, 'script');
  assert.equal(readFileSync(f.core.definitions.inputs(scriptWork).inputs.report, 'utf8'), '甲调研');
  writeFileSync(f.file, '脚本 v1'); f.submit(a, 'script', { script: f.file, copy: '旧文案' }); const rejected = f.cmd(a, 'script');
  f.core.workflows.review({ ...rejected, decision: 'REVISE', criteria: { complete: 'PASS', correct: 'NEEDS_REVISION' }, note: '开头突出新品' });
  assert.equal(f.core.workflows.run(b).nodes.research![0]!.workId, bWork);
  assert.throws(() => f.core.workflows.submit({ ...rejected, commandId: cid(), expectedRevision: f.core.workflows.run(a).revision, outputs: { script: f.file, copy: '迟到旧稿' } }), /STALE_GENERATION/);
  const v2work = f.prepare(a, 'script'); assert.notEqual(v2work, scriptWork);
  assert.match(buildWorkPackage(f.core.getWork(v2work)!, f.core.definitions).workflow!.note!, /新品/);
  writeFileSync(f.file, '脚本 v2'); f.submit(a, 'script', { script: f.file, copy: '新文案' }); f.pass(a, 'script');
  const video = f.prepare(a, 'video'), cover = f.prepare(a, 'cover'); assert.notEqual(video, cover);
  assert.equal(f.core.definitions.inputs(cover).inputs.copy, '新文案'); assert.equal(readFileSync(f.core.definitions.inputs(video).inputs.script, 'utf8'), '脚本 v2');
  writeFileSync(f.file, '成片'); f.submit(a, 'video', { video: f.file }); f.pass(a, 'video'); assert.throws(() => f.prepare(a, 'pack'), /WORKFLOW_NODE_NOT_READY/);
  writeFileSync(f.file, '封面'); f.submit(a, 'cover', { image: f.file }); f.pass(a, 'cover');
  writeFileSync(f.file, '交付包'); f.finish(a, 'pack', { package: f.file });
  assert.equal(f.core.workflows.run(a).status, 'COMPLETED'); assert.equal(f.core.workflows.run(b).status, 'RUNNING');
  assert.equal(readFileSync(currentNode(f.core.workflows.run(a), 'pack').outputs[0]!.material!.path, 'utf8'), '交付包');
  f.restart(); assert.equal(f.core.workflows.run(a).status, 'COMPLETED'); assert.equal(currentNode(f.core.workflows.run(b), 'research').workId, bWork);
});
test('adopting upstream v2 resets only affected descendants, retains old evidence, rejects late submissions and duplicate retries', async t => {
  const f = fixture(t), id = f.create('新版测试'); f.finish(id, 'research', { report: f.file }); f.finish(id, 'script', { script: f.file, copy: 'v1' });
  const oldVideo = f.prepare(id, 'video'); f.prepare(id, 'cover'); const oldInput = f.core.definitions.inputs(oldVideo).inputs.script;
  f.core.workflows.rework({ ...f.cmd(id, 'script'), note: '增加使用场景' }); writeFileSync(f.file, '修订脚本 v2'); f.finish(id, 'script', { script: f.file, copy: 'v2' });
  assert.equal(f.core.definitions.inputs(oldVideo).inputs.script, oldInput); assert.deepEqual(f.core.workflows.impact(id, 'script'), ['video', 'cover', 'pack']);
  const research = currentNode(f.core.workflows.run(id), 'research').workId;
  const adopt = f.cmd(id, 'script'); f.core.workflows.adopt(adopt); f.core.workflows.adopt(adopt);
  assert.equal(f.core.workflows.run(id).nodes.video!.length, 2); assert.equal(currentNode(f.core.workflows.run(id), 'research').workId, research);
  assert.throws(() => f.core.workflows.assertActive(oldVideo), /WORKFLOW_NODE_NOT_ACTIVE/);
  const prepare = f.cmd(id, 'video'), first = f.core.workflows.prepare(prepare); assert.equal(f.core.workflows.prepare(prepare), first);
  assert.equal(readFileSync(f.core.definitions.inputs(first).inputs.script, 'utf8'), '修订脚本 v2');
  const handler = new WorkPetMcpHandler(f.core); const request: any = { jsonrpc: '2.0', id: cid(), method: 'tools/call', params: { name: 'submit_workflow_outputs', arguments: { work_id: first, command_id: cid(), outputs: { video: f.file } } } };
  const one = await handler.handle(request), two = await handler.handle(request); assert.deepEqual(one, two); assert.ok((one as any).result);
  const stale = structuredClone(request); stale.params.arguments.work_id = oldVideo; stale.params.arguments.command_id = cid(); assert.ok((await handler.handle(stale) as any).error);
  assert.throws(() => f.core.definitions.accept({ workId: first, artifactIds: [], criteriaResults: {}, commandId: cid() }), /WORKFLOW_REVIEW_REQUIRED/);
  assert.throws(() => f.core.deleteWorkPermanently(first, { confirmation: first }), /WORKFLOW_OWNED_WORK/);
  const pause = { ...f.cmd(id, 'video'), status: 'PAUSED' as const }; f.core.workflows.setStatus(pause);
  assert.throws(() => f.prepare(id, 'cover'), /WORKFLOW_NOT_RUNNING/);
  f.core.workflows.setStatus({ ...f.cmd(id, 'video'), status: 'RUNNING' }); assert.equal(f.core.workflows.run(id).status, 'RUNNING');
  f.restart(); assert.ok(existsSync(currentNode(f.core.workflows.run(id), 'script').outputs[0]!.material!.path));
});
test('changed fixed files cannot be adopted or approved, and failed preparation rolls back the work claim', t => {
  const f = fixture(t), id = f.create('校验快照'); f.finish(id, 'research', { report: f.file });
  const original = f.core.definitions.instanceFiles.copy.bind(f.core.definitions.instanceFiles);
  const source = currentNode(f.core.workflows.run(id), 'research').outputs[0]!.material!;
  const before = f.core.listWorks().length;
  f.core.definitions.instanceFiles.copy = (workId, path, role) => { writeFileSync(path, '在校验与复制之间被改写'); return original(workId, path, role); };
  assert.throws(() => f.prepare(id, 'script'), /MATERIAL_MISSING|SOURCE_CHANGED/);
  assert.equal(f.core.listWorks().length, before); assert.equal(currentNode(f.core.workflows.run(id), 'script').workId, undefined);
  f.core.definitions.instanceFiles.copy = original;
  writeFileSync(source.path, readFileSync(f.file));
  // Restore exact original bytes before continuing, then corrupt the submitted snapshot itself.
  f.prepare(id, 'script'); f.submit(id, 'script', { script: f.file, copy: '文案' });
  const snapshot = currentNode(f.core.workflows.run(id), 'script').outputs[0]!.material!; writeFileSync(snapshot.path, '损坏');
  assert.throws(() => f.pass(id, 'script'), /MATERIAL_MISSING/); assert.equal(currentNode(f.core.workflows.run(id), 'video').phase, 'WAITING');
});
test('v3 local databases are backed up once before workflow migration; empty schema upgrades and restart retain data', t => {
  const directory = mkdtempSync(join(tmpdir(), 'worket-workflow-migrate-')), databasePath = join(directory, 'work.sqlite');
  let core = createWorkCore({ databasePath });
  core.definitions.db.exec('DROP TABLE workflow_node_works; DROP TABLE workflow_runs; DROP TABLE workflow_contract_refs; DROP TABLE workflow_definitions; PRAGMA user_version=3'); core.close();
  const backup = `${databasePath}.before-workflows-v4.bak`; rmSync(backup, { force: true });
  core = createWorkCore({ databasePath }); assert.equal(core.definitions.db.prepare('PRAGMA user_version').get()!.user_version, 4); assert.ok(existsSync(backup));
  const firstBackup = readFileSync(backup); core.close(); core = createWorkCore({ databasePath }); assert.deepEqual(readFileSync(backup), firstBackup); core.close(); rmSync(directory, { recursive: true, force: true });
});
