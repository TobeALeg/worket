// Synthetic candidate and skill; real Electron save/reopen/restart/publication and authenticated MCP.
import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,unlinkSync,rmSync,renameSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {_electron as electron} from 'playwright';
import {createWorkCore} from '../dist/core/index.js';
import {DistillationService} from '../dist/distillation/service.js';
import {source,FixtureClient,result} from '../test/distillation/fixtures.ts';
import {skillContent,writeSkillFixture} from './lib/skill-fixture.mjs';
const run=new Date().toISOString().replace(/[:.]/g,'-'),output=join(process.cwd(),'output/draft-materials',run);mkdirSync(output,{recursive:true});
const directory=mkdtempSync(join(tmpdir(),'worket-draft-materials-')),skill=join(directory,'report-builder'),template=join(directory,'FORMAT.md');
writeSkillFixture(skill);writeFileSync(template,'本轮固定模板 v1');
const core=createWorkCore({databasePath:join(directory,'workpet.sqlite')}),work=source(core,'以后用 Report Builder 技能和固定模板，依据每次的新主题生成报告。');
const client=new FixtureClient();client.get=async requestId=>{const candidate=result(client.request),basis=candidate.content.purpose.basis;candidate.content=structuredClone(skillContent);candidate.content.materialRoles.push({key:'template',text:'固定模板',required:true,basis});for(const row of [candidate.content.purpose,...Object.values(candidate.content).filter(Array.isArray).flat()]) row.basis=structuredClone(basis);return{requestId,status:'SUCCEEDED',result:candidate};};
const service=new DistillationService(core,client),snapshot=service.prepare({workIds:[work.instance.id],includedFileIds:[]});
let job=service.start({preparationId:snapshot.id,expectedContentHash:snapshot.contentHash,consentVersion:'worket-data-v1',commandId:id()});await new Promise(r=>setImmediate(r));job=await service.get(job.id);assert.equal(job.status,'AWAITING_REVIEW',job.error);core.close();
const report={run,status:'RUNNING',packaged:!!process.env.WORKPET_EXECUTABLE_PATH,directory,actualProviderCalls:0,externalAgent:false,checks:{}};let app,panel;
async function launch(){
 app=await electron.launch({executablePath:process.env.WORKPET_EXECUTABLE_PATH??join(process.cwd(),'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),args:[...(process.env.WORKPET_EXECUTABLE_PATH?['--use-mock-keychain']:['.']),`--user-data-dir=${directory}`,'--dev'],cwd:process.cwd(),env:{...process.env,WORKPET_DATA_DIR:directory,WORKPET_BRIDGE_CONFIG:join(directory,'bridge.json'),WORKPET_SKIP_INTEGRATIONS:'1'}});
 panel=undefined;const until=Date.now()+15000;while(!panel&&Date.now()<until){panel=app.windows().find(p=>p.url().endsWith('/panel.html'));if(!panel)await new Promise(r=>setTimeout(r,100));}assert.ok(panel);panel.setDefaultTimeout(15000);
 await panel.evaluate(()=>window.workpet.distillation('setImprovementPreference',{enabled:false}));
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/panel.html'));w.setSize(410,700);w.show();});
}
const open=()=>panel.evaluate(async id=>(await import('./distillation.js')).openJob(id),job.id);
async function materialControl(role){
 const address=`materialRoles.${role}`;
 const body=panel.locator(`[data-review-action="details"][data-address="${address}"]`);
 if(await body.getAttribute('aria-expanded')==='false') await body.click();
 return panel.locator(`[data-review-action="material"][data-address="${address}"]`);
}
async function select(role,path){
 const control=await materialControl(role);
 await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},path);await control.click();
}
try{
 await launch();await open();
 assert.deepEqual(await panel.locator('.dr-group h3').allTextContents(),['Input输入','Output输出','Reference Documents参考文档','Constraints约束']);
 assert.equal(await panel.locator('#dr-count,.dr-source,.dr-mini').count(),0);
 const shared='materialRoles.template',method='methods.builder';
 await select('builder',skill);await select('template',template);
 const refBody=panel.locator(`[data-review-action="details"][data-address="${shared}"]`);
 assert.equal(await refBody.locator('.dr-text-read').innerText(),'FORMAT.md');
 assert.equal(await panel.locator('.dr-item[data-section="materialRoles"][data-key="template"] .dr-path').innerText(),template);
 await refBody.click();
 const deleteButton=panel.locator(`[data-review-action="delete"][data-address="${shared}"]`);
 // Record actual intermediate frames. An asynchronous source check also runs in this page.
 await panel.evaluate(()=>{
  const row=document.querySelector('.dr-item[data-section="materialRoles"][data-key="template"]');
  const samples=[];window.__reviewFrames=samples;
  row.querySelector('[data-review-action="delete"]').addEventListener('click',()=>{
   const start=performance.now();function frame(){
    const inner=row.querySelector('.dr-item-inner'),style=getComputedStyle(inner);
    samples.push({ms:performance.now()-start,connected:row.isConnected,hidden:row.hidden,height:row.getBoundingClientRect().height,opacity:Number(style.opacity),transform:style.transform});
    if(performance.now()-start<1000)requestAnimationFrame(frame);
   }requestAnimationFrame(frame);
  },{once:true});
 });
 await deleteButton.click();
 await panel.locator('[data-review-action="history"][data-group="materialRoles"]').waitFor();
 const frames=await panel.evaluate(()=>window.__reviewFrames);
 assert.ok(frames.some(f=>f.ms<300&&f.connected&&!f.hidden&&f.height>20),'row remains mounted during strike');
 assert.ok(frames.some(f=>f.ms>320&&f.ms<650&&f.connected&&f.opacity>0&&f.opacity<1&&f.transform!=='none'),'withdrawal must have visible intermediate motion');
 report.checks.deletionMotion={mark:320,withdraw:400,frames};
 assert.equal(await refBody.count(),0,'default preview excludes deleted references');
 await panel.locator('[data-review-action="history"][data-group="materialRoles"]').click();
 assert.equal(await deleteButton.getAttribute('aria-pressed'),'true');
 await panel.locator(`[data-review-action="confirm"][data-address="${shared}"]`).click();
 assert.equal(await panel.locator('[data-review-action="history"][data-group="materialRoles"]').count(),0);
 assert.equal(await panel.locator(`[data-review-action="confirm"][data-address="${shared}"]`).getAttribute('aria-pressed'),'true');
 // Undo while the line is still drawing must not be hidden later by its old promise.
 await deleteButton.click();await panel.locator('[data-review-action="undo"]').click();
 await panel.waitForTimeout(800);assert.equal(await refBody.count(),1);
 report.checks.deleteRestoreAndInFlightUndo=true;
 await panel.locator(`[data-review-action="confirm"][data-address="${method}"]`).click();
 await panel.locator(`[data-review-action="delete"][data-address="${method}"]`).click();
 await panel.locator('[data-review-action="history"][data-group="constraints"]').waitFor();
 await panel.locator('[data-review-action="history"][data-group="constraints"]').click();
 await panel.locator(`[data-review-action="confirm"][data-address="${method}"]`).click();
 report.checks.sameKeySectionIsolation=true;

 if(process.env.WORKET_SAME_KEY_REVIEW==='1'){
  await panel.locator('#edit-all').click();
  await panel.locator('[data-review-action="delete"][data-address="methods.builder"]').click();
  assert.equal(await panel.locator('[data-review-action="material"][data-address="materialRoles.builder"]').innerText(),'更换资料','deleting a method must not clear a same-key material choice');
  await panel.locator('#edit-all').click();report.checks.sameKeySectionIsolation=true;
 }
 if(process.env.WORKET_SAVE_UNDO==='1'){
  await panel.locator('#edit-all').click();
  await panel.locator('[data-review-action="toggle-property"][data-address="methods.builder"]').click();
  renameSync(template,template+'.pending');
  await panel.locator('#save-draft').click();await panel.locator('#definition-error').waitFor({state:'visible'});
  assert.equal(await panel.locator('[data-review-action="undo"]').count(),1,'failed save keeps unsaved undo');
  renameSync(template+'.pending',template);
  await panel.locator('[data-review-action="undo"]').click();
  assert.match(await panel.locator('[data-review-action="toggle-property"][data-address="methods.builder"]').innerText(),/必须/);
  report.checks.failedSaveUndoRetained=true;
  await panel.locator('[data-review-action="toggle-property"][data-address="methods.builder"]').click();
  await panel.locator('#edit-all').click();
 }
 await panel.locator('#save-draft').click();await panel.locator('#dr-status').filter({hasText:'已暂存'}).waitFor();
 if(process.env.WORKET_SAVE_UNDO==='1'){
  writeFileSync(template,'撤销之前原件已变为 v2');writeFileSync(join(skill,'references/format.md'),'撤销之前技能已变为 v2');
  report.staleUndoOffered=!!await panel.locator('[data-review-action="undo"]').count();
  if(report.staleUndoOffered){
   await panel.locator('[data-review-action="undo"]').click();
   await panel.locator('#save-draft').click();await panel.locator('#dr-status').filter({hasText:'已暂存'}).waitFor();
  }
  const saved=await panel.evaluate(id=>window.workpet.distillation('draft',{id}),job.draftId);
  assert.equal(readFileSync(saved.materials.find(m=>m.role==='template').path,'utf8'),'本轮固定模板 v1','undoing a method after save must not upgrade a saved material');
  assert.equal(readFileSync(join(dirname(saved.materials.find(m=>m.bundle).path),'references/format.md'),'utf8'),'固定格式 v1');
  report.checks.savedMaterialVersionNotChangedByUndo=true;
 }
 if(process.env.WORKET_SAVE_UNDO==='1')writeFileSync(template,'本轮固定模板 v1');
 // Deleting a bound reference uses the real update interface; restoration repins its real original path.
 await panel.locator(`[data-review-action="delete"][data-address="${shared}"]`).click();
 await panel.locator('[data-review-action="history"][data-group="materialRoles"]').waitFor();
 await panel.locator('#save-draft').click();await panel.locator('#dr-status').filter({hasText:'已暂存'}).waitFor();
 const withoutReference=await panel.evaluate(id=>window.workpet.distillation('draft',{id}),job.draftId);
 assert.equal(withoutReference.content.materialRoles.some(role=>role.key==='template'),false);
 assert.equal(withoutReference.materials.some(material=>material.role==='template'),false);
 await panel.locator('[data-review-action="history"][data-group="materialRoles"]').click();
 await panel.locator(`[data-review-action="confirm"][data-address="${shared}"]`).click();
 await panel.locator('#save-draft').click();await panel.locator('#dr-status').filter({hasText:'已暂存'}).waitFor();
 const restoredReference=await panel.evaluate(id=>window.workpet.distillation('draft',{id}),job.draftId);
 assert.equal(restoredReference.materials.find(material=>material.role==='template').originalPath,template);
 report.checks.referenceDeletionAndRepinning=true;
 await panel.locator('#edit-all').click();await panel.locator('#definition-name').fill('');await panel.locator('#window-back').click();await panel.locator('#definition-error').filter({hasText:'请填写工作名称'}).waitFor();assert.equal(await panel.locator('#definition-dialog').isVisible(),true);assert.equal(await panel.locator('.dr-controls').evaluate(el=>el.disabled),false);
 await panel.locator('#definition-name').fill('返回自动暂存验收');await panel.locator('#window-back').click();await open();assert.equal(await panel.locator('#definition-name').inputValue(),'返回自动暂存验收');assert.equal(await panel.locator('#definition-dialog .brand-actions > .feedback-entry').count(),1);assert.equal(await panel.locator('#definition-dialog #close-panel').count(),1);
 await panel.locator('#edit-all').click();await panel.locator('#definition-name').fill('菜单跳转暂存验收');await panel.locator('#app-menu summary').click();await panel.locator('#service-settings').click();await panel.getByRole('heading',{name:'Worket 服务',exact:true}).waitFor();await panel.locator('#window-back').click();await open();assert.equal(await panel.locator('#definition-name').inputValue(),'菜单跳转暂存验收');report.checks.returnAndMenuPreserveDraft=true;
 await materialControl('builder');await materialControl('template');
 assert.equal(await panel.getByRole('button',{name:'更换资料',exact:true,includeHidden:true}).count(),2,'saved draft must retain both selected materials after reopen');
 report.checks.reopenRetainsSelections=true;
 await app.close();app=undefined;writeFileSync(template,'后来修改的模板 v2');writeFileSync(join(skill,'references/format.md'),'后来修改的技能 v2');
 await launch();await open();await materialControl('builder');await materialControl('template');assert.equal(await panel.getByRole('button',{name:'更换资料',exact:true,includeHidden:true}).count(),2);
 await panel.screenshot({path:join(output,'restored-draft.png')});
 unlinkSync(template);rmSync(skill,{recursive:true});
 await panel.locator('#publish-definition').click();await panel.locator('#use-definition').waitFor();
 await panel.locator('#use-definition').click();await panel.locator('[data-input="subject"]').fill('全新主题');await panel.locator('#create-defined-work').click();await panel.getByRole('dialog',{name:'交接给执行者'}).getByRole('button',{name:'取消',exact:true}).click();await panel.locator('#definition-dialog #window-back').click();await panel.locator('#definition-dialog').waitFor({state:'hidden'});await panel.locator('#back-to-list').waitFor();
 const workId=(await panel.evaluate(()=>window.workpet.getDashboard())).selectedWorkId;
 const pkg=(await panel.evaluate(workId=>window.workpet.distillation('package',{workId}),workId)).json;
 assert.equal(readFileSync(pkg.fixedMaterials.find(m=>m.role==='template').path,'utf8'),'本轮固定模板 v1');
 assert.equal(readFileSync(join(pkg.skills[0].directory,'references/format.md'),'utf8'),'固定格式 v1');
 const artifact=join(directory,'report.md');execFileSync(process.execPath,[join(pkg.skills[0].directory,'scripts/report.mjs'),'全新主题',artifact]);assert.match(readFileSync(artifact,'utf8'),/全新主题\n固定格式 v1/);
 const bridge=JSON.parse(readFileSync(join(directory,'bridge.json'),'utf8'));const response=await fetch(`http://${bridge.host}:${bridge.port}/mcp`,{method:'POST',headers:{'content-type':'application/json','x-workpet-token':bridge.token},body:JSON.stringify({jsonrpc:'2.0',id:id(),method:'tools/call',params:{name:'get_work_context',arguments:{work_id:workId}}})});
 const mcp=await response.json();assert.ok(!mcp.error);const value=JSON.parse(mcp.result.content[0].text);assert.equal(value.workPackage.definition.id,pkg.definition.id);
 report.checks.restartFrozenVersionPublicationAndMcp=true;report.checks.syntheticSkillExecution=true;
 await panel.locator('#tab-definitions').click();await panel.locator(`[data-definition="${pkg.definition.id}"]`).click();await panel.locator('.contract-management > summary').click();await panel.locator('#revise-definition').click();
 writeFileSync(template,'修订模板 v2');await select('template',template);await panel.locator('#save-draft').click();await panel.locator('#dr-status').filter({hasText:'已暂存'}).waitFor();await panel.locator('#window-back').click();
 await panel.locator('#use-definition').waitFor();await panel.locator('#definition-dialog #window-back').click();await panel.locator('#definition-dialog').waitFor({state:'hidden'});
 await panel.locator(`[data-definition="${pkg.definition.id}"]`).click();await panel.locator('.contract-management > summary').click();await panel.locator('#revise-definition').click();
 assert.equal(await (await materialControl('template')).innerText(),'更换资料','manual revision must resume its saved selections');
 await panel.locator('#publish-definition').click();await panel.locator('#use-definition').waitFor();
 const versions=await panel.evaluate(key=>window.workpet.distillation('versions',{key}),pkg.definition.definitionKey);assert.equal(versions[0].version,2);assert.equal(readFileSync(versions[0].materials.find(m=>m.role==='template').path,'utf8'),'修订模板 v2');
 const old=(await panel.evaluate(workId=>window.workpet.distillation('package',{workId}),workId)).json;assert.equal(readFileSync(old.fixedMaterials.find(m=>m.role==='template').path,'utf8'),'本轮固定模板 v1');
 report.checks.manualRevisionResumeAndOldInstance=true;report.status='PASSED';
}catch(error){report.status='FAILED';report.error=error.stack??String(error);process.exitCode=1;if(panel)await panel.screenshot({path:join(output,'failure.png')}).catch(()=>{});}
finally{if(app)await app.close().catch(()=>{});writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
