// Observational audit, not a regression test prescribing these deficiencies.
// node probe.mjs <freshly compiled src directory> <report.json> [source commit]
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = resolve(process.argv[2]);
const load = path => import(pathToFileURL(join(build, path)).href);
const { AppService } = await load('app/app-service.js');
const { createDefaultExecutors } = await load('executors/defaults.js');
const { LocalRuleExtractor } = await load('extractor/local-rule-extractor.js');
const { WorkPetMcpHandler } = await load('bridge/mcp-handler.js');

// Force the ordinary no-direct-provider configuration without reading secrets.
delete process.env.WORKPET_LLM_API_KEY;
delete process.env.WORKPET_CLOUD_EXTRACTION;
const directory = mkdtempSync(join(tmpdir(), 'worket-object-probe-'));
const prompts = {};
let clipboard = '';
const source = {
  async listThreadPage() { return { threads: [], nextCursor: null }; },
  async readThread() { throw new Error('Audit must not read an external conversation'); },
  close() {},
};
const adapters = createDefaultExecutors({
  codex: source, workbuddy: source, zcode: source, antigravity: source,
  openUrl: async url => { prompts.codex = new URL(url).searchParams.get('prompt'); },
  launcher: { async openNewConversation(url) { prompts.workbuddy = new URL(url).searchParams.get('prompt'); } },
  desktop: { async openApplication() {}, writeClipboard(text) { clipboard = text; } },
});
const app = new AppService({
  databasePath: join(directory, 'audit.sqlite'),
  executors: adapters,
  foreground: { async detect() { return null; } },
});
const core = app.core();
const extractor = new LocalRuleExtractor();
const report = {
  sourceCommit: process.argv[4] ?? null,
  scope: 'Freshly compiled source; isolated SQLite; real AppService, extractor, MCP handler and default adapters; fake OS launch/clipboard and source interfaces. No cloud, user database, Electron UI or external Agent.',
  checks: {},
};
function newWork(name) {
  const work = core.createWork({
    definition: { key: 'audit', name, version: 1 },
    executor: { type: 'AGENT', name: 'Audit' },
    environment: { type: 'AUDIT', name: 'Audit' },
    source: { adapter: 'codex', conversationId: name },
  });
  return work.instance.id;
}
async function add(workId, kind, content) {
  const work = core.getWork(workId);
  const sequence = work.sourceArchive.length + 1;
  const externalId = `${workId}-${sequence}`;
  const event = { externalId, sequence, kind, content,
    timestamp: new Date(Date.UTC(2026, 8, 23, 0, 0, sequence)).toISOString(),
    executorType: kind === 'user.prompt' ? 'HUMAN' : 'AGENT',
    environmentType: 'AUDIT', metadata: {}, artifactRefs: [],
  };
  const current = core.appendSourceEvents(workId, [event]).work;
  const patch = await extractor.extract({ previousState: current.state, events: [event] });
  if (current.state.objective.length) patch.objective = [];
  core.applyExtractorPatch(workId, patch, sequence);
}
try {
  const id = newWork('requirement-change');
  await add(id, 'user.prompt', '请导出报告。必须交付 CSV。必须保留人民币。');
  await add(id, 'agent.response', '下一步：导出 CSV。');
  await add(id, 'user.prompt', '取消此前 CSV 要求。现在必须交付 PDF。');
  // Do not read an actual application. The archived visible evidence remains available.
  core.stopCapture(id);
  const mcp = new WorkPetMcpHandler(core, { prepareContinuation: workId => app.prepareContinuation(workId) });
  const response = await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
    name: 'get_work_context', arguments: { work_id: id, context_version: 3 },
  } });
  assert.ok(!response.error, JSON.stringify(response.error));
  const context = JSON.parse(response.result.content[0].text);
  report.checks.defaultContinuation = {
    resolution: context.resolution,
    fallbackConstraints: context.fallbackV2.goal.constraints.map(item => item.text),
    fallbackFirstAction: context.fallbackV2.position.pendingActions[0]?.text,
    latestUserMessages: context.latestUserMessages.map(item => item.excerpt),
  };

  // Exercise the complete application handoff path through each real default adapter.
  report.checks.defaultAdapterDelivery = [];
  for (const adapter of adapters) {
    const workId = newWork(`delivery-${adapter.id}`);
    await add(workId, 'user.prompt', '请继续当前阶段。');
    core.stopCapture(workId);
    await app.handoff(workId, adapter.id);
    const actual = prompts[adapter.id] ?? clipboard;
    const work = core.getWork(workId);
    const packageBeforeRead = core.getLatestHandoffPackage(workId);
    assert.equal(work.instance.id, workId);
    assert.ok(actual.includes(`[WORKPET:${workId}]`));
    assert.ok(actual.includes(`[DELIVERY:${work.packageDeliveryId}]`));
    report.checks.defaultAdapterDelivery.push({
      executor: adapter.id,
      deliveredContextVersion: Number(actual.match(/context_version=(\d)/)?.[1]),
      hasStoredContinuation: !!packageBeforeRead.continuation,
      storedResolution: packageBeforeRead.continuation?.resolution,
      workIdPreserved: work.instance.id === workId,
      targetStillPending: work.activeBinding.conversationId.startsWith('pending:'),
      packageReadAt: work.packageReadAt,
    });
  }

  const events = Array.from({ length: 12 }, (_, index) => ({
    externalId: `bulk-${index}`, kind: 'user.prompt', content: `必须遵守第 ${index + 1} 条要求。`,
  }));
  const bulk = await extractor.extract({ previousState: null, events });
  report.checks.initialBatchCoverage = {
    explicitRequirements: events.length,
    structuredConstraints: bulk.constraints.length,
    texts: bulk.constraints.map(item => item.text),
    note: 'All source events can remain archived; this measures loss in the structured projection only.',
  };
  const negative = await extractor.extract({ previousState: null, events: [
    { externalId: 'negative', kind: 'agent.response', content: '不能声称已完成导出。' },
  ] });
  report.checks.negatedCompletion = negative.completedActions;
} finally {
  app.close();
}
writeFileSync(resolve(process.argv[3]), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
