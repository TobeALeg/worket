import { seedSourceReview } from './lib/qa-source-review.mjs';
import { recordingViewService } from './lib/qa-recording-view.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { _electron as electron } from 'playwright';
import { historyFixture, writeHistoryFixture } from './lib/codex-history-fixture.mjs';
const run = new Date().toISOString().replace(/[:.]/g, '-'), output = join(process.cwd(), 'output/codex-history', run); mkdirSync(output, { recursive: true });
const directory = mkdtempSync(join(tmpdir(), 'worket-history-e2e-')), fixture = historyFixture();
if (process.env.WORKET_RECORDING_IDLE === '1') {
  fixture.turns[0].items.push(...Array.from({length:200}, (_, n) => ({id:`idle-${n}`,type:'userMessage',content:[{type:'text',text:`合成长历史 ${n}：规则保持通用，实例输入单独提供。`}]})));
}
const { dataPath, rpcLog, binary } = writeHistoryFixture(directory, fixture);
const report = { run, status: 'RUNNING', packaged: !!process.env.WORKPET_EXECUTABLE_PATH, directory, actualProviderCalls: 0, externalAgent: false, sourceAbsence: process.env.WORKET_SOURCE_ABSENCE === '1', checks: {} };
const sampleService = process.env.WORKET_RECORDING_VIEW === "1" ? await recordingViewService(directory) : null;
report.recordingView = !!sampleService;
let app, panel;
try {
  app = await electron.launch({ executablePath: process.env.WORKPET_EXECUTABLE_PATH ?? join(process.cwd(), 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [...(process.env.WORKPET_EXECUTABLE_PATH ? ['--use-mock-keychain'] : ['.']), `--user-data-dir=${directory}`, '--dev'], cwd: process.cwd(), env: { ...process.env, WORKPET_DATA_DIR: directory, WORKPET_BRIDGE_CONFIG: join(directory, 'bridge.json'), WORKPET_SKIP_INTEGRATIONS: '1' } });
  const end = Date.now() + 15000;
  while (!panel && Date.now() < end) { panel = app.windows().find(p => p.url().endsWith('/panel.html')); if (!panel) await new Promise(r => setTimeout(r, 100)); }
  assert.ok(panel); panel.setDefaultTimeout(15000);
  await app.evaluate(({ app, BrowserWindow }, { binary, thread }) => {
    const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json');
    const { CodexAppServerClient } = require('./dist/adapters/codex/app-server-client.js');
    const originalRead = CodexAppServerClient.prototype.readThread;
    CodexAppServerClient.prototype.readThread = async function(id) {
      const client = new CodexAppServerClient([binary]);
      try { return await originalRead.call(client, id); } finally { client.close(); }
    };
    CodexAppServerClient.prototype.listThreadPage = async function() { return { threads: [{ id: thread.id, title: thread.name, preview: '', cwd: thread.cwd, updatedAt: new Date(thread.updatedAt * 1000).toISOString(), status: null }], nextCursor: null }; };
    for (const [path, name] of [['workbuddy/desktop-client', 'WorkBuddyDesktopClient'], ['zcode/source', 'ZCodeSource'], ['antigravity/source', 'AntigravitySource']]) require('./dist/adapters/' + path + '.js')[name].prototype.listThreadPage = async function() { return { threads: [], nextCursor: null }; };
    const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/panel.html')); window.setSize(840, 820); window.show();
  }, { binary, thread: fixture.thread });
  if (sampleService) await sampleService.configure(panel);
  else await panel.evaluate(() => window.workpet.distillation('setImprovementPreference', { enabled: false }));
  await panel.reload(); await panel.locator('#tab-recent').click();
  await panel.locator(`[data-thread-id="${fixture.thread.id}"]`).getByRole('button', { name: '开始记录' }).click();
  await panel.locator('#back-to-list').waitFor();
  const dashboard = await panel.evaluate(() => window.workpet.getDashboard()), workId = dashboard.selectedWorkId;
  assert.ok(dashboard.selectedWork.state.constraints.some(i => i.text.includes('最早来源')));
  assert.ok(dashboard.selectedWork.state.constraints.some(i => i.text.includes('分页末尾')));
  assert.equal(dashboard.selectedWork.latestActivity.text, '已完成最后一页。下一步：确认完整来源。');
  const before = dashboard.selectedWork.eventCount;
  await panel.locator('#work-detail .state-item').filter({ hasText: '分页末尾' }).waitFor();
  await panel.screenshot({ path: join(output, 'complete-history.png') });
  const snapshot = await panel.evaluate(id => window.workpet.distillation('prepare', { workIds: [id], includedFileIds: [] }), workId);
  assert.ok(snapshot.sources[0].events.some(e => e.content.includes('最早来源')));
  assert.ok(snapshot.sources[0].events.some(e => e.content.includes('分页末尾')));
  report.checks.allPagesToStateAndExtraction = true;
  const reviewJob=process.env.WORKET_REVIEW_DRIFT === '1' ? await seedSourceReview(app,snapshot) : null;
  if(reviewJob) assert.equal(reviewJob.status,'AWAITING_REVIEW',reviewJob.error);
  if (sampleService) {
    const sample = await sampleService.sync(panel);
    assert.equal(sample.recordingView.ready, true);
    assert.ok(sample.recordingView.current.some(e => e.content.includes('最早来源')));
    assert.ok(sample.recordingView.current.some(e => e.content.includes('分页末尾')));
  }
  if (process.env.WORKET_RECORDING_IDLE === '1') {
    assert.ok(sampleService);
    const before = sampleService.metrics();
    await app.evaluate(({app}) => {
      const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json');
      const {RecordingCollection} = require('./dist/improvement/recording.js');
      const {ImprovementCollector} = require('./dist/improvement/collector.js');
      const {SqliteWorkCore} = require('./dist/core/work-core.js');
      const collect = RecordingCollection.prototype.collect, record = ImprovementCollector.prototype.record, getWork = SqliteWorkCore.prototype.getWork;
      globalThis.qaIdle = {depth:0,passes:0,snapshots:0,recordAttempts:0,totalMs:0};
      RecordingCollection.prototype.collect = function(...args) {
        const start=performance.now();globalThis.qaIdle.depth++;globalThis.qaIdle.passes++;
        try{return collect.apply(this,args);}finally{globalThis.qaIdle.depth--;globalThis.qaIdle.totalMs+=performance.now()-start;}
      };
      ImprovementCollector.prototype.record = function(...args) {if(globalThis.qaIdle.depth)globalThis.qaIdle.recordAttempts++;return record.apply(this,args);};
      SqliteWorkCore.prototype.getWork = function(...args) {if(globalThis.qaIdle.depth)globalThis.qaIdle.snapshots++;return getWork.apply(this,args);};
    });
    for(let n=0;n<40;n++) await panel.evaluate(() => window.workpet.distillation('syncImprovement'));
    report.idle = await app.evaluate(() => globalThis.qaIdle);
    assert.equal(report.idle.snapshots,0,'idle collection must not load full work snapshots');
    assert.equal(report.idle.recordAttempts,0,'idle collection must not retry every known message');
    assert.deepEqual(sampleService.metrics(),before,'idle collection sends no additional data');
    report.checks.idleSkipsArchiveAndQueue = true;
  }
  // The first page changes, but the second fails: no partial new observations may enter the record.
  fixture.mode = 'failure'; fixture.turns[0].items[0].content[0].text = '每次必须保留修订后的最早要求。'; writeFileSync(dataPath, JSON.stringify(fixture));
  const failure = await panel.evaluate(async id => { try { await window.workpet.refreshWork(id); return null; } catch(error) { return String(error); } }, workId);
  assert.match(failure, /synthetic second page failure/);
  let after = await panel.evaluate(id => window.workpet.getDashboard(id), workId);
  assert.equal(after.selectedWork.eventCount, before); assert.ok(!after.selectedWork.state.constraints.some(i => i.text.includes('修订后')));
  fixture.mode = 'normal'; writeFileSync(dataPath, JSON.stringify(fixture));
  await panel.evaluate(id => window.workpet.refreshWork(id), workId);
  after = await panel.evaluate(id => window.workpet.getDashboard(id), workId);
  assert.ok(after.selectedWork.state.constraints.some(i => i.text.includes('修订后')));
  report.checks.failedPageAtomicAndRetry = true;
  if (sampleService) {
    const sample = await sampleService.sync(panel);
    assert.equal(sample.recordingView.ready, true);
    assert.ok(sample.recordingView.current.some(e => e.content.includes('修订后')));
    assert.ok(!sample.recordingView.current.some(e => e.content.includes('最早来源')));
    assert.ok(sample.recordingView.messages.some(e => e.status === 'SUPERSEDED' && e.content.includes('最早来源')));
  }
  if (report.sourceAbsence) {
    const removed = fixture.turns.pop(); writeFileSync(dataPath, JSON.stringify(fixture));
    await panel.evaluate(id => window.workpet.refreshWork(id), workId);
    await panel.evaluate(id => window.workpet.refreshWork(id), workId);
    const absent = await panel.evaluate(id => window.workpet.getDashboard(id), workId);
    assert.ok(!absent.selectedWork.state.constraints.some(i => i.text.includes('分页末尾')));
    assert.ok(absent.selectedWork.sourceNotice);
    const snapshot = await panel.evaluate(id => window.workpet.distillation('prepare', { workIds: [id], includedFileIds: [] }), workId);
    assert.ok(!snapshot.sources[0].events.some(e => e.content.includes('分页末尾')));
    const bridge = JSON.parse(readFileSync(join(directory, 'bridge.json'), 'utf8'));
    const mcp = async name => {
      const response = await fetch(`http://${bridge.host}:${bridge.port}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-workpet-token': bridge.token }, body: JSON.stringify({ jsonrpc: '2.0', id: name, method: 'tools/call', params: { name, arguments: { work_id: workId } } }) });
      const result = await response.json(); assert.ok(!result.error); return JSON.parse(result.result.content[0].text);
    };
    const archive = await mcp('get_work_archive'), context = await mcp('get_work_context');
    const current = new Set(archive.currentEventIds);
    assert.ok(archive.events.some(e => e.content?.includes('分页末尾') && !current.has(e.id)));
    assert.ok(archive.events.some(e => e.kind === 'source.absent'));
    assert.ok(context.sourceNotice); assert.ok(!context.state.constraints.some(i => i.text.includes('分页末尾')));
    await panel.locator('#back-to-list').click(); await panel.locator(`[data-work-id="${workId}"]`).click();
    await panel.locator('.source-notice').waitFor(); await panel.screenshot({ path: join(output, 'source-absent.png') });
    if (sampleService) {
      const sample = await sampleService.sync(panel);
      assert.equal(sample.recordingView.ready, true);
      assert.ok(!sample.recordingView.current.some(e => e.content.includes('分页末尾')));
      assert.ok(sample.recordingView.messages.some(e => e.status === 'ABSENT' && e.content.includes('分页末尾')));
      const visible = await sampleService.inspect(app, output, 'admin-source-absent');
      assert.ok(visible.includes('修订后')); assert.ok(visible.includes('当前有效原文'));
      assert.ok(!visible.includes('每次必须保留分页末尾'));
    }
    if(reviewJob) {
      await panel.evaluate(async id=>(await import('./distillation.js')).openJob(id),reviewJob.id);
      await panel.locator('#source-review-notice').waitFor();
      await panel.locator('#source-review-notice summary').click();
      assert.match(await panel.locator('#source-review-notice').innerText(),/已不在当前来源/);
      assert.match(await panel.locator('#source-review-notice').innerText(),/每次必须检查分页末尾/);
      assert.ok(await panel.locator('#publish-definition').isDisabled());
      await panel.screenshot({path:join(output,'absent-source-review.png')});
      await panel.locator('[data-review-action="close"]').click();
      report.checks.absentEvidenceVisibleAndBlocked=true;
    }
    fixture.turns.push(removed); writeFileSync(dataPath, JSON.stringify(fixture));
    await panel.evaluate(id => window.workpet.refreshWork(id), workId);
    const restored = await panel.evaluate(id => window.workpet.getDashboard(id), workId);
    assert.ok(restored.selectedWork.state.constraints.some(i => i.text.includes('分页末尾')));
    assert.equal(restored.selectedWork.sourceNotice, undefined);
    report.checks.absenceArchiveCurrentViewAndRestoration = true;
    if(reviewJob) {
      const checked=await panel.evaluate(draftId=>window.workpet.distillation('sourceReview',{draftId}),reviewJob.draftId);
      assert.ok(!checked.changes.some(c=>c.status==='ABSENT'||c.status==='PENDING'));
      await panel.evaluate(async id=>(await import('./distillation.js')).openJob(id),reviewJob.id);
      await panel.locator('#source-review-confirm').check();await panel.locator('#publish-definition').click();await panel.locator('#use-definition').waitFor();
      report.checks.restoredEvidenceAndExplicitPublication=true;
    }
    if (sampleService) {
      const sample = await sampleService.sync(panel);
      assert.equal(sample.recordingView.ready, true);
      assert.ok(sample.recordingView.current.some(e => e.content.includes('分页末尾')));
      await sampleService.inspect(app, output, 'admin-source-restored');
      report.checks.remoteSampleRevisionAbsenceRestoration = true;
    }
  }

  const scale = Number(process.env.WORKET_RECORDING_SCALE ?? 0);
  if (scale) {
    assert.ok(sampleService && Number.isInteger(scale) && scale <= 1000);
    for (let n = 1; n <= scale; n++) {
      fixture.turns[0].items.push({ id: `scale-${n}`, type: 'userMessage', content: [{type:'text',text:`合成负载 ${n}：保持本期输入与通用约定分离。`}] });
      writeFileSync(dataPath, JSON.stringify(fixture));
      await panel.evaluate(id => window.workpet.refreshWork(id), workId);
      await sampleService.sync(panel, false);
      if (n % 100 === 0) console.log(`scale progress: ${n}/${scale}`);
    }
    const sample = await sampleService.sync(panel);
    assert.equal(sample.recordingView.ready, true);
    assert.equal(sample.recordingView.current.filter(e => e.content.startsWith('合成负载')).length, scale);
    const metrics = sampleService.metrics();
    report.scale = {...metrics, messages:scale, currentMessages:sample.recordingView.current.length, ready:true};
    assert.ok(metrics.uploadedBytes < scale * 1300 + 30000, 'upload must grow with changes, not full repeated history');
    await sampleService.inspect(app, output, 'admin-long-recording');
  }

  report.rpc = readFileSync(rpcLog, 'utf8').trim().split('\n').map(JSON.parse).map(r => ({ method: r.method, cursor: r.params?.cursor, includeTurns: r.params?.includeTurns, error: r.error }));
  assert.ok(report.rpc.some(r => r.method === 'thread/items/list' && r.cursor));
  report.status = 'PASSED';
} catch(error) { report.status = 'FAILED'; report.error = error instanceof Error ? error.message : String(error); if(panel) await panel.screenshot({path:join(output,'failure.png')}).catch(()=>{}); process.exitCode=1; }
finally { if(app) await app.close().catch(()=>{}); await sampleService?.close(); writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2)); console.log(JSON.stringify({ ...report, rpc: report.rpc ? { count: report.rpc.length } : undefined })); }
