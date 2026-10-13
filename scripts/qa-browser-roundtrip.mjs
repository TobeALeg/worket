// Approved isolated synthetic browser + Electron acceptance. No daily profile or third-party calls.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,cp} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {chromium,_electron as electron} from 'playwright';
const chromiumExecutable=process.env.WORKET_QA_CHROMIUM??join(homedir(),'Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const directory=await mkdtemp(join(tmpdir(),'worket-browser-roundtrip-'));
const profile=join(directory,'profile'), config=join(directory,'bridge.json');
const output=resolve('output/playwright/cn-connectors/roundtrip');await mkdir(output,{recursive:true});
const report={startedAt:new Date().toISOString(),syntheticOnly:true,thirdPartyCalled:false,dailyProfileRead:false,nativeRegisteredInTemporaryProfileOnly:false,checks:{},status:'RUNNING'};
let app,context,registered;
const synthetic='必须使用英文输出月度报告。预算不超过5000元。';
async function launchWorket(){
 app=await electron.launch({executablePath:resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),args:['.',`--user-data-dir=${join(directory,'electron')}`,'--use-mock-keychain','--dev'],env:{...process.env,WORKPET_SKIP_INTEGRATIONS:'1',WORKET_CONNECTOR_ISOLATION:'1',WORKPET_DATA_DIR:join(directory,'data'),WORKPET_BRIDGE_CONFIG:config}});
 await app.firstWindow();let panel;
 for(let i=0;i<100&&!panel;i++){panel=app.windows().find(p=>p.url().endsWith('/panel.html'));if(!panel)await new Promise(r=>setTimeout(r,100));}
 assert.ok(panel);await panel.waitForLoadState('domcontentloaded');return panel;
}
try{
 let panel=await launchWorket();
 context=await chromium.launchPersistentContext(profile,{executablePath:chromiumExecutable,headless:false,args:['--remote-debugging-port=0','--no-first-run',`--disable-extensions-except=${resolve('integrations/browser-extension')}`,`--load-extension=${resolve('integrations/browser-extension')}`]});
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const id=new URL(worker.url()).hostname;
 const prepare=spawn(process.execPath,[resolve('scripts/prepare-browser-native.mjs'),id,join(directory,'native'),config]);assert.equal(await new Promise(r=>prepare.on('close',r)),0);
 const hostDir=join(profile,'NativeMessagingHosts');await mkdir(hostDir,{recursive:true});registered=join(hostDir,'site.dandi.worket.selected.json');await cp(join(directory,'native','site.dandi.worket.selected.json'),registered);report.nativeRegisteredInTemporaryProfileOnly=true;
 const source=await context.newPage();
 await context.route('https://www.kimi.com/chat/worket-synthetic-roundtrip*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><meta charset="utf-8"><title>WORKET SYNTHETIC SELECTION TEST</title><h1>Worket isolated acceptance</h1><p id="selected" style="font:20px system-ui">${synthetic}</p><p id="unselected">PRIVATE-LIKE SYNTHETIC UNSELECTED TEXT: must not be captured.</p><p>No real account, messages, attachments or external model.</p>`}));
 await source.goto('https://www.kimi.com/chat/worket-synthetic-roundtrip?token=synthetic-only');await source.locator('#selected').selectText();await source.bringToFront();
 await writeFile(join(output,'session.json'),JSON.stringify({directory,profile,extensionId:id,browserExecutable:chromiumExecutable,state:'WAITING_REAL_EXTENSION_ACTION'},null,2));
 console.log('WAITING_REAL_EXTENSION_ACTION',id,directory);
 const cdp=await context.newCDPSession(source);let popupTarget;
 for(let i=0;i<1800&&!popupTarget;i++){const {targetInfos}=await cdp.send('Target.getTargets');popupTarget=targetInfos.find(t=>t.url===`chrome-extension://${id}/popup.html`);if(!popupTarget)await new Promise(r=>setTimeout(r,500));}
 assert.ok(popupTarget,'actual toolbar extension action must be invoked; no programmatic openPopup or host permission grant');
 const [port]= (await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n');
 const connection=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);const popup=connection.contexts()[0].pages().find(p=>p.url().endsWith('/popup.html'));assert.ok(popup);
 await popup.locator('#capture').click();await popup.waitForFunction(()=>document.querySelector('#content').value||document.querySelector('#status').textContent);console.log('CAPTURE_STATUS',await popup.locator('#status').textContent());assert.equal(await popup.locator('#content').inputValue(),synthetic);assert.equal(await popup.locator('#conversation').inputValue(),'');report.checks.actualActionSelectionOnly=true;
 await popup.locator('#conversation').fill('worket-synthetic-roundtrip');await popup.screenshot({path:join(output,'01-extension-selected.png')});
 await popup.locator('#stage').click();await popup.waitForFunction(()=>document.querySelector('#status').textContent.includes('已送入'));
 const staged=await panel.evaluate(()=>window.workpet.listSelectedInbox());assert.equal(staged.length,1);const dashboard=await panel.evaluate(()=>window.workpet.getDashboard());assert.equal(dashboard.selectedWork,null);report.checks.actualPopupToInboxWithoutArchive=true;
 await popup.close();
 async function openInbox(){await panel.locator('#tab-recent').click();await panel.locator('#import-selected').click();await panel.locator('[data-inbox]').click();await panel.locator('[data-inbox-list]').getByRole('button',{name:'WORKET SYNTHETIC SELECTION TEST',exact:true}).click();}
 await openInbox();assert.equal(await panel.locator('[data-confirm]').isDisabled(),true);await panel.locator('[data-preview-button]').click();await panel.waitForFunction(()=>!document.querySelector('[data-confirm]').disabled);await panel.getByRole('button',{name:'取消',exact:true}).click();assert.equal((await panel.evaluate(()=>window.workpet.getDashboard())).selectedWork,null);assert.equal((await panel.evaluate(()=>window.workpet.listSelectedInbox())).length,1);report.checks.cancelKeepsStagedWithoutArchive=true;
 await openInbox();await panel.locator('[data-preview-button]').click();await panel.waitForFunction(()=>!document.querySelector('[data-confirm]').disabled);await panel.screenshot({path:join(output,'02-worket-preview.png')});await panel.locator('[data-confirm]').click();await panel.locator('#back-to-list').waitFor();
 let result=await panel.evaluate(()=>window.workpet.getDashboard());const workId=result.selectedWork.id,count=result.selectedWork.eventCount;assert.ok(result.selectedWork.state.constraints.some(c=>/英文/.test(c.text)));assert.equal((await panel.evaluate(()=>window.workpet.listSelectedInbox())).length,0);report.checks.actualConfirmationDefaultExtraction=true;
 const input={schemaVersion:1,adapterId:'kimi-work',scope:'SELECTED_CONTENT',conversationId:'worket-synthetic-roundtrip',url:'https://www.kimi.com/chat/worket-synthetic-roundtrip',title:'WORKET SYNTHETIC SELECTION TEST',messages:[{role:'user',content:synthetic}]};
 await panel.evaluate(i=>window.workpet.importSelectedContent(i),input);result=await panel.evaluate(()=>window.workpet.getDashboard());assert.equal(result.selectedWork.eventCount,count);report.checks.repeatedImportDedupe=true;
 await panel.locator('#back-to-list').click();await panel.locator('#tab-recent').click();await panel.locator('#import-selected').click();await panel.locator('[data-site]').selectOption('kimi-work');await panel.locator('[data-url]').fill(input.url);await panel.locator('[data-conversation]').fill(input.conversationId);await panel.locator('[data-text]').fill(synthetic);await panel.locator('[data-preview-button]').click();await panel.waitForFunction(()=>!document.querySelector('[data-confirm]').disabled);await panel.locator('[data-text]').fill('要求更新：必须标明每项结论的来源。');assert.equal(await panel.locator('[data-confirm]').isDisabled(),true);await panel.locator('[data-preview-button]').click();await panel.waitForFunction(()=>!document.querySelector('[data-confirm]').disabled);await panel.locator('[data-confirm]').click();await panel.locator('#back-to-list').waitFor();result=await panel.evaluate(()=>window.workpet.getDashboard());assert.equal(result.selectedWork.id,workId);assert.ok(result.selectedWork.state.constraints.some(c=>/来源/.test(c.text)));report.checks.editRequiresNewPreviewAndSameWork=true;
 await panel.screenshot({path:join(output,'03-worket-recorded.png')});
 await app.close();app=null;panel=await launchWorket();result=await panel.evaluate(id=>window.workpet.getDashboard(id),workId);assert.equal(result.selectedWork.id,workId);assert.ok(result.selectedWork.state.constraints.some(c=>/来源/.test(c.text)));assert.equal((await panel.evaluate(()=>window.workpet.listSelectedInbox())).length,0);report.checks.restartPreservesConfirmedWork=true;
 await rm(registered);const ext=await context.newPage();await ext.goto(`chrome-extension://${id}/popup.html`);await assert.rejects(ext.evaluate(async i=>chrome.runtime.sendNativeMessage('site.dandi.worket.selected',{action:'stage',payload:i}),input),/not found|Specified native messaging host/);report.checks.nativeRemovalVerified=true;
 report.status='PASS_SYNTHETIC_BROWSER_ELECTRON_ROUNDTRIP';console.log(JSON.stringify(report));
}catch(e){report.status='FAIL';report.error=String(e);throw e;}
finally{if(context)await context.close();if(app)await app.close();await rm(directory,{recursive:true,force:true});report.temporaryProfileRemoved=true;report.finishedAt=new Date().toISOString();await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));}
