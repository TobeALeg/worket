import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID as id } from 'node:crypto';
import { LocalExecution } from '../../dist/execution/local-execution.js';
import { AppService } from '../../dist/app/app-service.js';
import { DistillationDesktop } from '../../dist/distillation/desktop.js';
import { IMPROVEMENT_POLICY } from '../../dist/contracts/improvement.js';
import { DistillationService } from '../../dist/distillation/service.js';
import { FixtureClient, source } from '../distillation/fixtures.ts';
import { skillContent, skillBasis } from '../../scripts/lib/skill-fixture.mjs';

function setup(withSource = true, legacy = false) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'worket-local-')));
  writeFileSync(join(directory, 'AGENTS.md'), '原项目规则');
  let callback: any, calls = 0, continuation = '', approval = 0, fail = false, fast = false;
  const runner = {
    async start(input: any) {
      calls++; callback = input.onEvent;
      callback({ type: 'thread', threadId: 'real-thread', model: 'test', runtime: 'test-v1' });
      if (fail) throw Error('timeout after thread creation');
      if (fast) callback({ type: 'turn', turnId: 'turn-1', status: 'TURN_ENDED' });
      callback({ type: 'turn', turnId: 'turn-1', status: 'RUNNING' });
    },
    async continue(thread: string, input: any) { continuation = thread; callback = input.onEvent; callback({ type: 'turn', turnId: 'turn-2', status: 'RUNNING' }); },
    async inspect(_thread: string, emit: any) { emit({ type: 'turn', turnId: 'turn-1', status: 'INTERRUPTED' }); },
    approve() { approval++; }, async interrupt() { callback({ type: 'turn', turnId: 'turn-1', status: 'INTERRUPTED' }); }, close() {},
  };
  const open = () => new AppService({ databasePath: join(directory, 'work.sqlite'), executors: [], localRunner: runner });
  const app = open(), core = app.core(), content = structuredClone(skillContent);
  content.materialRoles = []; content.methods = [];
  const origin = source(core, '视频项目中的固定制作要求');
  core.appendSourceEvents(origin.instance.id, [{ externalId: id(), sequence: 2, kind: 'user.prompt', content: '今日内容', timestamp: new Date().toISOString(), executorType: 'HUMAN', environmentType: 'CODEX_DESKTOP', metadata: legacy ? {} : { cwd: directory }, artifactRefs: [] },
    { externalId: id(), sequence: 3, kind: 'tool.call', content: 'pwd', timestamp: new Date().toISOString(), executorType: 'AGENT', environmentType: 'CODEX_DESKTOP', metadata: { cwd: '/tmp/unrelated-command' }, artifactRefs: [] }]);
  const snapshot = new DistillationService(core, new FixtureClient()).prepare({ workIds: [origin.instance.id], includedFileIds: [] });
  const refs = withSource ? [{ snapshotId: snapshot.id, workId: origin.instance.id, eventId: snapshot.sources[0].events[0].id, role: 'CONTEXT' }] : [];

  const draft = core.definitions.saveDraft({ id: id(), revision: 1, content, originalContent: structuredClone(content), refs, issues: [], resolutions: [] });
  core.definitions.db.prepare('INSERT INTO review_events VALUES (?,?,?)').run(skillBasis.reviewEventId, draft.id, JSON.stringify({ type: 'QA_BASELINE', content }));
  const definition = core.definitions.publish({ draftId: draft.id, expectedRevision: 1, materialBindings: {}, commandId: id() });
  const work = core.createWorkFromDefinition({ definitionId: definition.id, inputs: { subject: '今日视频' }, referenceExampleIds: [], commandId: id() });
  const request = { workId: work.instance.id, files: [], commandId: id() };
  return { app, core, open, definition, work, request, directory, origin, emit: (e: any) => callback(e), calls: () => calls, continued: () => continuation, approved: () => approval, fail: () => fail = true, fast: () => fast = true };
}
test('local launch freezes inputs/files, remembers directory, deduplicates starts, and keeps work open', async () => {
  const f = setup();
  try {
    const defaults = await f.app.localExecution.defaults(f.definition.id);
    assert.equal(defaults.directory, f.directory); assert.equal(defaults.origin, 'SOURCE');
    const [first] = await Promise.all([f.app.localExecution.start(f.request), f.app.localExecution.start(f.request)]);
    assert.equal(first.manifest.project.resolution, 'SOURCE');
    assert.deepEqual(first.manifest.project.sourceWorkIds, [f.origin.instance.id]);
    assert.equal(first.status, 'RUNNING');
    assert.equal(f.core.getWork(f.request.workId)?.activeBinding?.conversationId, 'real-thread');
    assert.equal((await f.app.localExecution.defaults(f.definition.id)).directory, first.manifest.project.directory);
    assert.equal(first.manifest.workPackage.inputs.subject, '今日视频');
    writeFileSync(join(f.directory, 'AGENTS.md'), '已修改的规则');
    assert.equal(readFileSync(first.manifest.projectMaterials[0].path, 'utf8'), '原项目规则');
    await f.app.localExecution.start(f.request);
    assert.equal(f.calls(), 1);
    await assert.rejects(f.app.localExecution.start({ ...f.request, commandId: id() }), /ALREADY_STARTED/);
    await assert.rejects(f.app.localExecution.start({ ...f.request, files: [join(f.directory, 'AGENTS.md')] }), /COMMAND_CONFLICT/);
    assert.throws(() => f.app.archiveWork(f.request.workId), /EXECUTION_NOT_IDLE/);
    f.emit({ type: 'observation', kind: 'reply', data: { text: '脚本待你验收' } });
    f.emit({ type: 'turn', turnId: 'turn-1', status: 'TURN_ENDED' });
    assert.equal(f.core.getWork(f.request.workId)?.instance.status, 'OPEN');
    const next = { workId: f.request.workId, text: '修改最后一句', commandId: id() };
    await f.app.localExecution.continue(next); await f.app.localExecution.continue(next);
    assert.equal(f.continued(), 'real-thread');
    assert.equal(f.app.localExecution.get(f.request.workId)?.manifestHash, first.manifestHash);
    assert.equal(f.app.localExecution.get(f.request.workId)?.events.filter(e => e.kind === 'follow-up').length, 1);
  } finally { f.app.close(); }
});
test('uncertain launch/restart never duplicates and can reconcile original thread', async () => {
  const f = setup(); f.fail();
  const r = await f.app.localExecution.start(f.request);
  assert.equal(r.status, 'UNKNOWN');
  await f.app.localExecution.start(f.request); assert.equal(f.calls(), 1);
  f.app.close(); const reopened = f.open();
  try {
    assert.equal((await reopened.localExecution.defaults(f.definition.id)).directory, r.manifest.project.directory);
    assert.equal(reopened.localExecution.get(f.request.workId)?.status, 'UNKNOWN');
    await assert.rejects(reopened.localExecution.continue({ workId: f.request.workId, text: 'continue', commandId: id() }), /EXECUTION_NOT_IDLE/);
    await reopened.localExecution.reconcile(f.request.workId);
    assert.equal(reopened.localExecution.get(f.request.workId)?.status, 'INTERRUPTED');
    assert.equal(f.calls(), 1);
  } finally { reopened.close(); }
});
test('approval is scoped to work, is answered once, and does not auto-accept', async () => {
  const f = setup();
  try {
    await f.app.localExecution.start(f.request);
    f.emit({ type: 'approval', approval: { id: 'request-1', method: 'command', title: 'test', detail: 'test' } });
    assert.equal(f.approved(), 0);
    assert.equal(f.app.localExecution.get(f.request.workId)?.status, 'WAITING_APPROVAL');
    assert.throws(() => f.app.localExecution.approve('wrong-work', 'request-1', true), /APPROVAL_EXPIRED/);
    f.app.localExecution.approve(f.request.workId, 'request-1', false);
    assert.equal(f.approved(), 1);
    assert.throws(() => f.app.localExecution.approve(f.request.workId, 'request-1', true), /APPROVAL_EXPIRED/);
  } finally { f.app.close(); }
});
test('fast completion cannot be overwritten by delayed start acknowledgment; frozen file tampering is detected', async () => {
  const f = setup(); f.fast();
  try {
    const r = await f.app.localExecution.start(f.request);
    assert.equal(r.status, 'TURN_ENDED');
    const path = r.manifest.projectMaterials[0].path;
    writeFileSync(path, 'tampered');
    assert.throws(() => f.app.localExecution.materialPath(f.request.workId, path), /MATERIAL_CHANGED/);
    assert.throws(() => f.app.localExecution.materialPath(f.request.workId, '/etc/passwd'), /MATERIAL_CHANGED/);
    f.core.deleteWorkPermanently(f.request.workId, { confirmation: f.request.workId });
    assert.equal(f.app.localExecution.get(f.request.workId), null);
  } finally { f.app.close(); }
});

test('a contract without one source project gets its own stable default directory, created only on start', async () => {
  const f = setup(false);
  try {
    const defaults = await f.app.localExecution.defaults(f.definition.id);
    assert.equal(defaults.origin, 'DEFAULT'); assert.ok(!existsSync(defaults.directory));
    assert.notEqual(defaults.directory, process.cwd());
    const r = await f.app.localExecution.start(f.request);
    assert.ok(existsSync(defaults.directory));
    assert.equal(r.manifest.project.directory, defaults.directory);
    assert.equal((await f.app.localExecution.defaults(f.definition.id)).origin, 'REMEMBERED');
  } finally { f.app.close(); }
});

test('a known missing source project is never silently replaced with another default', async () => {
  const f = setup();
  try {
    const missing = join(f.directory, 'missing-project');
    f.core.appendSourceEvents(f.origin.instance.id, [{ externalId: id(), sequence: 4, kind: 'user.prompt', content: 'another turn', timestamp: new Date().toISOString(), executorType: 'HUMAN', environmentType: 'CODEX_DESKTOP', metadata: { cwd: missing }, artifactRefs: [] }]);
    await assert.rejects(f.app.localExecution.start(f.request), /PROJECT_DIRECTORY_UNAVAILABLE/);
    assert.equal(f.calls(), 0); assert.equal(f.app.localExecution.get(f.request.workId), null);
    assert.equal((await f.app.localExecution.defaults(f.definition.id)).directory, missing);
  } finally { f.app.close(); }
});

test('legacy records resolve the original session workspace, never a command working directory', async () => {
  const f = setup(true, true); let resolvedWork = '';
  try {
    const execution = new LocalExecution(f.core, f.app.localExecution.runner, async work => { resolvedWork = work.instance.id; return f.directory; });
    const defaults = await execution.defaults(f.definition.id);
    assert.equal(defaults.directory, f.directory);
    assert.equal(defaults.origin, 'SOURCE');
    assert.equal(resolvedWork, f.origin.instance.id);
  } finally { f.app.close(); }
});

test('optional improvement enrollment never requires network before local creation, and only uploads after server consent checks', async () => {
  const f = setup(); let capabilities = 0, uploads = 0, state = 'offline';
  const client = Object.assign(new FixtureClient(), {
    improvementIdentity: () => 'same-service-and-account',
    async uploadSample() { uploads++; }, async deleteSample() {},
    async capabilities() { capabilities++; if (state === 'offline') throw Error('offline'); return { improvement: { ...IMPROVEMENT_POLICY, enabled: state === 'online' } }; },
  });
  const desktop = new DistillationDesktop(f.app, client);
  try {
    const input = { definitionId: f.definition.id, inputs: { subject: 'offline local task' }, referenceExampleIds: [], commandId: id(), improvementConsentVersion: IMPROVEMENT_POLICY.version };
    const dashboard = await desktop.call('create', input) as any;
    const workId = dashboard.selectedWork.id;
    assert.equal(capabilities, 0); assert.equal(uploads, 0);
    assert.equal(f.core.getWork(workId)?.instance.status, 'OPEN');
    assert.equal(desktop.service.improvement.enabled(), true);
    const again = await desktop.call('create', input) as any;
    assert.equal(again.selectedWork.id, workId);
    assert.equal(desktop.service.improvement.list().length, 1);
    await desktop.service.improvement.flush();
    assert.equal(uploads, 0); assert.equal(desktop.service.improvement.list()[0].pending, 1);
    state = 'paused'; await desktop.service.improvement.flush(); assert.equal(uploads, 0);
    state = 'online'; await desktop.service.improvement.flush(); assert.equal(uploads, 1);
    assert.equal(desktop.service.improvement.list()[0].pending, 0);
    assert.equal(desktop.service.improvement.enabled(), true);
  } finally { desktop.service.close(); f.app.close(); }
});
