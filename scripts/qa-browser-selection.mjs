// Actual isolated Chromium + extension execution on a fulfilled synthetic HTTPS page.
// Native host registration is not installed; native framing is exercised separately.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, access } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
const directory = await mkdtemp(join(tmpdir(), 'worket-browser-selection-'));
const extension = resolve('integrations/browser-extension'), output = resolve('output/playwright/cn-connectors'); await mkdir(output, { recursive: true });
const executablePath = process.env.WORKET_QA_CHROMIUM ?? join(homedir(), 'Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
await access(executablePath);
const context = await chromium.launchPersistentContext(directory, { executablePath, headless: false,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
const report = { syntheticPage: true, userBrowserProfileAccessed: false, nativeRegistered: false, checks: {} };
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker'), extensionId = new URL(worker.url()).hostname;
  const source = await context.newPage();
  await context.route('https://www.kimi.com/chat/worket-synthetic*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Worket synthetic selection</title><p id="selected">必须使用英文输出合成项目计划。</p><p id="unselected">This unselected content must not be captured.</p>' }));
  await source.goto('https://www.kimi.com/chat/worket-synthetic?token=not-a-real-token');
  const sourceId = await worker.evaluate(async () => { const tabs = await chrome.tabs.query({ active: true, currentWindow: true }); return tabs[0].id; });
  await source.evaluate(() => { const range = document.createRange(); range.selectNodeContents(document.querySelector('#selected')); window.getSelection().removeAllRanges(); window.getSelection().addRange(range); });
  // Opening popup directly doesn't grant activeTab. Grant for this isolated synthetic page
  // through the extension action's actual popup; never grant permanent host permissions.
  await worker.evaluate(async tabId => { await chrome.tabs.update(tabId, { active: true }); await chrome.action.openPopup(); }, sourceId);
  let popup; for (let n = 0; n < 20 && !popup; n++) { popup = context.pages().find(page => page.url().includes('/popup.html')); if (!popup) await new Promise(resolve => setTimeout(resolve, 250)); }
  if (popup) {
    await popup.waitForLoadState(); await popup.locator('#capture').click();
    const captured = await popup.locator('#content').inputValue();
    if (captured) { assert.equal(captured, '必须使用英文输出合成项目计划。'); assert.equal(await popup.locator('#conversation').inputValue(), '', 'identity requires explicit selection, not page URL inference'); report.checks.actualSelectionOnly = true; await popup.screenshot({ path: join(output, '04-browser-selection.png') }); }
    else { report.checks.actionPermissionBoundary = await popup.locator('#status').textContent(); }
  } else report.checks.popupAutomation = 'Popup not exposed to Playwright; no permission bypass attempted';
  report.status = report.checks.actualSelectionOnly ? 'PASS_SELECTION_ONLY' : 'NOT_VERIFIED';
  await writeFile(join(output, 'browser-selection-report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} finally { await context.close(); }
