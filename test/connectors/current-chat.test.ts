import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { _electron } from 'playwright';
import { captureCurrentChat } from '../../integrations/browser-extension/current-chat.js';
import { normalizeSelectedContent } from '../../dist/connectors/selected-content.js';

async function fixture(run: (page: any) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'worket-current-chat-'));
  const main = join(root, 'main.cjs');
  await writeFile(main, `const {app,BrowserWindow}=require('electron'); app.whenReady().then(()=>{const w=new BrowserWindow({show:false}); w.loadURL('about:blank');});`);
  const app = await _electron.launch({ args: [main, `--user-data-dir=${join(root, 'profile')}`] });
  try {
    const page = await app.firstWindow();
    await page.route('https://chatgpt.com/c/test-current-chat', (route: any) => route.fulfill({contentType: 'text/html', body: '<!doctype html><title>测试聊天</title><main></main>'}));
    await page.goto('https://chatgpt.com/c/test-current-chat');
    await run(page);
  } finally { await app.close(); await rm(root, {recursive:true,force:true}); }
}

test('current chat traverses virtualized messages, preserves roles/order/formatting, excludes sidebar/actions and restores scroll', async () => fixture(async page => {
  await page.setContent(`<aside>私人侧栏不应导入</aside><main><div class="thread-scroll-container" style="height:220px;overflow-y:auto"><div data-chatgpt-conversation-selection-target="test"><div id="space" style="height:900px;position:relative"><div id="window"></div></div></div></div></main>`);
  await page.evaluate(() => {
    const scroll = document.querySelector('.thread-scroll-container')!, target = document.querySelector('#window')!;
    const contents = ['首条用户问题', '<h2>结果</h2><p>第一段</p><p>第二段 <a href="https://example.com/source">来源</a></p><pre><button>复制代码</button>one\n  two</pre><button>复制</button><span hidden>隐藏内容</span>', '后续要求', '<table><tr><th>项目</th><th>值</th></tr><tr><td>数量</td><td>2</td></tr></table>'];
    const render = () => {
      const start = scroll.scrollTop < 200 ? 0 : scroll.scrollTop < 450 ? 1 : 2;
      target.innerHTML = contents.slice(start,start+2).map((content,index) => { const id=start+index, role=id%2?'assistant':'user'; return `<div data-chatgpt-search-unit-key="turn:${id}:${role}" data-chatgpt-search-message-ids="id-${id}" style="height:150px"><h4 data-conversation-role="${role}">${role}</h4><div ${role==='user'?'data-user-message-bubble':'data-markdown-text-style="assistant-message"'}>${content}</div><button>操作</button></div>`; }).join('');
      (target as HTMLElement).style.paddingTop = `${start * 200}px`;
    };
    scroll.addEventListener('scroll', render); scroll.scrollTop=250; render();
  });
  const result = await page.evaluate(captureCurrentChat);
  assert.deepEqual(result.messages.map((message: any)=>message.role), ['user','assistant','user','assistant']);
  assert.equal(result.messages[0].content,'首条用户问题');
  assert.match(result.messages[1].content,/第一段\n第二段/);
  assert.match(result.messages[1].content,/https:\/\/example.com\/source/);
  assert.match(result.messages[1].content,/one\n  two/);
  assert.match(result.messages[3].content,/项目\t值/);
  assert.doesNotMatch(JSON.stringify(result),/私人侧栏|隐藏内容|复制|操作/);
  assert.equal(await page.locator('.thread-scroll-container').evaluate((el: HTMLElement)=>el.scrollTop),250);
  const normalized=normalizeSelectedContent({schemaVersion:1,adapterId:'chatgpt-web',scope:'SELECTED_CONTENT',...result});
  assert.equal(normalized.events[0]!.metadata!.captureMode,'CURRENT_CHAT');
  assert.equal(normalized.events[0]!.metadata!.historyComplete,false,'DOM coverage must never become authoritative deletion evidence');
}));

test('standard ChatGPT layout reads without selection and refuses active generation or navigation to another chat', async () => fixture(async page => {
  const html = `<main><div data-message-author-role="user" data-message-id="u"><div class="whitespace-pre-wrap">完整问题</div><button>编辑</button></div><div data-message-author-role="assistant" data-message-id="a"><div class="markdown"><p>完整回复</p></div><button>复制</button></div></main>`;
  await page.setContent(html);
  const first=await page.evaluate(captureCurrentChat), second=await page.evaluate(captureCurrentChat);
  assert.deepEqual(first.messages,second.messages,'repeated capture keeps stable IDs');
  assert.deepEqual(first.messages.map((message:any)=>message.content),['完整问题','完整回复']);
  await page.locator('main').evaluate((el:HTMLElement)=>{const button=document.createElement('button');button.dataset.testid='stop-button';el.append(button);});
  assert.match((await page.evaluate(captureCurrentChat)).error,/仍在生成/);
  await page.setContent(html);
  const changed = await page.evaluate(async functionSource => {
    const fn=eval(`(${functionSource})`);
    setTimeout(()=>history.pushState({},'', '/c/another-chat'),500);
    return fn();
  },captureCurrentChat.toString());
  assert.match(changed.error,/聊天已切换/);
}));
