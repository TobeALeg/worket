// End-to-end desktop checks against real Electron, IPC, SQLite, files and graceful restart.
// External launchers/provider and response timing are controlled; no real task is sent.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright';
import { createWorkCore } from '../dist/core/index.js';
import { seedWorkflow } from './lib/workflow-fixture.mjs';

const output = join(process.cwd(), 'output/workflow-workspace', new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(output, { recursive: true });
const directory = mkdtempSync(join(tmpdir(), 'worket-workspace-')), databasePath = join(directory, 'workpet.sqlite'), file = join(directory, '品牌.md');
writeFileSync(file, '本轮品牌资料');
const cid = () => randomUUID();
let core = createWorkCore({ databasePath });
const seed = seedWorkflow(core), w = core.workflows;
const content = { name: '独立运行验证', inputs: seed.content.inputs, nodes: ['a', 'b'].map(id => ({ id, name: id === 'a' ? '调研甲' : '调研乙', contractId: seed.research.id, bindings: { brand: { type: 'INPUT', key: 'brand' } }, after: [] })), outputs: [{ key: 'final', nodeId: 'a', outputKey: 'report' }] };
const v1 = w.save({ content, commandId: cid() }), v2 = w.save({ content: { ...content, name: '独立运行验证' }, baseId: v1.id, commandId: cid() });
const command = (runId, nodeId) => { const run = w.run(runId); return { runId, nodeId, generation: run.nodes[nodeId].at(-1).generation, expectedRevision: run.revision, commandId: cid() }; };
function create(name, definition = v1, submitted = true) {
  const id = w.create({ workflowId: definition.id, name, inputs: { brand: file }, commandId: cid() });
  if (submitted) for (const nodeId of ['a', 'b']) { w.prepare(command(id, nodeId)); w.submit({ ...command(id, nodeId), outputs: { report: file } }); }
  return id;
}
const runA = create('客户甲 · 待验收'), runB = create('客户乙 · 待验收'), runC = create('客户丙 · 新版本', v2), ready = create('客户丁 · 开展等待', v1, false);
for (let i = 0; i < 51; i++) create(`分页任务 ${String(i).padStart(2, '0')}`, v1, false);
core.close();
let app, panel;
const errors = [];
const report = { status: 'RUNNING', directory, packaged: !!process.env.WORKPET_EXECUTABLE_PATH, synthetic: true, externalAgent: false, localUnitTests: false, checks: {}, screenshots: [] };
const root = () => panel.locator('#workflow-dialog'), step = () => panel.locator('#workflow-step-dialog');
const api = (action, input = {}) => panel.evaluate(({ action, input }) => window.workpet.workflow(action, input), { action, input });
const get = id => api('detail', { runId: id });
const nodeCommand = (d, nodeId) => ({ runId: d.run.id, nodeId, generation: d.run.nodes[nodeId].at(-1).generation, expectedRevision: d.run.revision, commandId: cid() });
async function until(check, message) { const deadline = Date.now() + 15000; while (Date.now() < deadline) { if (await check()) return; await new Promise(r => setTimeout(r, 50)); } throw new Error(message); }
async function screenshot(name) { const path = join(output, `${name}.png`); await panel.screenshot({ path }); report.screenshots.push(path); }
async function launch() {
  app = await electron.launch({ executablePath: process.env.WORKPET_EXECUTABLE_PATH ?? join(process.cwd(), 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [...(process.env.WORKPET_EXECUTABLE_PATH ? ['--use-mock-keychain'] : ['.']), `--user-data-dir=${directory}`, '--dev'], cwd: process.cwd(), env: { ...process.env, WORKPET_DATA_DIR: directory, WORKPET_BRIDGE_CONFIG: join(directory, 'bridge.json'), WORKPET_SKIP_INTEGRATIONS: '1' } });
  await until(async () => { panel = app.windows().find(p => p.url().endsWith('/panel.html')); return !!panel; }, 'Panel did not open');
  panel.setDefaultTimeout(15000); panel.on('pageerror', error => errors.push(error.message));
  await app.evaluate(({ app, BrowserWindow, dialog }, file) => {
    const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json');
    require('./dist/ai-service/client.js').WorketAIClient.prototype.continuation = async () => { throw new Error('QA_PROVIDER_DISABLED'); };
    require('./dist/adapters/workbuddy/launcher.js').ElectronWorkBuddyLauncher.prototype.openNewConversation = async () => 'opened';
    require('./dist/adapters/workbuddy/desktop-client.js').WorkBuddyDesktopClient.prototype.inspect = async () => {};
    require('./dist/adapters/workbuddy/desktop-client.js').WorkBuddyDesktopClient.prototype.readThread = async threadId => ({ threadId, title: '工作流桌面验证', cwd: '/tmp', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), events: [] });
    const proto = require('./dist/workflows/desktop.js').WorkflowDesktop.prototype, original = proto.call;
    globalThis.workflowQaTiming = { preview: false, dispatch: false, queries: false, waiting: [], dispatchDone: false };
    proto.call = async function(action, input) {
      const timing = globalThis.workflowQaTiming;
      if (action === 'previewOutput' && timing.preview || action === 'queryRuns' && timing.queries) await new Promise(resolve => timing.waiting.push(resolve));
      const result = await original.call(this, action, input);
      if (action === 'dispatch' && timing.dispatch) { timing.dispatchDone = true; await new Promise(resolve => timing.waiting.push(resolve)); }
      return result;
    };
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/panel.html')); window.setSize(1440, 1000); window.show();
  }, file);
  await panel.evaluate(() => window.workpet.distillation('setImprovementPreference', { enabled: false }));
  await panel.locator('#tab-workflows').click();
}
async function release() { await app.evaluate(() => { const q = globalThis.workflowQaTiming; q.preview = false; q.dispatch = false; q.queries = false; q.waiting.splice(0).forEach(resolve => resolve()); }); }
async function open(id) {
  if (await root().isVisible() && !await root().locator('#wf-workspace').isVisible()) await panel.locator('#window-back').click();
  if (!await root().isVisible()) await panel.locator('#wf-open-workspace').click(); else await root().locator('#wf-workspace').click();
  await root().locator('#wf-query-search').fill((await get(id)).run.name);
  await root().locator(`[data-open-run="${id}"]`).click(); await root().locator('#wf-switch-run').waitFor();
}
async function select(id) { await root().locator(`[data-node="${id}"]`).click(); }
try {
  await launch();
  // Editing remains a document even before it is valid as an executable workflow.
  await panel.locator('#wf-new').click(); await root().locator('#wf-name').fill('未完成但可恢复的流程');
  await root().locator('#wf-contract').selectOption(seed.research.id); await root().locator('#wf-add-node').click();
  await root().locator('#wf-library').click();
  const connectedDraft = (await api('drafts')).find(d => d.name === '未完成但可恢复的流程'); assert.ok(connectedDraft);
  await panel.locator(`[data-open-draft="${connectedDraft.id}"]`).click(); assert.equal(await root().locator('[data-node]').count(), 1);
  await root().locator('#wf-name').fill('空流程仍可保存草稿');
  for (const node of await root().locator('[data-node]').all()) { await node.click(); await root().locator('#wf-remove-node').click(); }
  await root().locator('#wf-save').click(); await root().locator('[role="alert"]').filter({ hasText: /./ }).waitFor();
  await root().locator('#wf-library').click();
  const draft = (await api('drafts')).find(d => d.name === '空流程仍可保存草稿'); assert.ok(draft);
  await panel.locator(`[data-open-draft="${draft.id}"]`).click(); assert.equal(await root().locator('#wf-name').inputValue(), draft.name);
  await panel.locator('#app-menu > summary').click(); await panel.locator('#service-settings').click();
  await panel.locator('#definition-dialog').waitFor({ state: 'visible' }); await panel.locator('#window-back').click();
  await panel.locator('#definition-dialog').waitFor({ state: 'hidden' });
  await root().locator('#wf-name').fill('从服务设置返回后继续编辑');
  await until(async () => (await api('draft', { id: draft.id })).content.name === '从服务设置返回后继续编辑', 'Returning from settings disabled draft saving');
  report.checks.settingsOverlayPreservesEditableDraft = true;
  const original = await api('draft', { id: draft.id });
  await api('saveDraft', { id: draft.id, expectedRevision: original.revision, content: { ...original.content, name: '另一个页面的修改' }, selectedNode: '' });
  await root().locator('#wf-name').fill('本页输入保留'); await root().locator('#wf-library').click();
  assert.equal(await root().locator('#wf-name').inputValue(), '本页输入保留'); await root().locator('#wf-draft-status').filter({ hasText: '保存失败' }).waitFor();
  await root().locator('#wf-save-copy').click(); await root().locator('#wf-draft-status').filter({ hasText: '草稿已保存' }).waitFor();
  await screenshot('01-draft-conflict-recovered');
  await root().locator('#wf-name').fill('退出前最后输入'); await app.close(); app = undefined;
  await launch(); const recovered = (await api('drafts')).find(d => d.name === '退出前最后输入'); assert.ok(recovered);
  await panel.locator(`[data-open-draft="${recovered.id}"]`).click(); assert.equal(await root().locator('#wf-name').inputValue(), '退出前最后输入');
  await root().locator('#wf-discard').click(); await step().locator('#wf-confirm-discard').click(); await step().waitFor({ state: 'hidden' });
  assert.equal((await api('drafts')).some(d => d.id === recovered.id), false);
  assert.ok((await api('drafts')).some(d => d.name === '另一个页面的修改'));
  report.checks.incompleteDraftConflictCopyAndGracefulQuit = true;

  await open(runA); await app.evaluate(() => { globalThis.workflowQaTiming.preview = true; });
  await root().locator('#wf-review').click(); await until(() => app.evaluate(() => globalThis.workflowQaTiming.waiting.length > 0), 'Preview was not delayed');
  await select('b'); await release(); await new Promise(r => setTimeout(r, 150));
  assert.equal(await step().isVisible(), false); assert.equal(await root().locator('[data-node].selected').getAttribute('data-node'), 'b');
  assert.equal((await get(runA)).run.nodes.a.at(-1).phase, 'SUBMITTED'); assert.equal((await get(runA)).run.nodes.b.at(-1).phase, 'SUBMITTED');
  report.checks.delayedPreviewDoesNotFollowNodeSelection = true;
  await root().locator('#wf-switch-run').selectOption(runB); await root().locator(`[data-node="a"].selected`).waitFor();
  await root().locator('#wf-switch-run').selectOption(runA); await root().locator(`[data-node="b"].selected`).waitFor();
  assert.ok((await root().locator('#wf-switch-run option').allTextContents()).some(text => text.includes('客户丙') && text.includes('v2')));
  await screenshot('02-run-switch-remembers-node'); report.checks.crossVersionSwitchRemembersEachNode = true;

  await select('a'); await root().locator('#wf-review').click(); await step().locator('#wf-review-note').fill('核对后保留这条意见');
  for (const check of await step().locator('[data-criterion]').all()) await check.check();
  await api('rework', { ...nodeCommand(await get(runA), 'b'), note: '另一节点发生变更' });
  await step().locator('#wf-approve').click(); await step().locator('[role="alert"]').filter({ hasText: /REVISION|变化|更新/ }).waitFor();
  assert.equal(await step().locator('#wf-review-note').inputValue(), '核对后保留这条意见'); assert.equal(await step().locator('[data-criterion]:checked').count(), 2);
  assert.equal((await get(runA)).run.nodes.a.at(-1).phase, 'SUBMITTED');
  await step().locator('#wf-close-step').click(); await root().locator('#wf-refresh').click(); await root().locator('#wf-review').click();
  for (const check of await step().locator('[data-criterion]').all()) await check.check();
  await step().locator('#wf-approve').evaluate(button => { button.click(); button.click(); }); await step().waitFor({ state: 'hidden' });
  assert.equal((await get(runA)).run.events.filter(e => e.type === 'ACCEPTED' && e.nodeId === 'a').length, 1);
  report.checks.conflictPreservesReviewAndDuplicateClickAcceptsOnce = true;

  await root().locator('#wf-pending').click(); await root().locator(`[data-review-run="${runB}"][data-review-node="a"]`).waitFor();
  assert.equal(await root().locator(`[data-review-run="${runA}"]`).count(), 0);
  await screenshot('03-concentrated-review');
  await root().locator(`[data-review-run="${runB}"][data-review-node="a"]`).click();
  await step().locator('#wf-step-title').filter({ hasText: '验收交付' }).waitFor();
  assert.ok((await step().innerText()).includes('客户乙')); assert.ok((await step().innerText()).includes('调研甲'));
  for (const check of await step().locator('[data-criterion]').all()) await check.check();
  await step().locator('#wf-approve').click(); await step().waitFor({ state: 'hidden' });
  await root().locator('#wf-pending').click(); await root().locator(`[data-review-run="${runB}"][data-review-node="b"]`).waitFor();
  assert.equal(await root().locator(`[data-review-run="${runB}"][data-review-node="a"]`).count(), 0);
  assert.equal((await get(runC)).run.nodes.a.at(-1).phase, 'SUBMITTED'); report.checks.pendingReviewTargetsCurrentGenerationAndRun = true;

  await root().locator('#wf-workspace').click(); await root().locator('#wf-query-more').waitFor({ state: 'visible' });
  await root().locator('#wf-query-more').click(); await until(async () => await root().locator('[data-open-run]').count() >= 55, 'Pagination did not include all runs');
  await root().locator('#wf-query-search').fill('客户'); await until(async () => await root().locator('[data-open-run]').count() === 4, 'Search did not filter');
  await root().locator('#wf-query-flow').selectOption(v1.key); await root().locator('#wf-query-status').selectOption('RUNNING');
  await until(async () => await root().locator('[data-open-run]').count() === 4, 'Family filter lost v1 or v2');
  await screenshot('04-cross-version-run-workspace');
  await app.evaluate(() => { globalThis.workflowQaTiming.queries = true; }); await root().locator('#wf-query-search').fill('客户甲');
  await until(() => app.evaluate(() => globalThis.workflowQaTiming.waiting.length > 0), 'Query was not delayed');
  await root().locator('#wf-query-search').fill('客户乙'); await app.evaluate(() => { globalThis.workflowQaTiming.queries = false; });
  await root().locator(`[data-open-run="${runB}"]`).waitFor(); await release();
  await until(async () => await root().locator('[data-open-run]').count() === 1, 'Old query replaced current filter'); assert.equal(await root().locator(`[data-open-run="${runA}"]`).count(), 0);
  report.checks.filtersPaginationAndStaleQueryIsolation = true;

  await open(ready); await app.evaluate(() => { globalThis.workflowQaTiming.dispatch = true; });
  await root().locator('#wf-start').click(); await panel.locator('.executor-options button').filter({ hasText: /^WorkBuddy$/ }).click();
  await until(() => app.evaluate(() => globalThis.workflowQaTiming.dispatchDone), 'Dispatch did not finish backend');
  await root().locator('#wf-workspace').click(); await root().locator('#wf-query-results').waitFor(); await release(); await new Promise(r => setTimeout(r, 150));
  assert.equal(await root().getByRole('heading', { name: '所有运行', exact: true }).count(), 1);
  assert.ok((await get(ready)).run.nodes.a.at(-1).workId); report.checks.completedDispatchDoesNotReopenOldPage = true;

  // Inspect practical layout at the app's normal compact size as well as the full-page view.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/panel.html')).setSize(600, 800));
  await screenshot('05-compact-workspace');
  report.viewport = await panel.evaluate(() => ({ width: innerWidth, height: innerHeight, documentOverflowX: document.documentElement.scrollWidth > innerWidth, controls: [...document.querySelectorAll('.wf-filters input,.wf-filters select')].map(e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }) }));
  assert.equal(report.viewport.documentOverflowX, false);
  assert.ok(report.viewport.controls.every(r => r.left >= 0 && r.right <= report.viewport.width));
  report.checks.compactViewport = true;
  await open(runC);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/panel.html')).setSize(400, 660));
  await root().locator('#wf-switch-run').waitFor(); await screenshot('06-normal-width-run-switch');
  report.normalViewport = await panel.evaluate(() => {
    const r = document.querySelector('#wf-run-switch').getBoundingClientRect(), page = document.querySelector('.wf-page');
    return { width: innerWidth, height: innerHeight, switchLeft: r.left, switchRight: r.right, switchTop: r.top, switchBottom: r.bottom, pageOverflowX: page.scrollWidth > page.clientWidth };
  });
  assert.ok(report.normalViewport.switchLeft >= 0 && report.normalViewport.switchRight <= report.normalViewport.width);
  assert.ok(report.normalViewport.switchTop >= 0 && report.normalViewport.switchBottom <= report.normalViewport.height);
  assert.equal(report.normalViewport.pageOverflowX, false);
  report.checks.normalWidthSwitcher = true;
  assert.deepEqual(errors, []); report.status = 'PASSED';
} catch (error) {
  report.status = 'FAILED'; report.error = String(error.stack ?? error); if (panel) await screenshot('failure').catch(() => {}); throw error;
} finally {
  report.rendererErrors = errors; writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ output, ...report }, null, 2));
  await release().catch(() => {}); await app?.close().catch(() => {});
}
