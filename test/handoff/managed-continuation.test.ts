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
import { CONTINUATION_CONSENT } from '../../dist/contracts/continuation.js';
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
  let calls = 0;
  let lastInput: any;
  const server = createAIService({ mode: 'development', devSecret: 'test-secret', issuer: 'test', audience: 'test',
    provider: { model: 'deterministic-evidence-fixture', async call(messages: any[]) {
      calls++; lastInput = JSON.parse(messages[1].content);
      return { result: candidate(lastInput), usage: { total_tokens: 7 } };
    } },
  });
  await new Promise<void>(resolve => server.server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.server.address().port}`;
  const client = new WorketAIClient(() => ({ url, token: token(), development: true, userId: 'audit' }) as any);
  const adapter = {
    id: 'fixture', name: 'fixture', mark: 'F', bundleIds: [], environment: { type: 'FIXTURE', name: 'fixture' },
    source: { async readThread(): Promise<never> { throw new Error('No live source'); }, close() {} },
    async inspect() {}, async resolveCurrent() { return null; }, async deliver() { return {}; },
  };
  const app = new AppService({ databasePath: join(mkdtempSync(join(tmpdir(), 'worket-managed-')), 'work.sqlite'),
    executors: [adapter], aiClient: client, foreground: { async detect() { return null; } } });
  const core = app.core();
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
  return { app, core, client, server, url, id, append, calls: () => calls, input: () => lastInput,
    async close() { app.close(); await server.close(); } };
}

test('managed continuation is explicitly scoped; UI, package and MCP agree and later events do not upload', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.app.prepareContinuation(f.id)).resolution, 'UNRESOLVED');
    await assert.rejects(f.app.organizeWork(f.id, 'wrong-consent'), /CONSENT_REQUIRED/);
    assert.equal(f.calls(), 0);
    const view = await f.app.organizeWork(f.id, CONTINUATION_CONSENT);
    assert.equal(f.calls(), 1);
    assert.equal(view.selectedWork!.understandingStatus, 'RESOLVED');
    assert.deepEqual(view.selectedWork!.state.constraints.map(item => item.text), ['交付 PDF', '保留人民币']);
    assert.equal(view.selectedWork!.state.pendingActions[0]!.text, '导出 PDF');
    assert.ok(!JSON.stringify(f.input()).includes('privateLocator'));
    const eventIds = new Set(f.input().events.map((event: any) => event.id));
    assert.ok(Object.values(f.input().state).flat().every((item: any) => item.sourceMessageIds.every((id: string) => eventIds.has(id))), 'state references use the same canonical IDs as uploaded events');
    const exported = buildWorkPackage(f.core.getWork(f.id)!, f.core.definitions);
    assert.deepEqual(exported.state, view.selectedWork!.state);
    await f.app.handoff(f.id, 'fixture');
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
    assert.equal(f.calls(), 1, 'new records require a new explicit organization action');
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
    await assert.rejects(f.app.organizeWork(f.id, CONTINUATION_CONSENT), /WORK_NOT_OPEN/);
    assert.equal(f.calls(), 0);
    assert.equal(f.server.db.prepare('SELECT COUNT(*) AS n FROM requests').get().n, 0);
  } finally { await f.close(); }
});
