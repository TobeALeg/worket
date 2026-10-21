// Real Electron UI + persistence + fixed files; only external launcher/history are synthetic.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { _electron as electron } from 'playwright';
import { createWorkCore } from '../dist/core/index.js';
import { seedWorkflow } from './lib/workflow-fixture.mjs';
const stamp = new Date().toISOString().replace(/[:.]/g, '-'), output = join(process.cwd(), 'output/workflows', stamp);
mkdirSync(output, { recursive: true });
const directory = mkdtempSync(join(tmpdir(), 'worket-workflows-ui-')), file = join(directory, '本轮交付.md'), databasePath = join(directory, 'workpet.sqlite');
let core = createWorkCore({ databasePath }); const seed = seedWorkflow(core); core.close();
const report = { status: 'RUNNING', packaged: !!process.env.WORKPET_EXECUTABLE_PATH, synthetic: true, externalAgent: false, preparationProvider: 'controlled-unavailable', actualProviderCalls: 0, directory, checks: {} };
let app, panel;
const errors = [];
async function launch() {
  app = await electron.launch({ executablePath: process.env.WORKPET_EXECUTABLE_PATH ?? join(process.cwd(), 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [...(process.env.WORKPET_EXECUTABLE_PATH ? ['--use-mock-keychain'] : ['.']), `--user-data-dir=${directory}`, '--dev'], cwd: process.cwd(), env: { ...process.env, WORKPET_DATA_DIR: directory, WORKPET_BRIDGE_CONFIG: join(directory, 'bridge.json'), WORKPET_SKIP_INTEGRATIONS: '1' } });
  const until = Date.now() + 15000; panel = undefined;
  while (!panel && Date.now() < until) { panel = app.windows().find(p => p.url().endsWith('/panel.html')); if (!panel) await new Promise(r => setTimeout(r, 100)); }
  assert.ok(panel); panel.setDefaultTimeout(15000); panel.on('pageerror', e => errors.push(e.message));
  await app.evaluate(({ app, BrowserWindow, dialog }, file) => {
    const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json');
    const { WorketAIClient } = require('./dist/ai-service/client.js');
    // Exercise the production unresolved-state path without contacting a live model service.
    WorketAIClient.prototype.continuation = async function() { throw new Error('QA_PROVIDER_DISABLED'); };
    const { ElectronWorkBuddyLauncher } = require('./dist/adapters/workbuddy/launcher.js'); const { WorkBuddyDesktopClient } = require('./dist/adapters/workbuddy/desktop-client.js');
    globalThis.workflowQaLinks = [];
    ElectronWorkBuddyLauncher.prototype.openNewConversation = async function(url) { globalThis.workflowQaLinks.push(url); return 'opened'; };
    WorkBuddyDesktopClient.prototype.inspect = async function() {};
    WorkBuddyDesktopClient.prototype.readThread = async function(threadId) { return { threadId, title: '工作流合成执行', cwd: '/tmp', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), events: [] }; };
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/panel.html')); w.setSize(1440, 1000); w.show();
  }, file);
  await panel.evaluate(() => window.workpet.distillation('setImprovementPreference', { enabled: false }));
}
const api = (action, input = {}) => panel.evaluate(({ action, input }) => window.workpet.workflow(action, input), { action, input });
const root = () => panel.locator('#workflow-dialog'), step = () => panel.locator('#workflow-step-dialog');
const detail = () => api('detail', { runId: currentRun });
let currentRun, firstRun, secondRun, workflowId, nodes;
async function add(contract) { await root().locator('#wf-contract').selectOption(contract.id); await root().locator('#wf-add-node').click(); await root().getByRole('heading', { name: contract.content.name, exact: true }).waitFor(); const current = root().locator('[data-node].selected'); return current.getAttribute('data-node'); }
async function connect(input, upstream, output) {
  await root().locator(`[data-bind-input="${input}"]`).click();
  const label = await step().locator('#wf-source option').allTextContents(); const chosen = label.find(text => text.startsWith(`${upstream} → ${output} ·`)); assert.ok(chosen, label.join('\n'));
  await step().locator('#wf-source').selectOption({ label: chosen }); await step().locator('#wf-save-binding').click(); await step().waitFor({ state: 'hidden' });
}
async function newRun(name, content) {
  writeFileSync(file, content); await root().locator('#wf-new-run').click(); await step().locator('#wf-run-name').fill(name);
  await step().locator('[data-file]').click(); await step().locator('#wf-create-run').click(); await step().waitFor({ state: 'hidden' });
  const all = await api('runs', { workflowId }); currentRun = all.find(d => d.run.name === name).run.id; return currentRun;
}
async function select(nodeId) { await root().locator(`[data-node="${nodeId}"]`).click(); }
async function start(nodeId) {
  await select(nodeId); await root().locator('#wf-start').click(); await panel.locator('.executor-options button').filter({ hasText: /^WorkBuddy$/ }).click();
  await root().locator('#wf-submit').waitFor();
  const d = await detail(); return d.run.nodes[nodeId].at(-1).workId;
}
async function submit(nodeId, content, text = '本轮封面文案') {
  writeFileSync(file, content); await select(nodeId); await root().locator('#wf-submit').click();
  for (const b of await step().locator('[data-file]').all()) await b.click();
  for (const field of await step().locator('textarea[data-value]').all()) await field.fill(text);
  await step().locator('#wf-submit-outputs').click(); await step().waitFor({ state: 'hidden' }); await root().locator('#wf-review').waitFor();
}
async function accept(nodeId) {
  await select(nodeId); await root().locator('#wf-review').click();
  for (const c of await step().locator('[data-criterion]').all()) await c.check();
  await step().locator('#wf-approve').click(); await step().waitFor({ state: 'hidden' });
}
async function finish(nodeId, content, text) { await start(nodeId); await submit(nodeId, content, text); await accept(nodeId); }
try {
  await launch(); await panel.locator('#tab-workflows').click(); await panel.locator('#wf-new').click(); await root().locator('#wf-name').fill('内容制作');
  const research = await add(seed.research), script = await add(seed.script); await connect('report', '主题调研', 'report');
  const video = await add(seed.video);
  await root().locator('[data-bind-input="script"]').click(); const wrong = (await step().locator('#wf-source option').allTextContents()).find(t => t.startsWith('脚本撰写 → copy ·'));
  await step().locator('#wf-source').selectOption({ label: wrong }); await step().locator('#wf-save-binding').click(); await step().locator('[role="alert"]').filter({ hasText: '类型不匹配' }).waitFor();
  await step().locator('#wf-source').selectOption({ label: '脚本撰写 → script · FILE' }); await step().locator('#wf-save-binding').click(); await step().waitFor({ state: 'hidden' });
  const cover = await add(seed.cover); await connect('copy', '脚本撰写', 'copy');
  const pack = await add(seed.pack); await connect('video', '视频制作', 'video'); await connect('image', '封面制作', 'image'); nodes = { research, script, video, cover, pack };
  await root().locator('#wf-save').click(); await root().locator('#wf-new-run').waitFor(); workflowId = (await api('catalog')).definitions[0].id;
  await panel.screenshot({ path: join(output, '01-contract-connections.png') }); report.checks.builderAndTypeMismatch = true;
  firstRun = await newRun('山海咖啡 · 新品短片', '山海品牌资料'); await root().locator('#wf-all-runs').click(); secondRun = await newRun('木野户外 · 秋季上新', '木野品牌资料');
  await root().locator('#wf-all-runs').click(); await root().locator(`[data-open-run="${firstRun}"]`).click(); currentRun = firstRun;
  await finish(research, '山海调研报告'); await start(script); await submit(script, '脚本 v1');
  await root().locator('#wf-review').click(); await step().locator('pre').filter({ hasText: '脚本 v1' }).waitFor(); await step().locator('#wf-approve').click(); await step().locator('[role="alert"]').filter({ hasText: '确认全部要求' }).waitFor();
  await step().locator('[data-criterion="complete"]').check(); await step().locator('#wf-review-note').fill('开头突出当季新品，保留中段和品牌片尾'); await step().locator('#wf-reject').click(); await step().waitFor({ state: 'hidden' });
  assert.equal((await detail()).run.nodes[script].length, 2); await finish(script, '脚本 v2', '桂花拿铁新品文案');
  await start(video); await start(cover); const before = await detail();
  assert.equal(before.run.nodes[video].at(-1).adopted[0].generation, 2);
  assert.notEqual(before.run.nodes[video].at(-1).directory, before.run.nodes[cover].at(-1).directory);
  await panel.screenshot({ path: join(output, '02-parallel-work.png') });
  await submit(video, '山海成片'); await accept(video); assert.equal((await detail()).run.nodes[pack].at(-1).phase, 'WAITING');
  await submit(cover, '山海封面'); await accept(cover); await finish(pack, '山海交付包'); assert.equal((await detail()).run.status, 'COMPLETED');
  report.checks.rejectionResubmissionParallelJoin = true;
  await select(script); await root().locator('#wf-rework').click(); await step().locator('#wf-rework-note').fill('增加门店使用场景'); await step().locator('#wf-confirm-rework').click(); await step().waitFor({ state: 'hidden' });
  await finish(script, '脚本 v3', '使用场景文案');
  assert.ok((await detail()).updates[script]); await root().locator(`[data-adopt-source="${script}"]`).click();
  await step().locator('#wf-confirm-adopt').filter({ hasText: '3 步' }).waitFor(); await panel.screenshot({ path: join(output, '03-rework-scope.png') });
  await step().locator('#wf-confirm-adopt').click(); await step().waitFor({ state: 'hidden' });
  const updated = await detail(); assert.equal(updated.run.nodes[research].length, 1); assert.equal(updated.run.nodes[video].length, 2);
  const videoWork = await start(video); writeFileSync(file, '经本机 MCP 提交的新一轮成片');
  const bridge = JSON.parse(readFileSync(join(directory, 'bridge.json'), 'utf8'));
  const response = await fetch(`http://${bridge.host}:${bridge.port}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-workpet-token': bridge.token }, body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method: 'tools/call', params: { name: 'submit_workflow_outputs', arguments: { work_id: videoWork, command_id: randomUUID(), outputs: { video: file } } } }), signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200); const submitted = await response.json(); assert.ok(submitted.result, JSON.stringify(submitted));
  await root().locator('#wf-review').waitFor(); await accept(video); report.checks.authenticatedMcpSubmissionAndTextPreview = true;
  await finish(cover, '新一轮封面'); await finish(pack, '新一轮交付包');
  const other = await api('detail', { runId: secondRun }); assert.equal(other.run.status, 'RUNNING'); assert.equal(other.run.nodes[research].at(-1).phase, 'READY');
  assert.equal(readFileSync(Object.values(other.run.inputs)[0], 'utf8'), '木野品牌资料'); report.checks.adoptOnlyThreeDescendantsAndOtherRunUntouched = true;
  await root().locator('#wf-all-runs').click(); await panel.screenshot({ path: join(output, '04-independent-runs.png') });
  await app.close(); await launch(); await panel.locator('#tab-workflows').click(); await panel.locator(`[data-open-flow="${workflowId}"]`).click(); await root().locator('#wf-runs').click();
  await root().locator(`[data-open-run="${firstRun}"]`).click(); currentRun = firstRun; const restarted = await detail();
  assert.equal(restarted.run.status, 'COMPLETED'); assert.equal(restarted.run.nodes[script].length, 3); report.checks.restartPreservesGenerationsAndCompletion = true;
  assert.deepEqual(errors, []); report.status = 'PASSED'; report.firstRun = firstRun; report.secondRun = secondRun; report.workflowId = workflowId;
} catch (error) { report.status = 'FAILED'; report.error = String(error.stack ?? error); if (panel) await panel.screenshot({ path: join(output, 'failure.png') }).catch(() => {}); throw error; }
finally { report.rendererErrors = errors; writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ output, ...report }, null, 2)); await app?.close().catch(() => {}); }
