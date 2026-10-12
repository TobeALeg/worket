// Actual Electron IPC, SQLite, extraction, clipboard and native-host framing.
// Uses a temporary Worket data directory and synthetic content only. No installed hooks or browser permissions changed.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { _electron as electron } from 'playwright';
import { encodeFrame } from '../integrations/browser-native/host.mjs';
const directory = await mkdtemp(join(tmpdir(), 'worket-cn-live-'));
const output = resolve('output/playwright/cn-connectors'); await mkdir(output, { recursive: true });
const fixture = JSON.parse(await readFile(new URL('../test/fixtures/connectors/selected-requirements.json', import.meta.url), 'utf8'));
const bridgeConfig = join(directory, 'bridge.json');
const report = { environment: 'actual local Electron, isolated database, synthetic content', thirdPartySend: false, thirdPartyHistoryRead: false, browserPermissionInstalled: false, actualModelCalls: false, checks: {} };
let app;
async function launch() {
  app = await electron.launch({ executablePath: resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: ['.', `--user-data-dir=${directory}`, '--use-mock-keychain', '--dev'],
    env: { ...process.env, WORKPET_SKIP_INTEGRATIONS: '1', WORKET_CONNECTOR_ISOLATION: '1', WORKPET_DATA_DIR: directory, WORKPET_BRIDGE_CONFIG: bridgeConfig } });
  const panel = await app.firstWindow();
  await panel.waitForLoadState('domcontentloaded');
  let p; for (let attempt = 0; attempt < 80 && !p; attempt++) { p = app.windows().find(page => page.url().endsWith('/panel.html')); if (!p) await new Promise(resolve => setTimeout(resolve, 250)); }
  assert.ok(p, 'panel window loaded');
  await p.waitForLoadState('domcontentloaded');
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/panel.html')); window.setSize(760, 900); window.show(); });
  return p;
}
try {
  let panel = await launch();
  await panel.locator('#tab-recent').click(); await panel.locator('#import-selected').click();
  await panel.locator('[data-site]').selectOption('kimi-work');
  await panel.locator('[data-url]').fill(fixture.url); await panel.locator('[data-conversation]').fill(fixture.conversationId); await panel.locator('[data-title]').fill(fixture.title);
  await panel.locator('[data-advanced] summary').click(); await panel.locator('[data-json-mode]').check();
  await panel.locator('[data-messages]').fill(JSON.stringify(fixture.messages)); await panel.locator('[data-attachments]').fill(fixture.missingAttachments.join('\n'));
  assert.equal(await panel.locator('[data-confirm]').isDisabled(), true);
  await panel.locator('[data-preview-button]').click(); await panel.locator('[data-confirm]').waitFor();
  await panel.waitForFunction(() => !document.querySelector('[data-confirm]').disabled);
  await panel.screenshot({ path: join(output, '01-import-preview.png') });
  await panel.locator('[data-confirm]').click(); await panel.locator('#back-to-list').waitFor();
  let dashboard = await panel.evaluate(() => window.workpet.getDashboard()); const id = dashboard.selectedWork.id;
  assert.equal(dashboard.selectedWork.captureStatus, 'selected'); assert.ok(dashboard.selectedWork.state.constraints.some(item => /中文/.test(item.text)), 'actual default extractor ran');
  const count = dashboard.selectedWork.eventCount;
  await panel.evaluate(input => window.workpet.importSelectedContent(input), fixture);
  dashboard = await panel.evaluate(() => window.workpet.getDashboard()); assert.equal(dashboard.selectedWork.eventCount, count);
  const changed = structuredClone(fixture); changed.messages.push({ id: 'u2', role: 'user', content: '要求更新：必须使用英文。截止日期为两周后。', timestamp: '2026-10-12T18:01:00Z' });
  await panel.evaluate(input => window.workpet.importSelectedContent(input), changed);
  await panel.evaluate(workId => window.workpet.copyInlinePackage(workId), id);
  const clipboardText = await app.evaluate(({ clipboard }) => clipboard.readText()); assert.match(clipboardText, /必须使用英文/); assert.match(clipboardText, /budget.xlsx/); assert.doesNotMatch(clipboardText, /请先调用 Worket MCP/);
  report.checks.actualImportExtractionDedupeRevision = true;
  await panel.screenshot({ path: join(output, '02-record-state.png') });
  // Prepare, do not register, an exact-origin native host bundle in a temporary directory.
  const pairId = 'a'.repeat(32), pairDir = join(directory, 'native');
  const prepare = spawn(process.execPath, [resolve('scripts/prepare-browser-native.mjs'), pairId, pairDir]);
  let prepareError = ''; prepare.stderr.on('data', chunk => prepareError += chunk);
  assert.equal(await new Promise(resolve => prepare.on('close', resolve)), 0, prepareError);
  const host = spawn(join(pairDir, 'worket-selected-host'), [`chrome-extension://${pairId}/`], { env: { ...process.env, WORKPET_BRIDGE_CONFIG: bridgeConfig } });
  const chunks = []; host.stdout.on('data', chunk => chunks.push(chunk));
  host.stdin.end(encodeFrame({ action: 'stage', payload: changed })); assert.equal(await new Promise(resolve => host.on('close', resolve)), 0);
  const frame = Buffer.concat(chunks), reply = JSON.parse(frame.subarray(4).toString()); assert.equal(frame.readUInt32LE(0), frame.length - 4); assert.equal(reply.ok, true); assert.equal(reply.captured, false);
  const beforeStage = await panel.evaluate(() => window.workpet.getDashboard());
  const inbox = await panel.evaluate(() => window.workpet.listSelectedInbox()); assert.equal(inbox.length, 1); assert.equal(beforeStage.selectedWork.eventCount, dashboard.selectedWork.eventCount + 1);
  report.checks.actualNativeHostToBridgeStagedWithoutCapture = true;
  // Local browser-origin requests are rejected even with the private token.
  const config = JSON.parse(await readFile(bridgeConfig, 'utf8'));
  const rejected = await fetch(`http://127.0.0.1:${config.port}/selected/stage`, { method: 'POST', headers: { 'x-workpet-token': config.token, Origin: 'https://www.kimi.com', 'Content-Type': 'application/json' }, body: JSON.stringify(changed) });
  assert.equal(rejected.status, 403); report.checks.browserCannotDirectlyPostToBridge = true;
  await panel.locator('#back-to-list').click(); await panel.locator('#tab-recent').click(); await panel.locator('#import-selected').click(); await panel.locator('[data-inbox]').click();
  await panel.locator('[data-inbox-list]').getByRole('button', { name: fixture.title, exact: true }).click();
  await panel.locator('[data-preview-button]').click(); await panel.waitForFunction(() => !document.querySelector('[data-confirm]').disabled);
  await panel.screenshot({ path: join(output, '03-native-inbox-confirmation.png') });
  await panel.locator('[data-confirm]').click(); await panel.locator('#back-to-list').waitFor();
  assert.equal((await panel.evaluate(() => window.workpet.listSelectedInbox())).length, 0);
  await app.close(); app = null; panel = await launch();
  dashboard = await panel.evaluate(workId => window.workpet.getDashboard(workId), id); assert.equal(dashboard.selectedWork.id, id); assert.equal(dashboard.selectedWork.eventCount, beforeStage.selectedWork.eventCount);
  assert.equal((await panel.evaluate(() => window.workpet.listSelectedInbox())).length, 0);
  report.checks.actualRestartRestoresWorkAndClearsInbox = true;
  // No target website is opened or sent to in this local UI pass.
  report.status = 'PASS'; await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (error) { report.status = 'FAIL'; report.error = String(error); await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2)); throw error; }
finally { if (app) await app.close(); }
