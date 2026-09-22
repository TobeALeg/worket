// Real Electron UI + HTTP MCP/Hook. Only the external launcher/history adapter is controlled.
// No external Agent task is created; this verifies delivery correlation, not Agent execution.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID as id } from 'node:crypto';
import { _electron as electron } from 'playwright';
import { createWorkCore } from '../dist/core/index.js';
import { skillContent, skillBasis } from './lib/skill-fixture.mjs';
const run = new Date().toISOString().replace(/[:.]/g, '-'), output = join(process.cwd(), 'output/delivery-receipts', run); mkdirSync(output, { recursive: true });
const directory = mkdtempSync(join(tmpdir(), 'worket-delivery-e2e-')), databasePath = join(directory, 'workpet.sqlite');
const core = createWorkCore({ databasePath }), content = structuredClone(skillContent); content.materialRoles = []; content.methods = [];
const draft = core.definitions.saveDraft({ id: id(), revision: 1, content, originalContent: structuredClone(content), refs: [], issues: [], resolutions: [] });
core.definitions.db.prepare('INSERT INTO review_events VALUES (?,?,?)').run(skillBasis.reviewEventId, draft.id, JSON.stringify({ type: 'QA_BASELINE', content }));
const definition = core.definitions.publish({ draftId: draft.id, expectedRevision: 1, materialBindings: {}, commandId: id() });
const work = core.createWorkFromDefinition({ definitionId: definition.id, inputs: { subject: '两次接力验证' }, referenceExampleIds: [], commandId: id() }); core.close();
const report = { run, status: 'RUNNING', packaged: !!process.env.WORKPET_EXECUTABLE_PATH, directory, providerCalls: 0, externalAgent: false, checks: {} };
let app, panel;
try {
  app = await electron.launch({ executablePath: process.env.WORKPET_EXECUTABLE_PATH ?? join(process.cwd(), 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [...(process.env.WORKPET_EXECUTABLE_PATH ? ['--use-mock-keychain'] : ['.']), `--user-data-dir=${directory}`, '--dev'], cwd: process.cwd(), env: { ...process.env, WORKPET_DATA_DIR: directory, WORKPET_BRIDGE_CONFIG: join(directory, 'bridge.json'), WORKPET_SKIP_INTEGRATIONS: '1' } });
  const until = Date.now() + 15000;
  while (!panel && Date.now() < until) { panel = app.windows().find(p => p.url().endsWith('/panel.html')); if (!panel) await new Promise(r => setTimeout(r, 100)); }
  assert.ok(panel); panel.setDefaultTimeout(15000);
  await app.evaluate(async ({ app, BrowserWindow }) => {
    const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json');
    const { ElectronWorkBuddyLauncher } = require('./dist/adapters/workbuddy/launcher.js');
    const { WorkBuddyDesktopClient } = require('./dist/adapters/workbuddy/desktop-client.js');
    globalThis.qaDeliveryLinks = [];
    ElectronWorkBuddyLauncher.prototype.openNewConversation = async function (url) { globalThis.qaDeliveryLinks.push(url); return 'opened'; };
    WorkBuddyDesktopClient.prototype.inspect = async function () {};
    WorkBuddyDesktopClient.prototype.readThread = async function (threadId) { return { threadId, title: '合成目标', cwd: '/tmp', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), events: [] }; };
    const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/panel.html')); window.setSize(800, 800); window.show();
  });
  const selectWork = async () => {
    if (await panel.locator('#back-to-list').isVisible()) await panel.locator('#back-to-list').click();
    await panel.locator(`[data-work-id="${work.instance.id}"]`).click();
    await panel.locator('#back-to-list').waitFor();
  };
  await selectWork();
  const bridge = JSON.parse(readFileSync(join(directory, 'bridge.json'), 'utf8'));
  const post = async (path, body) => {
    const response = await fetch(`http://${bridge.host}:${bridge.port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-workpet-token': bridge.token }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) }); assert.equal(response.status, 200); return response.json();
  };
  const read = deliveryId => post('/mcp', { jsonrpc: '2.0', id: id(), method: 'tools/call', params: { name: 'get_work_context', arguments: { work_id: work.instance.id, ...(deliveryId ? { delivery_id: deliveryId } : {}) } } });
  const state = async () => (await panel.evaluate(() => window.workpet.getDashboard())).selectedWork;
  let count = 0;
  const handoff = async () => {
    await panel.locator('[data-action="handoff"]').click(); await panel.locator('.executor-options button').filter({ hasText: /^WorkBuddy$/ }).click();
    let links = []; const deadline = Date.now() + 15000;
    while (Date.now() < deadline) { links = await app.evaluate(() => globalThis.qaDeliveryLinks); if (links.length > count) break; await new Promise(r => setTimeout(r, 100)); }
    assert.equal(links.length, ++count);
    const prompt = new URL(links.at(-1)).searchParams.get('prompt'); const deliveryId = prompt.match(/\[DELIVERY:([^\]]+)\]/)[1];
    assert.ok(prompt.includes(`delivery_id=${deliveryId}`), 'actual launch instruction must tell the Agent to correlate the read');
    return { prompt, deliveryId };
  };
  const hook = async (delivery, session) => post('/hooks/workbuddy', { hook_event_name: 'UserPromptSubmit', session_id: session, prompt: delivery.prompt, turn_id: id() });
  const first = await handoff(); assert.equal((await state()).captureStatus, 'waiting');
  assert.equal(JSON.parse((await read()).result.content[0].text).deliveryReceipt.acknowledged, false);
  await read(first.deliveryId); assert.equal((await state()).captureStatus, 'waiting');
  await hook(first, 'synthetic-first'); assert.equal((await state()).captureStatus, 'recording');
  report.checks.readBeforeHookRetained = true;
  // Refresh the rendered state before invoking the next real UI action.
  await selectWork();
  const second = await handoff(); await hook(second, 'synthetic-second');
  assert.equal((await state()).captureStatus, 'waiting', 'new target has not read the package');
  assert.match((await read(first.deliveryId)).error?.message ?? '', /DELIVERY_MISMATCH/);
  await read(); assert.equal((await state()).captureStatus, 'waiting');
  await selectWork(); assert.equal(await panel.locator('.capture-status').innerText(), '等待接手'); await panel.screenshot({ path: join(output, 'second-awaiting-read.png') });
  await read(second.deliveryId); assert.equal((await state()).captureStatus, 'recording');
  assert.ok((await state()).dispatchReadAt);
  report.checks.noInheritedOrUncorrelatedReceipt = true;
  await selectWork(); assert.equal(await panel.locator('.capture-status').innerText(), '已接手'); await panel.screenshot({ path: join(output, 'second-read.png') });
  report.status = 'PASSED';
} catch (error) { report.status = 'FAILED'; report.error = error instanceof Error ? error.message : String(error); if (panel) await panel.screenshot({ path: join(output, 'failure.png') }).catch(() => {}); process.exitCode = 1; }
finally { if (app) await app.close().catch(() => {}); writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); }
