// Real Electron/IPC/persistence with synthetic content and a recorded synthetic package read.
// No provider calls, external launch, or messages are sent.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { _electron as electron } from 'playwright';
import { createWorkCore } from '../dist/core/index.js';
import { seedWorkflow } from './lib/workflow-fixture.mjs';

const directory = mkdtempSync(join(tmpdir(), 'worket-map-qa-'));
const output = join(process.cwd(), 'output/workflow-maps', new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(output, { recursive: true });
const core = createWorkCore({ databasePath: join(directory, 'workpet.sqlite') }), w = core.workflows, { make } = seedWorkflow(core);
const port = (key, text) => ({ key, text, valueType: 'TEXT' });
const specs = [
  ['资料准备', ['客户简报'], ['需求清单', '品牌规范']],
  ['竞品调研', ['需求清单'], ['调研报告']],
  ['脚本编写', ['调研报告'], ['分镜脚本']],
  ['视频制作', ['分镜脚本'], ['视频成片']],
  ['封面设计', ['调研报告', '品牌规范'], ['封面图']],
  ['发布准备', ['视频成片', '封面图'], ['发布素材包']],
  ['最终交付', ['发布素材包'], ['视频 + 封面']],
];
const contracts = specs.map(([name, inputs, outputs]) => make(name, inputs.map((text, i) => port('i' + i, text)), outputs.map((text, i) => port('o' + i, text))));
const out = (nodeId, key = 'o0') => ({ type: 'OUTPUT', nodeId, key });
const bindings = [{ i0: { type: 'INPUT', key: 'brief' } }, { i0: out('n1') }, { i0: out('n2') }, { i0: out('n3') }, { i0: out('n2'), i1: out('n1', 'o1') }, { i0: out('n4'), i1: out('n5') }, { i0: out('n6') }];
const content = { name: '产品视频与封面交付', inputs: [{ ...port('brief', '客户简报'), required: true }], nodes: specs.map(([name], i) => ({ id: 'n' + (i + 1), name, contractId: contracts[i].id, bindings: bindings[i], after: [] })), outputs: [{ key: 'final', nodeId: 'n7', outputKey: 'o0' }] };
const definition = w.save({ content, commandId: randomUUID() });
const runId = w.create({ workflowId: definition.id, name: '产品 A · 秋季上新', inputs: { brief: '新品上市' }, commandId: randomUUID() });
const cmd = nodeId => ({ runId, nodeId, generation: w.run(runId).nodes[nodeId].at(-1).generation, expectedRevision: w.run(runId).revision, commandId: randomUUID() });
for (const nodeId of ['n1', 'n2', 'n3', 'n5']) {
  w.prepare(cmd(nodeId));
  const index = Number(nodeId.slice(1)) - 1;
  w.submit({ ...cmd(nodeId), outputs: Object.fromEntries(specs[index][2].map((text, i) => ['o' + i, text + '内容'])) });
  w.review({ ...cmd(nodeId), decision: 'PASS', criteria: { complete: 'PASS', correct: 'PASS' } });
}
const workId = w.prepare(cmd('n4')), handoff = core.createHandoffPackage(workId);
core.startExecutionEpisode(workId, { executor: { type: 'AGENT', name: 'QA' }, environment: { type: 'CODEX_DESKTOP', name: '合成测试' }, source: { adapter: 'codex', conversationId: 'pending:' + handoff.id }, endCurrentEpisode: true });
core.bindConversation(workId, 'codex', 'pending:' + handoff.id, 'qa-map-video');
assert.equal(core.recordPackageRead(workId, handoff.id), true);
assert.equal(w.detail(runId).phases.n4, '执行中');
const linearContract = make('标准步骤', [port('input', '上一项交付')], [port('result', '本项交付')]);
const linear = w.save({ content: { name: '十步线性流程', inputs: [{ ...port('start', '开始资料'), required: true }], nodes: Array.from({ length: 10 }, (_, i) => ({ id: 'l' + i, name: '第 ' + (i + 1) + ' 步', contractId: linearContract.id, bindings: { input: i ? out('l' + (i - 1), 'result') : { type: 'INPUT', key: 'start' } }, after: [] })), outputs: [{ key: 'final', nodeId: 'l9', outputKey: 'result' }] }, commandId: randomUUID() });
const long = make('很长的工作名称用于核对标题和状态不会互相重叠', [port('input', '一项很长的中文输入资料名称，应该自动换行，而且连线应继续连接到这一行的垂直中心')], [port('output', '这是一份很长的交付文件说明，需要在多行状态下保留底部留白')]);
const longDefinition = w.save({ content: { name: '长内容边界', inputs: [{ ...port('first', '本次资料'), required: true }], nodes: [{ id: 'long1', name: long.content.name, contractId: long.id, bindings: { input: { type: 'INPUT', key: 'first' } }, after: [] }, { id: 'long2', name: '接收交付', contractId: long.id, bindings: { input: out('long1', 'output') }, after: [] }], outputs: [{ key: 'final', nodeId: 'long2', outputKey: 'output' }] }, commandId: randomUUID() });
core.close();

let app, panel;
const errors = [], checks = {};
const screenshot = name => panel.screenshot({ path: join(output, name + '.png') });
const openDefinition = async id => {
  if (await panel.locator('#workflow-dialog').isVisible()) await panel.locator('#window-back').click();
  await panel.locator('[data-open-flow="' + id + '"]').click();
  await panel.locator('.wf-map-lines g').first().waitFor({ state: 'attached' });
};
try {
  app = await electron.launch({ executablePath: process.env.WORKPET_EXECUTABLE_PATH ?? join(process.cwd(), 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [...(process.env.WORKPET_EXECUTABLE_PATH ? [] : ['.']), '--user-data-dir=' + directory, '--dev'], cwd: process.cwd(), env: { ...process.env, WORKPET_DATA_DIR: directory, WORKPET_SKIP_INTEGRATIONS: '1', WORKPET_BRIDGE_CONFIG: join(directory, 'bridge.json') } });
  for (let i = 0; i < 100 && !panel; i++) { panel = app.windows().find(p => p.url().endsWith('/panel.html')); if (!panel) await new Promise(r => setTimeout(r, 100)); }
  assert.ok(panel); panel.on('pageerror', e => errors.push(e.message));
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/panel.html')); w.setSize(1464, 920); w.show(); });
  await panel.locator('#tab-workflows').click(); await openDefinition(definition.id);
  assert.equal(await panel.locator('.wf-map-card').count(), 7);
  assert.equal(await panel.locator('.wf-map-lines g').count(), 8);
  await panel.locator('[data-map-fit]').click(); await screenshot('01-definition');
  const positions = () => panel.locator('.wf-map-card').evaluateAll(cards => cards.map(c => [c.dataset.node, c.style.left, c.style.top]));
  const definedPositions = await positions();
  await panel.evaluate(async runId => { const { openWorkflowRun } = await import('./workflows.js'); await openWorkflowRun(runId); }, runId);
  await panel.locator('[data-map-fit]').click(); await screenshot('02-runtime');
  assert.deepEqual(await positions(), definedPositions);
  assert.equal(await panel.locator('.wf-map-card.done').count(), 4);
  assert.equal(await panel.locator('.wf-map-card.running').count(), 1);
  assert.equal(await panel.locator('[data-node="n6"] .wf-map-row.filled').count(), 1);
  assert.equal(await panel.locator('.wf-map-flow-head').count(), 1);
  checks.realStatesPartialJoinAndStableCoordinates = true;
  // The two keyframe layers share the 3.2s timeline from Figma. Check travel, reset and reduced motion.
  const flow = panel.locator('.wf-map-flow-head');
  const sample = ms => flow.evaluate((e, ms) => { e.getAnimations().forEach(a => { a.pause(); a.currentTime = ms; }); return { dash: getComputedStyle(e).strokeDashoffset, opacity: getComputedStyle(e).opacity }; }, ms);
  const early = await sample(100), middle = await sample(500), rest = await sample(1000);
  assert.notEqual(early.dash, middle.dash); assert.equal(rest.opacity, '0');
  await panel.emulateMedia({ reducedMotion: 'reduce' }); assert.equal(await flow.evaluate(e => getComputedStyle(e).display), 'none');
  await panel.emulateMedia({ reducedMotion: 'no-preference' }); checks.motionAndReducedMotion = true;
  await panel.locator('[data-node="n4"]').click(); await panel.locator('#wf-submit').waitFor();
  await panel.locator('#wf-close-inspector').click();
  assert.equal(await panel.locator('[data-node="n4"]').evaluate(e => document.activeElement === e), true);
  await panel.locator('#wf-pause').click(); assert.equal(await panel.locator('.wf-map-flow-head').count(), 0);
  checks.selectionFocusAndPause = true;
  await openDefinition(linear.id); await panel.locator('[data-map-fit]').click(); await screenshot('03-linear-ten');
  assert.equal(await panel.locator('.wf-map-lines g').count(), 9); checks.tenStepFold = true;
  await openDefinition(longDefinition.id); await panel.locator('[data-map-reset]').click(); await screenshot('04-long-content');
  const geometry = await panel.locator('[data-node="long1"]').evaluate(card => ({ width: card.offsetWidth, rows: [...card.querySelectorAll('[data-port]')].map(r => ({ key: r.dataset.port, center: card.offsetTop + r.offsetTop + r.offsetHeight / 2, width: r.offsetWidth })) }));
  assert.equal(geometry.width, 208); assert.ok(geometry.rows.every(r => r.width === 184));
  const pathStart = await panel.locator('.wf-map-lines g > path').first().getAttribute('d');
  assert.equal(Number(pathStart.match(/^M[\d.]+ ([\d.]+)/)[1]), geometry.rows.find(r => r.key === 'output:output').center);
  checks.wrappedPortGeometry = true;
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/panel.html')).setSize(410, 660));
  await screenshot('05-narrow');
  assert.equal(await panel.locator('.wf-page').evaluate(e => e.scrollWidth <= e.clientWidth), true);
  await panel.locator('[data-map-zoom="-1"]').click(); assert.equal(await panel.locator('[data-map-reset]').textContent(), '90%');
  checks.narrowAndZoom = true;
  assert.deepEqual(errors, []);
} finally {
  writeFileSync(join(output, 'report.json'), JSON.stringify({ status: Object.keys(checks).length === 6 ? 'PASSED' : 'INCOMPLETE', synthetic: true, externalAgent: false, checks, errors, directory }, null, 2));
  console.log(JSON.stringify({ output, checks, errors })); await app?.close();
}
