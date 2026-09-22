// Synthetic inputs through real Electron creation/update UI, persistence and HTTP MCP.
// External Agent launcher/history are controlled; this does not claim business delivery.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID as id } from 'node:crypto';
import { _electron as electron } from 'playwright';
import { createWorkCore } from '../dist/core/index.js';
import { skillContent, skillBasis } from './lib/skill-fixture.mjs';
const run = new Date().toISOString().replace(/[:.]/g, '-');
const output = join(process.cwd(), 'output/instance-files', run); mkdirSync(output, { recursive: true });
const directory = mkdtempSync(join(tmpdir(), 'worket-instance-e2e-'));
const databasePath = join(directory, 'workpet.sqlite'), script = join(directory, 'SCRIPT.md');
const core = createWorkCore({ databasePath });
const content = structuredClone(skillContent); content.methods = []; content.materialRoles = [];
content.inputs.push({ key: 'script', text: '本次脚本', valueType: 'FILE', required: true, basis: skillBasis });
const draft = core.definitions.saveDraft({ id: id(), revision: 1, content, originalContent: structuredClone(content), refs: [], issues: [], resolutions: [] });
core.definitions.db.prepare('INSERT INTO review_events VALUES (?,?,?)').run(skillBasis.reviewEventId, draft.id, JSON.stringify({ type: 'QA_BASELINE', content }));
const firstDefinition = core.definitions.publish({ draftId: draft.id, expectedRevision: 1, materialBindings: {}, commandId: id() });
const revision = core.definitions.revise({ definitionId: firstDefinition.id, commandId: id() });
revision.content.constraints[0].text = '结论附来源和日期';
const updated = core.definitions.update({ draftId: revision.id, expectedRevision: revision.revision, content: revision.content, issueResolutions: [] });
const latestDefinition = core.definitions.publish({ draftId: updated.id, expectedRevision: updated.revision, materialBindings: {}, commandId: id() });
core.close();
const report = { run, status: 'RUNNING', packaged: !!process.env.WORKPET_EXECUTABLE_PATH, directory, providerCalls: 0, externalAgent: false, synthetic: true, checks: {} };
let app, panel;
try {
  app = await electron.launch({ executablePath: process.env.WORKPET_EXECUTABLE_PATH ?? join(process.cwd(), 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [...(process.env.WORKPET_EXECUTABLE_PATH ? ['--use-mock-keychain'] : ['.']), `--user-data-dir=${directory}`, '--dev'], cwd: process.cwd(), env: { ...process.env, WORKPET_DATA_DIR: directory, WORKPET_BRIDGE_CONFIG: join(directory, 'bridge.json'), WORKPET_SKIP_INTEGRATIONS: '1' } });
  const deadline = Date.now() + 15000;
  while (!panel && Date.now() < deadline) { panel = app.windows().find(p => p.url().endsWith('/panel.html')); if (!panel) await new Promise(resolve => setTimeout(resolve, 100)); }
  assert.ok(panel); panel.setDefaultTimeout(15000);
  await app.evaluate(({ app, BrowserWindow, dialog }, script) => {
    const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json');
    const { ElectronWorkBuddyLauncher } = require('./dist/adapters/workbuddy/launcher.js');
    const { WorkBuddyDesktopClient } = require('./dist/adapters/workbuddy/desktop-client.js');
    globalThis.qaLinks = [];
    ElectronWorkBuddyLauncher.prototype.openNewConversation = async function(url) { globalThis.qaLinks.push(url); return 'opened'; };
    WorkBuddyDesktopClient.prototype.inspect = async function() {};
    WorkBuddyDesktopClient.prototype.readThread = async function(threadId) { return { threadId, title: '合成目标', cwd: '/tmp', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), events: [] }; };
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [script] });
    const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/panel.html')); window.setSize(800, 850); window.show();
  }, script);
  await panel.evaluate(() => window.workpet.distillation('setImprovementPreference', { enabled: false }));
  const api = (action, input) => panel.evaluate(({ action, input }) => window.workpet.distillation(action, input), { action, input });
  const create = async (version, topic, override) => {
    await panel.locator('#tab-definitions').click();
    await panel.locator(`[data-definition="${latestDefinition.id}"]`).click();
    await panel.locator('#definition-version').selectOption(version);
    await panel.locator('#use-definition').click();
    await panel.locator('[data-input="subject"]').fill(topic);
    await panel.locator('[data-input-file="script"]').click();
    await panel.waitForFunction(path => document.querySelector('[data-input="script"]')?.value === path, script);
    if (override) {
      await panel.locator('summary').filter({ hasText: '仅本次的特殊要求' }).click();
      await panel.locator('[data-rule-override="constraints.sources"]').fill(override);
    }
    await panel.locator('#create-defined-work').click();
    await panel.locator('#definition-dialog').waitFor({ state: 'hidden' });
    return (await panel.evaluate(() => window.workpet.getDashboard())).selectedWork.id;
  };
  const select = async workId => {
    await panel.locator('#tab-open').click();
    if (await panel.locator('#back-to-list').isVisible()) await panel.locator('#back-to-list').click();
    await panel.locator(`[data-work-id="${workId}"]`).click();
  };
  writeFileSync(script, '第一期脚本'); const first = await create(firstDefinition.id, '第一期', '仅本次不展示日期');
  const old = (await api('package', { workId: first })).json;
  writeFileSync(script, '第二期脚本'); const second = await create(latestDefinition.id, '第二期');
  const secondPackage = (await api('package', { workId: second })).json;
  assert.equal(readFileSync((await api('package', { workId: first })).json.inputs.script, 'utf8'), '第一期脚本');
  assert.equal(readFileSync(secondPackage.inputs.script, 'utf8'), '第二期脚本');
  assert.equal(old.definition.version, 1); assert.equal(secondPackage.definition.version, 2);
  assert.equal(secondPackage.ruleOverrides?.length ?? 0, 0); assert.equal(old.ruleOverrides.length, 1);
  assert.equal(secondPackage.inputs.subject, '第二期'); assert.equal(secondPackage.purpose, 'START');
  if (process.env.WORKET_MATERIAL_RECOVERY === '1') {
    writeFileSync(secondPackage.inputs.script, '损坏的第二期副本');
    await assert.rejects(api('package', { workId: second }), /MATERIAL_MISSING/);
    await select(second); await panel.locator('summary[aria-label="工作操作"]').click(); await panel.locator('[data-action="instance-files"]').click();
    await panel.locator('[data-select-instance-file="script"]').click();
    await panel.locator('[data-file-label="script"]').filter({ hasText: '待保存' }).waitFor();
    await panel.locator('#save-instance-files').click();
    await panel.locator('#definition-dialog').waitFor({ state: 'hidden', timeout: 5000 });
    assert.equal(readFileSync((await api('package', { workId: second })).json.inputs.script, 'utf8'), '第二期脚本');
    report.checks.reselectionRepairsSameInputVersion = true;
  }
  unlinkSync(script); await api('package', { workId: first }); await api('package', { workId: second });
  report.checks.distinctInputsVersionsAndOverrides = true;
  await select(first);
  await panel.locator('[data-action="handoff"]').click(); await panel.locator('.executor-options button').filter({ hasText: /^WorkBuddy$/ }).click();
  let links = []; const until = Date.now() + 15000;
  while (Date.now() < until) { links = await app.evaluate(() => globalThis.qaLinks); if (links.length) break; await new Promise(resolve => setTimeout(resolve, 100)); }
  assert.equal(links.length, 1);
  const prompt = new URL(links[0]).searchParams.get('prompt'), deliveryId = prompt.match(/\[DELIVERY:([^\]]+)\]/)[1];
  const bridge = JSON.parse(readFileSync(join(directory, 'bridge.json'), 'utf8'));
  const post = async (path, body) => {
    const response = await fetch(`http://${bridge.host}:${bridge.port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-workpet-token': bridge.token }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200); return response.json();
  };
  const read = () => post('/mcp', { jsonrpc: '2.0', id: id(), method: 'tools/call', params: { name: 'get_work_context', arguments: { work_id: first, delivery_id: deliveryId } } });
  await post('/hooks/workbuddy', { hook_event_name: 'UserPromptSubmit', session_id: 'synthetic-file-session', prompt, turn_id: id() });
  assert.ok((await read()).result);
  await select(first); assert.equal(await panel.locator('.capture-status').innerText(), '已接手');
  writeFileSync(script, '第一期修订稿');
  await panel.locator('summary[aria-label="工作操作"]').click(); await panel.locator('[data-action="instance-files"]').click();
  await panel.locator('[data-select-instance-file="script"]').click();
  await panel.locator('[data-file-label="script"]').filter({ hasText: '待保存' }).waitFor();
  await panel.locator('#save-instance-files').click(); await panel.locator('#definition-dialog').waitFor({ state: 'hidden' });
  assert.equal(await panel.locator('.capture-status').innerText(), '等待接手');
  await panel.screenshot({ path: join(output, 'updated-awaiting-read.png') });
  const current = JSON.parse((await read()).result.content[0].text);
  assert.equal(readFileSync(current.workPackage.inputs.script, 'utf8'), '第一期修订稿');
  assert.equal(readFileSync(old.inputs.script, 'utf8'), '第一期脚本');
  assert.equal(readFileSync((await api('package', { workId: second })).json.inputs.script, 'utf8'), '第二期脚本');
  await select(first); assert.equal(await panel.locator('.capture-status').innerText(), '已接手');
  report.checks.explicitUpdateIsolatedAndReceiptReset = true;
  // Simulate an upgrade fixture with no historical file manifest, using the isolated QA DB only.
  const fixture = createWorkCore({ databasePath });
  const legacy = fixture.definitions.inputs(second); delete legacy.inputMaterials; legacy.inputs.script = script;
  fixture.definitions.db.prepare('UPDATE instance_inputs SET payload_json=? WHERE work_id=?').run(JSON.stringify(legacy), second); fixture.close();
  await assert.rejects(api('package', { workId: second }), /INPUT_FILE_UNVERIFIED/);
  await select(second); await panel.locator('summary[aria-label="工作操作"]').click(); await panel.locator('[data-action="instance-files"]').click();
  assert.match(await panel.locator('[data-file-label="script"]').innerText(), /需重新选择/);
  writeFileSync(script, '明确重选的历史输入');
  await panel.locator('[data-select-instance-file="script"]').click();
  await panel.locator('[data-file-label="script"]').filter({ hasText: '待保存' }).waitFor();
  await panel.locator('#save-instance-files').click(); await panel.locator('#definition-dialog').waitFor({ state: 'hidden' });
  unlinkSync(script);
  assert.equal(readFileSync((await api('package', { workId: second })).json.inputs.script, 'utf8'), '明确重选的历史输入');
  assert.equal(readFileSync((await api('package', { workId: first })).json.inputs.script, 'utf8'), '第一期修订稿');
  report.checks.legacyBlockedAndExplicitlyRepaired = true;
  report.status = 'PASSED';
} catch (error) {
  report.status = 'FAILED'; report.error = error instanceof Error ? error.stack : String(error); process.exitCode = 1;
  if (panel) await panel.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
} finally {
  if (app) await app.close().catch(() => {});
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
}
