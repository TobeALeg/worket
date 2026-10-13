// Approved temporary browser pairing. Actual Chrome nativeMessaging -> native subprocess -> private loopback bridge.
// Headless, independent test profile: does not operate or unlock the user's desktop/browser/apps.
// Synthetic payload only. ActiveTab selection and third-party conversations are separate verification stages.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, cp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { WorkPetHttpBridge } from '../dist/bridge/http-bridge.js';
import { WorkPetMcpHandler } from '../dist/bridge/mcp-handler.js';
import { SelectedContentInbox } from '../dist/connectors/inbox.js';
import { AppService } from '../dist/app/app-service.js';
import { createWebExecutors } from '../dist/connectors/web-executor.js';
const directory = await mkdtemp(join(tmpdir(), 'worket-native-browser-')), profile = join(directory, 'profile');
const output = resolve('output/playwright/cn-connectors/online'); await mkdir(output, { recursive: true }); await mkdir(profile);
const fixture = JSON.parse(await readFile(new URL('../test/fixtures/connectors/selected-requirements.json', import.meta.url), 'utf8'));
const app = new AppService({ databasePath: join(directory, 'work.sqlite'), executors: createWebExecutors({}), foreground: { async detect() { return null; } } });
const inbox = new SelectedContentInbox(), config = join(directory, 'bridge.json');
const bridge = new WorkPetHttpBridge({ configPath: config, mcp: new WorkPetMcpHandler(app.core()), onHook: async () => ({ accepted: false }), onSelectedContent: payload => ({ stagedId: inbox.stage(payload), captured: false }) });
let context;
const report = { browser: 'Chrome for Testing 148, headless temporary profile', nativeRegisteredInTemporaryProfileOnly: false, actualBrowserNativeTransport: false, activeTabSelection: 'SEPARATE_PENDING_DESKTOP_UNLOCK', payload: 'synthetic fixture', thirdPartyConversation: false, privateBrowserProfileRead: false, permissionsRemovedAfterTest: false };
try {
  await bridge.start();
  const executablePath = process.env.WORKET_QA_CHROMIUM ?? join(homedir(), 'Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  context = await chromium.launchPersistentContext(profile, { executablePath, headless: true, args: [`--disable-extensions-except=${resolve('integrations/browser-extension')}`, `--load-extension=${resolve('integrations/browser-extension')}`] });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  report.extensionWorker = worker.url();
  const id = new URL(worker.url()).hostname, prepared = join(directory, 'native');
  const prepare = spawn(process.execPath, [resolve('scripts/prepare-browser-native.mjs'), id, prepared, config]); let stderr = '';
  prepare.stderr.on('data', chunk => stderr += chunk); assert.equal(await new Promise(resolve => prepare.on('close', resolve)), 0, stderr);
  const hostDirectory = join(profile, 'NativeMessagingHosts'); await mkdir(hostDirectory, { recursive: true });
  const registered = join(hostDirectory, 'site.dandi.worket.selected.json');
  await cp(join(prepared, 'site.dandi.worket.selected.json'), registered); report.nativeRegisteredInTemporaryProfileOnly = true;
  const extensionPage = await context.newPage(); await extensionPage.goto(`chrome-extension://${id}/popup.html`);
  const result = await extensionPage.evaluate(async payload => chrome.runtime.sendNativeMessage('site.dandi.worket.selected', { action: 'stage', payload }), fixture);
  assert.equal(result.ok, true); assert.equal(result.captured, false); assert.equal(app.core().listWorks('OPEN').length, 0);
  const items = inbox.list(); assert.equal(items.length, 1);
  const input = inbox.read(items[0].id); app.previewSelectedContent(input);
  const imported = await app.importSelectedContent(input); inbox.remove(items[0].id);
  assert.equal(imported.selectedWork.captureStatus, 'selected'); assert.ok(imported.selectedWork.state.constraints.some(item => /中文/.test(item.text)));
  report.actualBrowserNativeTransport = true; report.stagingDoesNotArchive = true; report.actualAppInterfaceExtraction = true;
  // Remove authorization before shutting down the test browser.
  await rm(registered); await assert.rejects(extensionPage.evaluate(async payload => chrome.runtime.sendNativeMessage('site.dandi.worket.selected', { action: 'stage', payload }), fixture), /not found|Specified native messaging host/);
  report.nativeRegistrationRemovalVerified = true;
  report.status = 'PASS_BROWSER_NATIVE_TRANSPORT';
} catch (error) { report.status = 'FAIL'; report.error = String(error); throw error; }
finally {
  if (context) await context.close(); await bridge.close(); app.close(); await rm(directory, { recursive: true, force: true });
  report.permissionsRemovedAfterTest = true; await writeFile(join(output, 'native-browser-report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
}
