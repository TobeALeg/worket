// Synthetic source payloads; real Codex normalizer, Electron UI, persistence and authenticated HTTP MCP.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { _electron as electron } from 'playwright';
import { seedSourceReview } from './lib/qa-source-review.mjs';
import { sourceFixture, finishSource, reviseSource } from './lib/source-revision-fixture.mjs';
const run = new Date().toISOString().replace(/[:.]/g, '-'), output = join(process.cwd(), 'output/source-revisions', run); mkdirSync(output, { recursive: true });
const directory = mkdtempSync(join(tmpdir(), 'worket-source-e2e-'));
const report = { run, status: 'RUNNING', packaged: !!process.env.WORKPET_EXECUTABLE_PATH, directory, actualProviderCalls: 0, externalAgent: false, legacyPartial: process.env.WORKET_SOURCE_LEGACY === '1', checks: {} };
let app, panel;
try {
  app = await electron.launch({ executablePath: process.env.WORKPET_EXECUTABLE_PATH ?? join(process.cwd(), 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [...(process.env.WORKPET_EXECUTABLE_PATH ? ['--use-mock-keychain'] : ['.']), `--user-data-dir=${directory}`, '--dev'], cwd: process.cwd(), env: { ...process.env, WORKPET_DATA_DIR: directory, WORKPET_BRIDGE_CONFIG: join(directory, 'bridge.json'), WORKPET_SKIP_INTEGRATIONS: '1' } });
  const deadline = Date.now() + 15000;
  while (!panel && Date.now() < deadline) { panel = app.windows().find(p => p.url().endsWith('/panel.html')); if (!panel) await new Promise(r => setTimeout(r, 100)); }
  assert.ok(panel); panel.setDefaultTimeout(15000);
  const payload = sourceFixture(directory);
  if (report.legacyPartial) delete payload.turns[0].status;
  await app.evaluate(({ app, BrowserWindow }, payload) => {
    const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json');
    const { CodexAppServerClient } = require('./dist/adapters/codex/app-server-client.js');
    const { normalizeCodexThread } = require('./dist/adapters/codex/normalize.js');
    for (const [path, name] of [['workbuddy/desktop-client', 'WorkBuddyDesktopClient'], ['zcode/source', 'ZCodeSource'], ['antigravity/source', 'AntigravitySource']]) {
      const Source = require('./dist/adapters/' + path + '.js')[name];
      Source.prototype.listThreadPage = async function() { return { threads: [], nextCursor: null }; };
    }
    globalThis.qaSourcePayload = payload;
    CodexAppServerClient.prototype.readThread = async function(id) { assertId(id); return normalizeCodexThread(globalThis.qaSourcePayload); };
    function assertId(id) { if (id !== globalThis.qaSourcePayload.id) throw new Error('QA refuses other histories'); }
    CodexAppServerClient.prototype.listThreadPage = async function() { const p = globalThis.qaSourcePayload; return { threads: [{ id: p.id, title: p.name, preview: '', cwd: p.cwd, updatedAt: new Date(p.updatedAt * 1000).toISOString(), status: null }], nextCursor: null }; };
    CodexAppServerClient.prototype.listRecentThreads = async function() { return (await this.listThreadPage()).threads; };
    const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/panel.html')); window.setSize(820, 820); window.show();
  }, payload);
  // All data stays in this isolated QA profile; disable optional improvement uploads.
  await panel.evaluate(() => window.workpet.distillation('setImprovementPreference', { enabled: false }));
  await panel.reload();
  await panel.locator('#tab-recent').click();
  const source = panel.locator(`[data-thread-id="${payload.id}"]`);
  await source.getByRole('button', { name: '开始记录' }).click();
  await panel.locator('#back-to-list').waitFor();
  const state = () => panel.evaluate(() => window.workpet.getDashboard());
  const initial = await state(), workId = initial.selectedWorkId;
  assert.ok(workId);
  if (report.legacyPartial) assert.equal(initial.selectedWork.latestActivity.text, '已完成');
  else assert.equal(initial.selectedWork.latestActivity, undefined);
  report.checks[report.legacyPartial ? 'legacyPartialSeeded' : 'noPartialReply'] = true;
  let reviewJob;
  const bridge = JSON.parse(readFileSync(join(directory, 'bridge.json'), 'utf8'));
  const call = async (name) => {
    const response = await fetch(`http://${bridge.host}:${bridge.port}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-workpet-token': bridge.token }, body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method: 'tools/call', params: { name, arguments: { work_id: workId } } }), signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200); const value = await response.json(); assert.ok(!value.error, JSON.stringify(value.error)); return JSON.parse(value.result.content[0].text);
  };
  const refresh = async () => { await panel.locator('#work-detail .secondary-menu summary').click(); await panel.locator('[data-action="refresh"]').click(); await panel.locator('[data-action="refresh"]').waitFor({ state: 'attached' }); };
  const waitText = async text => { const end = Date.now() + 15000; while (Date.now() < end) { if ((await state()).selectedWork.latestActivity?.text === text) return; await new Promise(r => setTimeout(r, 100)); } assert.fail('latest reply did not update'); };
  finishSource(payload); await app.evaluate((_, payload) => { globalThis.qaSourcePayload = payload; }, payload); await refresh(); await waitText(payload.turns[0].items[1].text);
  const oldPackage = await call('get_work_context');
  assert.ok(oldPackage.state.completedActions.some(i => i.text === '已完成报告。'));
  const prepared = await panel.evaluate(workId => window.workpet.distillation('prepare', { workIds: [workId], includedFileIds: [] }), workId);
  if (process.env.WORKET_REVIEW_DRIFT === '1') {
    reviewJob = await seedSourceReview(app, prepared);
    assert.equal(reviewJob.status,'AWAITING_REVIEW',reviewJob.error);
  }
  reviseSource(payload); await app.evaluate((_, payload) => { globalThis.qaSourcePayload = payload; }, payload); await refresh(); await waitText(payload.turns[0].items[1].text);
  const current = await call('get_work_context'), archive = await call('get_work_archive');
  assert.ok(current.state.constraints.some(i => i.text.includes('发布日期')));
  assert.ok(!current.state.completedActions.some(i => i.text === '已完成报告。'));
  assert.ok(current.state.pendingActions.some(i => i.text === '确认日期后交付。'));
  assert.ok(archive.events.some(e => e.content === '已完成报告。下一步：请核对来源。'));
  assert.ok(archive.events.some(e => e.metadata.worketSource?.previousEventId));
  const currentIds = new Set(archive.currentEventIds);
  assert.ok(!archive.events.some(e => currentIds.has(e.id) && e.content === '已完成报告。下一步：请核对来源。'));
  if (report.legacyPartial) assert.ok(!current.state.completedActions.some(i => i.text === '已完成'));
  assert.ok(oldPackage.state.completedActions.some(i => i.text === '已完成报告。'));
  const newSnapshot = await panel.evaluate(workId => window.workpet.distillation('prepare', { workIds: [workId], includedFileIds: [] }), workId);
  assert.ok(prepared.sources[0].events.some(e => e.content === '每次报告必须包含来源链接。'));
  assert.ok(!newSnapshot.sources[0].events.some(e => e.content === '每次报告必须包含来源链接。'));
  const kinds = newSnapshot.sources[0].events.map(e => e.kind); assert.ok(kinds.indexOf('user.prompt') < kinds.indexOf('agent.response'));
  report.checks.revisionArchiveCurrentPackageAndSnapshot = true;
  // Render current detail, then inspect the visible result.
  await panel.locator('#back-to-list').click(); await panel.locator(`[data-work-id="${workId}"]`).click();
  await panel.locator('#back-to-list').waitFor({ state: 'visible' });
  await panel.locator('#work-detail .state-item').filter({ hasText: '发布日期' }).waitFor();
  await panel.screenshot({ path: join(output, 'current-source.png') });
  const splitPoints = await panel.evaluate(id => window.workpet.listSplitPoints(id), workId);
  assert.equal(splitPoints.length, 1); assert.match(splitPoints[0].label, /发布日期/);
  report.checks.revisedSplitPoint = true;
  if (reviewJob) {
    await app.evaluate(({BrowserWindow}) => {const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/panel.html'));w.setSize(410,700);});
    await panel.evaluate(async id => (await import('./distillation.js')).openJob(id),reviewJob.id);
    await panel.locator('#source-review-notice').waitFor();
    await panel.locator('#source-review-notice').getByText('查看变化', {exact:true}).click();
    assert.match(await panel.locator('#source-review-notice').innerText(),/每次报告必须包含来源链接。/);
    assert.match(await panel.locator('#source-review-notice').innerText(),/每次报告必须包含来源链接和发布日期。/);
    assert.ok(await panel.locator('#publish-definition').isDisabled());
    await panel.screenshot({path:join(output,'changed-source-review.png')});
    await panel.locator('#source-review-confirm').check();
    payload.turns[0].items[0].content[0].text = '每次报告必须包含来源链接、发布日期和作者。';
    payload.turns[0].items[1].text = '已完成二次修订。';
    await app.evaluate((_, payload) => { globalThis.qaSourcePayload = payload; }, payload);
    await waitText('已完成二次修订。'); // Actual background source synchronization while the review remains open.
    await panel.locator('#publish-definition').click();
    await panel.waitForFunction(() => document.querySelector('#source-review-confirm')?.checked === false && document.querySelector('#publish-definition')?.disabled);
    await panel.locator('#source-review-notice').getByText('查看变化', {exact:true}).click();
    assert.match(await panel.locator('#source-review-notice').innerText(),/发布日期和作者/);
    await panel.locator('#source-review-confirm').check();
    await panel.locator('#publish-definition').click();await panel.locator('#use-definition').waitFor();
    await panel.locator('#use-definition').click();await panel.locator('[data-input="customer"]').fill('新客户');await panel.locator('[data-input="market"]').fill('新市场');await panel.locator('#create-defined-work').click();
    const next=(await state()).selectedWorkId; const pkg=await panel.evaluate(workId=>window.workpet.distillation('package',{workId}),next);
    assert.ok(pkg.markdown.includes('每条事实必须标注来源'));assert.ok(!pkg.markdown.includes('发布日期'));
    report.checks.explicitSnapshotReviewAndReuse=true;
    await panel.screenshot({path:join(output,'reviewed-instance.png')});
  }
  report.status = 'PASSED';
} catch (error) { report.status = 'FAILED'; report.error = error instanceof Error ? error.message : String(error); if (panel) await panel.screenshot({ path: join(output, 'failure.png') }).catch(() => {}); process.exitCode = 1; }
finally { if (app) await app.close().catch(() => {}); writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); }
