// Real Electron + isolated SQLite; no external executor or user data is used.
import assert from 'node:assert/strict';
import { randomUUID as cid } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright';
import { createWorkCore } from '../dist/core/index.js';
import { seedWorkflow } from './lib/workflow-fixture.mjs';

const directory = mkdtempSync(join(tmpdir(), 'worket-overview-'));
const output = join(process.cwd(), 'output/list-overview'); mkdirSync(output, { recursive: true });
const file = join(directory, 'source.md'); writeFileSync(file, '隔离测试资料');
const core = createWorkCore({ databasePath: join(directory, 'workpet.sqlite') });
const seed = seedWorkflow(core), w = core.workflows;
const definition = w.save({ content: { ...seed.content, nodes: [seed.content.nodes[0]], outputs: [{ key: 'delivery', nodeId: 'research', outputKey: 'report' }] }, commandId: cid() });
core.close();
let app, panel; const errors = [];
async function until(check) { const end = Date.now() + 15000; while (Date.now() < end) { if (await check()) return; await new Promise(r => setTimeout(r, 50)); } throw new Error('Condition timed out'); }
const api = (action, input = {}) => panel.evaluate(({ action, input }) => window.workpet.workflow(action, input), { action, input });
const bounds = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/panel.html')).getBounds());
const shot = name => panel.screenshot({ path: join(output, `${name}.png`) });
try {
  app = await electron.launch({ executablePath: join(process.cwd(), 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: ['.', `--user-data-dir=${directory}`, '--dev'], env: { ...process.env, WORKPET_DATA_DIR: directory, WORKPET_BRIDGE_CONFIG: join(directory, 'bridge.json'), WORKPET_SKIP_INTEGRATIONS: '1' } });
  await until(() => { panel = app.windows().find(p => p.url().endsWith('/panel.html')); return !!panel; });
  panel.setDefaultTimeout(15000); panel.on('pageerror', e => errors.push(e.message));
  await panel.evaluate(() => window.workpet.distillation('setImprovementPreference', { enabled: false }));
  await panel.locator('#tab-definitions').click(); await panel.locator('.definition-list-row').first().waitFor();
  const rows = await panel.locator('.definition-list-row').evaluateAll(rows => rows.map(row => {
    const heading = row.querySelector('.list-row-heading'), p = row.querySelector('p');
    return { centers: [...heading.children].map(e => { const r = e.getBoundingClientRect(); return r.y + r.height / 2; }), lines: p.getBoundingClientRect().height / parseFloat(getComputedStyle(p).lineHeight) };
  }));
  assert.ok(rows.every(r => Math.max(...r.centers) - Math.min(...r.centers) < 2 && r.lines <= 3.1)); assert.equal(await panel.locator('.definition-list-row .worket-badge').count(), 0); await shot('definitions');
  await panel.locator('#tab-workflows').click(); await panel.locator('#wf-open-workspace').waitFor();
  assert.doesNotMatch(await panel.locator('#workflows-panel').innerText(), /暂无/); await shot('empty');
  const compact = await bounds();
  const make = name => api('create', { workflowId: definition.id, name, inputs: { brand: file }, commandId: cid() });
  const running = await make('正在处理的任务'), review = await make('等待验收的任务'), done = await make('已经交付的任务');
  // Prepare through the domain core in this isolated database, then use the real IPC for review.
  const fixture = createWorkCore({ databasePath: join(directory, 'workpet.sqlite') });
  for (const d of [review, done]) {
    const command = () => ({ runId: d.run.id, nodeId: 'research', generation: 1, expectedRevision: fixture.workflows.run(d.run.id).revision, commandId: cid() });
    fixture.workflows.prepare(command()); fixture.workflows.submit({ ...command(), outputs: { report: file } });
    if (d === done) fixture.workflows.review({ ...command(), decision: 'PASS', criteria: { complete: 'PASS', correct: 'PASS' } });
  }
  fixture.close();
  await panel.locator(`[data-overview-run="${done.run.id}"]`).waitFor();
  assert.equal(await panel.locator('.worket-spinner').count(), 2);
  assert.equal(await panel.locator(`[data-overview-run="${done.run.id}"] .worket-badge`).count(), 0);
  assert.equal(await panel.locator('#wf-open-workspace').count(), 1);
  assert.doesNotMatch(await panel.locator('#workflows-panel').innerText(), /已完成|查看全部/);
  assert.equal(await panel.locator('[data-overview-run] button').count(), 0);
  await shot('running-and-completed');
  await panel.locator(`[data-overview-run="${review.run.id}"]`).click(); await panel.locator('#wf-switch-run').waitFor();
  assert.ok((await bounds()).width > compact.width);
  await panel.locator('#window-back').click(); await panel.locator('#workflow-dialog').waitFor({ state: 'hidden' });
  await until(async () => (await bounds()).width === compact.width);
  await panel.locator('#wf-open-workspace').click(); await panel.locator('#wf-query-search').waitFor();
  await panel.locator('#window-back').click();
  await panel.locator('#wf-definitions').click(); await panel.locator(`[data-open-flow="${definition.id}"]`).waitFor();
  await panel.locator('#workflow-dialog #wf-new').click(); await panel.locator('#wf-name').waitFor();
  await panel.locator('#window-back').click();
  for (const d of [running, review]) { const current = await api('detail', { runId: d.run.id }); await api('status', { runId: d.run.id, expectedRevision: current.run.revision, commandId: cid(), status: 'CANCELLED' }); }
  await until(async () => await panel.locator('[data-overview-run]').count() === 1);
  assert.doesNotMatch(await panel.locator('#workflows-panel').innerText(), /进行中|已完成/); assert.doesNotMatch(await panel.locator('#workflows-panel').innerText(), /暂无/);
  await shot('completed-only'); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'PASSED', output, checks: ['same-line identity and three-line summary', 'empty sections', 'real status refresh', 'whole-row navigation', 'expand and restore bounds', 'catalog and new workflow'] }));
} finally { await app?.close(); }
