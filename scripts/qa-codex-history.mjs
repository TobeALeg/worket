import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { _electron as electron } from 'playwright';
import { historyFixture, writeHistoryFixture } from './lib/codex-history-fixture.mjs';
const run = new Date().toISOString().replace(/[:.]/g, '-'), output = join(process.cwd(), 'output/codex-history', run); mkdirSync(output, { recursive: true });
const directory = mkdtempSync(join(tmpdir(), 'worket-history-e2e-')), fixture = historyFixture();
const { dataPath, rpcLog, binary } = writeHistoryFixture(directory, fixture);
const report = { run, status: 'RUNNING', packaged: !!process.env.WORKPET_EXECUTABLE_PATH, directory, actualProviderCalls: 0, externalAgent: false, sourceAbsence: process.env.WORKET_SOURCE_ABSENCE === '1', checks: {} };
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
  await panel.evaluate(() => window.workpet.distillation('setImprovementPreference', { enabled: false }));
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
    fixture.turns.push(removed); writeFileSync(dataPath, JSON.stringify(fixture));
    await panel.evaluate(id => window.workpet.refreshWork(id), workId);
    const restored = await panel.evaluate(id => window.workpet.getDashboard(id), workId);
    assert.ok(restored.selectedWork.state.constraints.some(i => i.text.includes('分页末尾')));
    assert.equal(restored.selectedWork.sourceNotice, undefined);
    report.checks.absenceArchiveCurrentViewAndRestoration = true;
  }

  report.rpc = readFileSync(rpcLog, 'utf8').trim().split('\n').map(JSON.parse).map(r => ({ method: r.method, cursor: r.params?.cursor, includeTurns: r.params?.includeTurns, error: r.error }));
  assert.ok(report.rpc.some(r => r.method === 'thread/items/list' && r.cursor));
  report.status = 'PASSED';
} catch(error) { report.status = 'FAILED'; report.error = error instanceof Error ? error.message : String(error); if(panel) await panel.screenshot({path:join(output,'failure.png')}).catch(()=>{}); process.exitCode=1; }
finally { if(app) await app.close().catch(()=>{}); writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2)); console.log(JSON.stringify(report)); }
