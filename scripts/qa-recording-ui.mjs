// UI-only synthetic fixtures: never reads or uploads a user's conversation.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
const output = resolve('output/playwright/recording');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const path = resolve('dist', '.' + new URL(req.url, 'http://local').pathname);
  if (!path.startsWith(resolve('dist') + '/')) { res.writeHead(404).end(); return; }
  try {
    res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[extname(path)] ?? 'text/plain');
    res.end(await readFile(path));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 304, height: 270 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', e => errors.push(e.stack ?? e.message));
await page.addInitScript(() => {
  const thread = { id: 'synthetic', executorId: 'fixture', agentName: 'Fixture', title: '合成测试 · 整理客户周报', cwd: '/tmp/fixture', updatedAt: new Date().toISOString() };
  window.workpet = {
    getPetView: async () => ({ petState: 'awake', recordingUploadNoticeRequired: !localStorage.getItem("noticeAccepted") && !localStorage.getItem("optOut"), currentConversation: { adapter: 'fixture', applicationName: 'Fixture', mark: 'F', title: thread.title, needsSelection: false, workId: null, workStatus: null, isRecording: false } }),
    openCurrentContextFromPet: async () => { localStorage.setItem("noticeAccepted", "yes"); },
    createWorkFromConversation: async () => { localStorage.setItem("noticeAccepted", "yes"); return { petState: 'sleeping', works: [], selectedWorkId: null, selectedWork: null, notice: null }; },
    getDashboard: async () => ({ petState: 'sleeping', works: [], selectedWorkId: null, selectedWork: null, notice: null }),
    listRecentConversations: async () => ({ threads: [thread], errors: [] }),
    listExecutors: async () => [{ id: 'fixture', name: 'Fixture' }],
    listConversationHistory: async () => ({ threads: [thread], nextCursor: null }),
    consumeSourceSelection: async () => null, onPanelShown() {}, setPetMousePassthrough() {},
    onFeedbackCollapse() { return () => {}; }, feedback: async () => null,
    distillation: async action => action === 'recordingNotice' ? { required: !localStorage.getItem('noticeAccepted') && !localStorage.getItem('optOut') } : action === 'improvementPreference' ? { enabled: true } : [],
  };
});
const url = `http://127.0.0.1:${server.address().port}`;
try {
  await page.goto(url + '/renderer/pet.html');
  await page.getByRole('button', { name: '查看当前活动：' + '合成测试 · 整理客户周报' }).waitFor();
  assert.equal(await page.locator('#recording-upload-notice').count(), 0);
  assert.equal(await page.locator('#paper-label').textContent(), '查看');
  await page.locator('#paper-action').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('noticeAccepted')), 'yes');
  await page.screenshot({ path: output + '/pet-view.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: pet opens activity without recording entry or upload notice');
} finally { await browser.close(); await new Promise(r => server.close(r)); }
