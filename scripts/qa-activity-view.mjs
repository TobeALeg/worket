// Isolated renderer regression: no real sources, uploads, or model calls.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { chromium } from 'playwright';
const output = resolve('output/playwright/activity-view');
await mkdir(output, { recursive: true });
const server = createServer(async (req,res) => {
 const path=resolve('dist','.'+new URL(req.url,'http://local').pathname);
 if(!path.startsWith(resolve('dist')+'/')) {res.writeHead(404).end();return;}
 try {res.setHeader('Content-Type', {'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml'}[extname(path)]??'text/plain');res.end(await readFile(path));} catch {res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true, channel: process.env.WORKET_QA_BROWSER || "chrome"});
const page=await browser.newPage({viewport:{width:400,height:800},reducedMotion:'reduce'});
const errors=[];page.on('pageerror', e=>errors.push(String(e)));
await page.addInitScript(() => {
  const item = text => ({ id: text, text, origin: 'USER_STATED', sourceMessageIds: ['1'] });
  const work = (id, title, status, captureStatus = 'recording') => ({
    id, title, status, captureStatus, agentName: 'Codex', updatedAt: new Date().toISOString(), eventCount: 24, artifactCount: 2, episodeCount: 1,
    state: { objective: [item('为新一轮产品发布准备完整的品牌与传播方案。')], successCriteria: [item('交付品牌视觉与发布文案，所有引用可追溯。')], constraints: [], facts: [], decisions: [item('使用暖色主视觉，移动端优先。')], completedActions: [], pendingActions: [item('完成最终审阅并确认交付。')], artifacts: [{ ...item('/tmp/交接资料/超声影像视频_2026-09-09.mp4'), file: { name: '超声影像视频_2026-09-09.mp4', path: '/tmp/交接资料/超声影像视频_2026-09-09.mp4', url: 'file:///tmp/交接资料/超声影像视频_2026-09-09.mp4' } }] },
    episodes: [{ id: 'e1', environment: 'Codex Desktop', executor: 'AGENT', status: 'ACTIVE' }],
    bindings: [{ status: 'ACTIVE', conversationId: id === 'waiting' ? 'pending:1' : 'chat-1' }],
  });
  let works = [work('open', 'MentiFem 品牌与发布方案', 'OPEN'), work('waiting', '官网首页设计与开发交接', 'OPEN', 'waiting'), work('done', '本周客户项目报告', 'COMPLETED'), work('archived', '第一版产品调研', 'ARCHIVED')];
  let selected = null;
  const dashboard = () => ({ works, selectedWorkId: selected?.id ?? null, selectedWork: selected, notice: null, petState: 'awake' });
  const change = (id, status) => { selected = works.find(w => w.id === id); selected.status = status; return dashboard(); };
  const thread = { id: 'chat', executorId: 'codex', agentName: 'Codex', title: '整理下周的产品发布计划', cwd: '/tmp/fixture', projectLabel: '产品发布', updatedAt: new Date().toISOString() };
  let preference = true;
  window.workpet = {
    openArtifact: async (workId, itemId) => {
      window.openedArtifact = { workId, itemId };
      if (window.artifactMissing) throw new Error('文件不存在或已移动');
    },
    getDashboard: async id => { if (id) selected = works.find(w => w.id === id); return dashboard(); },
    listRecentConversations: async () => ({ threads: [thread], errors: [] }),
    listConversationHistory: async executorId => ({ threads: executorId === "codex" ? [thread] : [], nextCursor: null }),
    createWorkFromConversation: async request => { window.viewRequest = request; selected = works[0]; return dashboard(); },
    listExecutors: async () => [{ id: 'codex', name: 'Codex', available: true, canDeliver: true }, { id: 'workbuddy', name: 'WorkBuddy', available: false, canDeliver: false, error: '尚未连接' }],
    listSplitPoints: async () => [{ externalId: 'p1', label: '请整理这次发布需要交付的材料' }],
    createWorkFromMessage: async () => { selected = work('split', '新的发布工作', 'OPEN'); works.unshift(selected); return dashboard(); },
    completeWork: async id => change(id, 'COMPLETED'), resumeWork: async id => change(id, 'OPEN'), archiveWork: async id => change(id, 'ARCHIVED'),
    refreshWork: async () => { throw new Error('连接中断，请重试'); },
    handoff: async id => { selected = works.find(w => w.id === id); selected.captureStatus = 'waiting'; return dashboard(); },
    cancelRecording: async (id, confirmation) => { window.cancelRecordingCalls = (window.cancelRecordingCalls ?? 0) + 1; if (confirmation !== '取消记录') throw new Error('请输入“取消记录”'); works = works.filter(w => w.id !== id); selected = null; return dashboard(); },
    copyWorkPackage: async () => {}, exportWorkPackage: async () => '/tmp/fixture.json',
    consumeSourceSelection: async () => null, onPanelShown(callback) { window.openFromPet = callback; }, onFeedbackCollapse() {}, onWorkflowDraftFlush() {}, closePanel() { window.panelCloseCalls = (window.panelCloseCalls ?? 0) + 1; },
    feedback: async () => null,
    getWorketServiceStatus: async () => ({ automatic: true, url: 'https://worket.example.com' }),
    feedback: async action => action === 'list' ? [] : action === 'remote' ? { items: [] } : { description: '', screenshots: [], consent: false, scope: 'RECENT', occurredAt: new Date().toISOString(), diagnostics: { from: new Date().toISOString(), to: new Date().toISOString(), events: [] } },
    configureWorketService: async () => {},
    distillation: async action => {
      if (action === 'activity') return null;
      if (action === 'recordingNotice') return { required: false, preparationRequired: false };
      if (action === 'improvementPreference') return { enabled: preference };
      if (action === 'setImprovementPreference') { preference = !preference; return {}; }
      if (action === 'definitions') return { items: [] };
      if (action === 'jobs') return [{ id: 'failed', status: 'FAILED', createdAt: new Date().toISOString(), error: '服务连接中断' }];
      if (action === 'job') { window.jobCalls = (window.jobCalls ?? 0) + 1; return { id: 'failed', status: window.runningJob ? 'RUNNING' : 'FAILED', snapshotId: 's1', attempt: 1, error: '服务连接中断' }; }
      if (action === 'snapshot') return { capturedAt: '2026-09-11 10:00', contentHash: 'fixture' };
      if (action === 'improvementSamples') return [{ id: 'sample1', label: '产品发布记录', state: 'STOPPED', pending: 0, consent: JSON.stringify({ at: '2026-09-11' }) }];
      return {};
    },
  };
});
try {
 await page.goto(`http://127.0.0.1:${server.address().port}/renderer/panel.html`);
 await page.locator('.source-row').first().waitFor();
 assert.deepEqual(await page.locator('.filter').allTextContents(),['最近活动','已沉淀','工作流']);
 assert.equal(await page.getByRole('button',{name:'开始记录',exact:true}).count(),0);
 await page.screenshot({path:join(output,'01-recent.png')});
 await page.locator('.source-row').first().click();
 await page.locator('#work-detail').waitFor();
 assert.equal((await page.evaluate(()=>window.viewRequest)).mode,'view');
 assert.equal(await page.locator('[data-action="complete"], [data-action="resume"], [data-progress="completedActions"], [data-current-stage]').count(),0);
 assert.equal(await page.locator('[data-action="distill"]').isVisible(),true);
 await page.screenshot({path:join(output,'02-detail.png')});
 await page.locator('[data-action="handoff"]').click();
 await page.locator('.executor-inline button').first().waitFor();
 assert.equal(await page.locator('dialog[open]').count(),0);
 assert.ok(await page.locator('.executor-inline img').count()>0);
 await page.screenshot({path:join(output,'03-inline-handoff.png')});
 await page.keyboard.press('Escape');
 await page.locator('#back-to-list').click();
 assert.equal(await page.locator('#sources-panel').isVisible(),true);
 await page.locator('#app-menu > summary').click();await page.locator('#saved-records').click();
 await page.locator('[data-work-id="done"]').waitFor();
 await page.locator('[data-distill-work]').first().check();
 assert.equal(await page.locator('#distill-selected').isEnabled(),true);
 await page.locator('[data-work-id="done"]').click();
 assert.equal(await page.locator('[data-action="handoff"]').isVisible(),true);
 assert.equal(await page.locator('[data-action="resume"]').count(),0);
 await page.locator('#tab-definitions').click();
 assert.equal(await page.locator('#definitions-panel').isVisible(),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.locator('#tab-recent').click();
 await page.locator('.source-row').first().click();
 await page.locator('#work-detail summary[aria-label="工作操作"]').click();
 await page.locator('[data-action="cancel-recording"]').click();
 await page.locator('#cancel-recording-confirmation').fill('取消记录');
 await page.locator('#confirm-cancel-recording').click();
 await page.locator('#sources-panel').waitFor();
 assert.equal(await page.locator('#work-detail').isVisible(),false);
 assert.match(await page.locator('[data-provider="codex"] img').getAttribute('src'), /chatgpt-circle/);
 await page.emulateMedia({ reducedMotion: 'no-preference' });
 const motion = await page.evaluate(async () => {
   const { hintHorizontalMotion } = await import('./horizontal-motion-hint.js');
   const list = document.querySelector('#source-providers');
   const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
   const position = () => list.firstElementChild.style.translate;
   const stop = hintHorizontalMotion(list);
   await wait(600);
   const started = position();
   list.dispatchEvent(new PointerEvent('pointerenter'));
   await wait(250);
   const frozen = position();
   stop();
   let ready;
   const dispose = hintHorizontalMotion(list, new Promise(resolve => { ready = resolve; }));
   list.dispatchEvent(new WheelEvent('wheel'));
   ready(); await wait(300);
   const cancelledBeforeRelease = position();
   dispose();
   const overflow = document.createElement('div');
   overflow.style.cssText = 'position:fixed;top:600px;width:90px;overflow:auto;display:flex';
   overflow.innerHTML = '<span style="flex:0 0 300px;height:20px">scroll</span>';
   document.body.append(overflow);
   const end = hintHorizontalMotion(overflow);
   await wait(600);
   const scrolled = overflow.scrollLeft;
   overflow.dispatchEvent(new PointerEvent('pointerenter'));
   await wait(250);
   const scrollFrozen = overflow.scrollLeft;
   end();
   const { setupExecutorDock } = await import('./executor-dock.js');
   const disposeDock = setupExecutorDock(overflow);
   overflow.scrollLeft = 0;
   overflow.dispatchEvent(new WheelEvent('wheel', { deltaY: 45, cancelable: true }));
   const wheelScrolled = overflow.scrollLeft;
   overflow.scrollLeft = 0;
   const bounds = overflow.getBoundingClientRect();
   overflow.dispatchEvent(new PointerEvent('pointermove', { clientX: bounds.right - 2, pointerType: 'mouse' }));
   await wait(400);
   const edgeScrolled = overflow.scrollLeft;
   overflow.dispatchEvent(new PointerEvent('pointermove', { clientX: bounds.left + bounds.width / 2, pointerType: 'mouse' }));
   await wait(100);
   const centered = overflow.scrollLeft;
   await wait(200);
   const centerStopped = overflow.scrollLeft;
   disposeDock(); overflow.remove();
   return { started, frozen, cancelledBeforeRelease, scrolled, scrollFrozen, wheelScrolled, edgeScrolled, centered, centerStopped };
 });
 assert.notEqual(motion.started, '');
 assert.notEqual(motion.started, '0px 0');
 assert.equal(motion.frozen, motion.started);
 assert.equal(motion.cancelledBeforeRelease, '');
 assert.ok(motion.scrolled > 0);
 assert.equal(motion.scrollFrozen, motion.scrolled);
 assert.equal(motion.wheelScrolled, 45);
 assert.ok(motion.edgeScrolled > 0);
 assert.equal(motion.centered, motion.centerStopped);
 assert.deepEqual(errors,[]);
 console.log('PASS: direct activity, original detail, inline icons, historical handoff, combined distillation, navigation');
} finally {await browser.close();await new Promise(r=>server.close(r));}
