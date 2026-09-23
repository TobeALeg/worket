import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAIService } from '../../server/service.mjs';
import { WorketAIClient } from '../../dist/ai-service/client.js';
import { AppService } from '../../dist/app/app-service.js';
import { WorkPetMcpHandler } from '../../dist/bridge/mcp-handler.js';
import { buildWorkPackage } from '../../dist/definitions/work-package.js';
import { LocalRuleExtractor } from '../../dist/extractor/local-rule-extractor.js';
import { DistillationService } from '../../dist/distillation/service.js';
import { FixtureClient } from '../distillation/fixtures.ts';

function token() {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: 'audit', iss: 'test', aud: 'test', exp: Date.now() / 1000 + 600 })).toString('base64url');
  return `${header}.${payload}.${createHmac('sha256', 'test-secret').update(`${header}.${payload}`).digest('base64url')}`;
}

function candidate(input: any) {
  const user = input.events.filter((event: any) => event.kind === 'user.prompt');
  const first = user[0], last = user.at(-1);
  const claim = (event: any, text = event.content) => ({ text, sourceEventIds: [event.id], excerpts: [{ sourceEventId: event.id, text: event.content }] });
  const requirement = (id: string, event: any, text: string, status = 'ACTIVE', supersedes: string[] = []) => ({
    id, kind: 'CONSTRAINT', claim: claim(event, text), scope: { kind: 'WORK', ids: [] }, status, supersedes,
    replacementEvidence: status === 'SUPERSEDED' ? [claim(last)] : [],
  });
  return {
    coveredSourceEventIds: input.events.map((event: any) => event.id),
    objective: [claim(first, '导出报告')],
    currentStageId: 'pdf', currentStageBasis: [claim(last)],
    stages: [{ id: 'pdf', task: claim(last, '导出 PDF'), execution: 'IN_PROGRESS', completionEvidence: [], outcomes: [], dependsOn: [], remaining: [claim(last, '导出 PDF')], blockers: [] }],
    requirements: [requirement('csv', first, '交付 CSV', 'SUPERSEDED'), requirement('pdf', last, '交付 PDF', 'ACTIVE', ['csv']), requirement('currency', first, '保留人民币')],
    uncertainties: [],
  };
}

async function fixture() {
  let beforeModel: (() => Promise<void>) | undefined;
  let userId = "audit";
  let deliveries = 0;
  let sourceUnavailable = false;
  const threads = new Map<string, any>();
  let calls = 0;
  let lastInput: any;
  const server = createAIService({ mode: 'development', devSecret: 'test-secret', issuer: 'test', audience: 'test',
    provider: { model: 'deterministic-evidence-fixture', async call(messages: any[]) {
      calls++; lastInput = JSON.parse(messages[1].content);
      await beforeModel?.();
      return { result: candidate(lastInput), usage: { total_tokens: 7 } };
    } },
  });
  await new Promise<void>(resolve => server.server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.server.address().port}`;
  const client = new WorketAIClient(() => ({ url, token: token(), development: true, userId }) as any);
  const adapter = {
    id: 'fixture', name: 'fixture', mark: 'F', bundleIds: [], environment: { type: 'FIXTURE', name: 'fixture' },
    source: { async readThread(id: string) { if (sourceUnavailable) throw new Error('Source temporarily unavailable'); const thread = threads.get(id); if (!thread) throw new Error('No live source'); return thread; }, close() {} },
    async inspect() {}, async resolveCurrent() { return null; }, async deliver() { deliveries++; return {}; },
  };
  const options = { databasePath: join(mkdtempSync(join(tmpdir(), 'worket-managed-')), 'work.sqlite'),
    executors: [adapter], aiClient: client, preparationDelayMs: 40, foreground: { async detect() { return null; } } };
  let app = new AppService(options);
  let core = app.core();
  const work = core.createWork({ definition: { key: 'audit', name: 'Audit', version: 1 },
    executor: { type: 'AGENT', name: 'fixture' }, environment: adapter.environment, source: { adapter: 'fixture', conversationId: 'audit' } });
  const id = work.instance.id;
  const append = (kind: any, content: string) => {
    const sequence = Math.max(0, ...core.getWork(id)!.sourceArchive.map(event => event.sequence)) + 1;
    return core.appendSourceEvents(id, [{ externalId: randomUUID(), sequence, kind, content, timestamp: new Date().toISOString(),
      executorType: kind === 'user.prompt' ? 'HUMAN' : 'AGENT', environmentType: 'FIXTURE',
      metadata: { privateLocator: '/private/not-for-model' }, artifactRefs: [] }]).work;
  };
  append('user.prompt', '请导出报告。必须交付 CSV。必须保留人民币。');
  append('agent.response', '下一步：导出 CSV。');
  const recorded = append('user.prompt', '取消此前 CSV 要求。现在必须交付 PDF。');
  const patch = await new LocalRuleExtractor().extract({ previousState: recorded.state, events: recorded.sourceArchive });
  core.applyExtractorPatch(id, patch);
  core.stopCapture(id);
  return { get app() { return app; }, get core() { return core; }, client, server, url, id, append,
    restart() { app.close(); app = new AppService(options); core = app.core(); },
    gate(fn: () => Promise<void>) { beforeModel = fn; },
    setSourceUnavailable(value: boolean) { sourceUnavailable = value; },
    changeIdentity() { userId = 'other-account'; },
    deliveries: () => deliveries,
    async record() {
      const threadId = randomUUID(), now = new Date().toISOString();
      const events = core.getWork(id)!.sourceArchive.filter(e => e.kind !== 'conversation.title').map(e => ({ ...e, id: e.externalId }));
      const thread = { threadId, title: '报告', cwd: '', createdAt: now, updatedAt: now, events };
      threads.set(threadId, thread);
      const view = await app.createWorkFromConversation({ executorId: 'fixture', threadId });
      return { id: view.selectedWorkId!, thread, add(content = '必须交付 PDF，继续。') {
        const eventId = randomUUID();
        thread.events.push({ ...events.at(-1)!, id: eventId, externalId: eventId, sequence: events.length + 1, content });
      } };
    }, calls: () => calls, input: () => lastInput,
    async close() { app.close(); await server.close(); } };
}

test('handoff automatically prepares managed state; UI, package and passive MCP agree', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.app.prepareContinuation(f.id)).resolution, 'UNRESOLVED');
    assert.equal(f.calls(), 0);
    const view = await f.app.handoff(f.id, 'fixture');
    assert.equal(f.calls(), 1);
    assert.equal(view.selectedWork!.understandingStatus, 'RESOLVED');
    assert.deepEqual(view.selectedWork!.state.constraints.map(item => item.text), ['交付 PDF', '保留人民币']);
    assert.equal(view.selectedWork!.state.pendingActions[0]!.text, '导出 PDF');
    assert.ok(!JSON.stringify(f.input()).includes('privateLocator'));
    const eventIds = new Set(f.input().events.map((event: any) => event.id));
    assert.ok(Object.values(f.input().state).flat().every((item: any) => item.sourceMessageIds.every((id: string) => eventIds.has(id))), 'state references use the same canonical IDs as uploaded events');
    const exported = buildWorkPackage(f.core.getWork(f.id)!, f.core.definitions);
    assert.deepEqual(exported.state, view.selectedWork!.state);
    const handler = new WorkPetMcpHandler(f.core, { prepareContinuation: id => f.app.prepareContinuation(id) });
    const read = await handler.handle({ id: 1, method: 'tools/call', params: { name: 'get_work_context', arguments: {
      work_id: f.id, context_version: 3, delivery_id: f.core.getWork(f.id)!.packageDeliveryId,
    } } });
    assert.ok(!read!.error, JSON.stringify(read));
    const context = JSON.parse((read!.result as any).content[0].text);
    assert.equal(context.resolution, 'RESOLVED');
    assert.equal(context.firstAction.text, '导出 PDF');
    assert.ok(f.core.getWork(f.id)!.packageReadAt);
    assert.equal((await f.app.prepareContinuation(f.id)).resolution, 'RESOLVED', 'read audit must not invalidate the snapshot');
    assert.equal(f.calls(), 1, 'MCP reads never acquire permission to call the model');
    const distill = new DistillationService(f.core, new FixtureClient());
    const prepared = distill.prepare({ workIds: [f.id], includedFileIds: [] });
    assert.ok(prepared.sources[0]!.events.every(event => !event.content.startsWith('MCP ')), 'distillation and continuation share business evidence');
    distill.close();
    f.append('user.prompt', '现在暂停导出，先检查数据。');
    assert.equal(f.app.dashboard(f.id).selectedWork!.understandingStatus, 'STALE');
    assert.equal((await f.app.prepareContinuation(f.id)).resolution, 'UNRESOLVED');
    assert.equal(f.calls(), 1, 'passive reads do not enroll an unbound recording');
    const rows = f.server.db.prepare('SELECT * FROM requests').all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].operation, 'continuation');
    assert.equal(rows[0].status, 'ACKNOWLEDGED');
    assert.equal(rows[0].calls, 1);
    assert.ok(!JSON.stringify(rows).includes('必须交付'));
  } finally { await f.close(); }
});

test('a changed work while checking service capability cannot submit the previous authorization', async () => {
  const f = await fixture();
  try {
    const original = f.client.request.bind(f.client);
    f.client.request = async (...args: any[]) => {
      const result = await original(...args as Parameters<typeof original>);
      if (args[0] === '/v1/capabilities') f.core.archiveWork(f.id);
      return result;
    };
    await assert.rejects(f.app.handoff(f.id, 'fixture'), /CONTINUATION_SCOPE_CHANGED/);
    assert.equal(f.calls(), 0);
    assert.equal(f.server.db.prepare('SELECT COUNT(*) AS n FROM requests').get().n, 0);
  } finally { await f.close(); }
});

async function until(check: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!check()) {
    assert.ok(Date.now() < deadline, 'background preparation timed out');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
const pause = (ms = 120) => new Promise(resolve => setTimeout(resolve, ms));

test('recording returns immediately, batches changes, reuses current state and survives restart', async () => {
  const f = await fixture();
  try {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    f.gate(() => gate);
    assert.equal(f.app.preparationNoticeRequired(), true);
    const record = await f.record();
    assert.equal(f.app.preparationNoticeRequired(), false);
    await until(() => f.calls() === 1);
    assert.equal(f.app.dashboard(record.id).selectedWork!.preparationStatus, 'RUNNING');
    assert.equal(f.app.dashboard(record.id).selectedWork!.captureStatus, 'recording');
    release();
    await until(() => f.app.dashboard(record.id).selectedWork!.understandingStatus === 'RESOLVED');
    for (let n = 0; n < 5; n++) await f.app.syncRecordedWorks();
    await pause();
    assert.equal(f.calls(), 1, 'unchanged polls reuse the prepared state');
    for (let n = 0; n < 3; n++) { record.add(); await f.app.syncRecordedWorks(); }
    assert.equal(f.app.dashboard(record.id).selectedWork!.preparationStatus, 'QUEUED');
    await until(() => f.calls() === 2 && f.app.dashboard(record.id).selectedWork!.understandingStatus === 'RESOLVED');
    assert.equal(f.input().events.length, record.thread.events.length, 'one batch includes all new evidence');
    f.restart();
    await f.app.syncRecordedWorks(); await pause();
    assert.equal(f.calls(), 2, 'restart reuses valid results');
    await f.app.handoff(record.id, 'fixture');
    assert.equal(f.calls(), 2, 'handoff reuses the same valid preparation');
    assert.equal(f.deliveries(), 1);
  } finally { await f.close(); }
});

test('handoff waits for in-flight preparation instead of submitting twice', async () => {
  const f = await fixture();
  let release!: () => void;
  try {
    const gate = new Promise<void>(resolve => { release = resolve; }); f.gate(() => gate);
    const record = await f.record();
    await until(() => f.calls() === 1);
    const handoff = f.app.handoff(record.id, 'fixture');
    await pause(); assert.equal(f.deliveries(), 0);
    release(); await handoff;
    assert.equal(f.calls(), 1); assert.equal(f.deliveries(), 1);
    assert.equal(f.app.dashboard(record.id).selectedWork!.understandingStatus, 'RESOLVED');
  } finally { release?.(); await f.close(); }
});

test('source changes during background preparation are refreshed before delivery', async () => {
  const f = await fixture();
  let release!: () => void;
  try {
    const gate = new Promise<void>(resolve => { release = resolve; }); f.gate(() => gate);
    const record = await f.record();
    await until(() => f.calls() === 1);
    record.add('现在必须交付 PDF，并保留人民币。'); await f.app.syncRecordedWorks();
    const handoff = f.app.handoff(record.id, 'fixture');
    release(); await handoff;
    assert.equal(f.calls(), 2);
    assert.equal(f.input().events.length, record.thread.events.length);
    assert.equal(f.app.dashboard(record.id).selectedWork!.understandingStatus, 'RESOLVED');
  } finally { release?.(); await f.close(); }
});

test('startup and polling do not enroll existing history; service changes and archive stop automatic uploads', async () => {
  const f = await fixture();
  try {
    f.restart(); await f.app.syncRecordedWorks(); await pause();
    assert.equal(f.calls(), 0); assert.equal(f.app.preparationNoticeRequired(), true);
    const record = await f.record();
    await until(() => f.app.dashboard(record.id).selectedWork!.understandingStatus === 'RESOLVED');
    record.add(); await f.app.syncRecordedWorks(); f.changeIdentity();
    await pause(); assert.equal(f.calls(), 1, 'old scope cannot upload to a new service identity');
    f.app.archiveWork(record.id); f.restart(); await f.app.syncRecordedWorks(); await pause();
    assert.equal(f.calls(), 1);
  } finally { await f.close(); }
});

test('unsupported service does not loop on polling or restart; handoff can still carry evidence', async () => {
  const f = await fixture();
  try {
    let capabilities = 0;
    const request = f.client.request.bind(f.client);
    f.client.request = async (...args: any[]) => {
      if (args[0] === '/v1/capabilities') { capabilities++; return {}; }
      return request(...args as Parameters<typeof request>);
    };
    const record = await f.record();
    await until(() => !!f.app.dashboard(record.id).selectedWork!.understandingNotice);
    for (let n = 0; n < 3; n++) await f.app.syncRecordedWorks();
    f.restart(); await f.app.syncRecordedWorks(); await pause();
    assert.equal(capabilities, 1); assert.equal(f.calls(), 0);
    assert.match(f.app.dashboard(record.id).selectedWork!.understandingNotice!, /升级后台/);
    await f.app.handoff(record.id, 'fixture');
    assert.equal(capabilities, 2, 'explicit handoff may retry a failed preparation');
    assert.equal(f.deliveries(), 1);
    assert.equal(f.core.getWork(record.id)!.sourceArchive.filter(e => e.kind === 'user.prompt').length, 2);
  } finally { await f.close(); }
});

test('temporary source read failure does not consume or suppress the first model attempt', async () => {
  const f = await fixture();
  try {
    const record = await f.record();
    f.setSourceUnavailable(true);
    await pause();
    assert.equal(f.calls(), 0);
    assert.equal(f.core.definitions.db.prepare('SELECT attempt_digest FROM work_preparation WHERE work_id=?').get(record.id).attempt_digest, null);
    f.setSourceUnavailable(false);
    await f.app.syncRecordedWorks();
    await until(() => f.app.dashboard(record.id).selectedWork!.understandingStatus === 'RESOLVED');
    assert.equal(f.calls(), 1);
  } finally { await f.close(); }
});
