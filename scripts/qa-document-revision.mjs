// Controlled draft, real Electron document adoption/restart/publication/MCP; no provider calls.
import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {_electron as electron} from 'playwright';
import {createWorkCore} from '../dist/core/index.js';
import {DistillationService} from '../dist/distillation/service.js';
import {hash} from '../dist/definitions/storage.js';
import {source,FixtureClient,result} from '../test/distillation/fixtures.ts';
const run=new Date().toISOString().replace(/[:.]/g,'-'),output=join(process.cwd(),'output/document-revision',run);mkdirSync(output,{recursive:true});
const directory=mkdtempSync(join(tmpdir(),'worket-document-revision-')),databasePath=join(directory,'workpet.sqlite'),path=join(directory,'FRAME.md'),text='# 规范\n每个摘要不超过 50 words。\n';writeFileSync(path,text);
const core=createWorkCore({databasePath}),work=source(core,'以后按 FRAME.md，每个摘要最多五十词，每次提供新主题。');
const file=core.addArtifactRef(work.instance.id,{path,filename:'FRAME.md',role:'REFERENCE',mimeType:'text/markdown',size:Buffer.byteLength(text),sha256:hash(text),lastModifiedAt:new Date().toISOString(),availability:'AVAILABLE'}).artifactRefs.at(-1);
const client=new FixtureClient(),service=new DistillationService(core,client);
client.get=async requestId=>{const value=result(client.request),basis=value.content.purpose.basis,event=client.request.sources[0].events.find(e=>e.kind==='file.content'),policy={scope:'REUSABLE',status:'ACTIVE'};
value.content={schemaVersion:1,name:'摘要报告',purpose:{key:'purpose',text:'依据本次主题制作摘要报告。',basis},inputs:[{key:'subject',text:'本次主题',valueType:'TEXT',required:true,basis}],deliverables:[{key:'report',text:'Markdown 报告',basis,rule:policy}],constraints:[{key:'limit',text:'每个摘要不超过 50 words。',rule:policy,basis:{type:'SOURCE',origin:'DOCUMENT_STATED',refs:[{snapshotId:'wire',workId:'work-1',eventId:event.key}]},document:{source:{snapshotId:'wire',workId:'work-1',eventId:event.key},hash:event.hash,name:'FRAME.md',startLine:2,endLine:2}},{key:'alias',text:'每个摘要最多五十词',basis,rule:{...policy,relation:{kind:'DUPLICATE',target:'constraints.limit'}}}],acceptanceCriteria:[],methods:[],materialRoles:[]};
value.issues=[{id:'review-input',type:'MISSING_INFORMATION',field:'inputs.subject',message:'确认每次都提供新的主题。',blocking:true},{id:'review-limit',type:'UNCERTAIN_GENERALIZATION',field:'constraints.limit',message:'确认摘要字数的长期适用范围。',blocking:true}];return{requestId,status:'SUCCEEDED',result:JSON.parse(JSON.stringify(value))};};
const snapshot=service.prepare({workIds:[work.instance.id],includedFileIds:[file.id],fileRoles:{[file.id]:'NORMATIVE'}});let job=service.start({preparationId:snapshot.id,expectedContentHash:snapshot.contentHash,consentVersion:'worket-data-v1',commandId:id()});await new Promise(r=>setImmediate(r));job=await service.get(job.id);writeFileSync(join(output,'setup-job.json'),JSON.stringify(job,null,2));writeFileSync(join(output,'wire.json'),JSON.stringify(client.request,null,2));assert.equal(job.status,'AWAITING_REVIEW',job.error);core.close();
const count=()=>{const db=new DatabaseSync(databasePath,{readOnly:true});try{return db.prepare('SELECT count(*) n FROM source_snapshots').get().n;}finally{db.close();}};
const report={run,status:'RUNNING',directory,packaged:!!process.env.WORKPET_EXECUTABLE_PATH,actualProviderCalls:0,externalAgent:false,checks:{}};let app,panel;
async function launch(){app=await electron.launch({executablePath:process.env.WORKPET_EXECUTABLE_PATH??join(process.cwd(),'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),args:[...(process.env.WORKPET_EXECUTABLE_PATH?['--use-mock-keychain']:['.']),`--user-data-dir=${directory}`,'--dev'],cwd:process.cwd(),env:{...process.env,WORKPET_DATA_DIR:directory,WORKPET_BRIDGE_CONFIG:join(directory,'bridge.json'),WORKPET_SKIP_INTEGRATIONS:'1'}});panel=undefined;const until=Date.now()+15000;while(!panel&&Date.now()<until){panel=app.windows().find(p=>p.url().endsWith('/panel.html'));if(!panel)await new Promise(r=>setTimeout(r,100));}assert.ok(panel);panel.setDefaultTimeout(15000);await panel.evaluate(()=>window.workpet.distillation('setImprovementPreference',{enabled:false}));await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/panel.html'));w.setSize(410,700);w.show();});}
const open=()=>panel.evaluate(async id=>(await import('./distillation.js')).openJob(id),job.id);
const draft=()=>panel.evaluate(id=>window.workpet.distillation('draft',{id}),job.draftId);
try{
 await launch();await open();await panel.locator('[data-review-action="keep"][data-issue="review-input"]').click();await panel.locator('[data-review-action="keep"][data-issue="review-limit"]').click();
 writeFileSync(path,'# 新规范\n## 摘要\n\n每个摘要不超过 30 words。\n');
 await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},path);
 await panel.locator('[data-review-action="document-version"][data-address="constraints.limit"]').click();const previous=await draft(),before=count();
 await panel.locator('#doc-start-line').fill('3');await panel.locator('#doc-end-line').fill('3');await panel.locator('[data-review-action="adopt-document"]').click();await panel.locator('#definition-error').waitFor({state:'visible'});
 report.observed={failedAdoptionSnapshotDelta:count()-before};assert.deepEqual(await draft(),previous,'failed adoption cannot mutate the draft');
 await panel.locator('#doc-start-line').fill('4');await panel.locator('#doc-end-line').fill('4');await panel.locator('[data-review-action="adopt-document"]').click();await panel.locator('#dr-status').filter({hasText:'新版条款已保存'}).waitFor();
 const changed=await draft();report.observed.unrelatedResolutionPreserved=changed.resolutions.some(r=>r.issueId==='review-input');report.observed.changedRuleResolutionCleared=!changed.resolutions.some(r=>r.issueId==='review-limit');report.observed.dependentReviewReopened=changed.issues.some(i=>i.id==='rule-change-constraints.alias'&&!changed.resolutions.some(r=>r.issueId===i.id));
 assert.equal(report.observed.failedAdoptionSnapshotDelta,0,'failed adoption must not persist an orphan normative snapshot');assert.equal(report.observed.unrelatedResolutionPreserved,true,'unrelated input decision must survive adopting a new clause');assert.equal(report.observed.changedRuleResolutionCleared,true);assert.equal(report.observed.dependentReviewReopened,true);
 const clause=changed.content.constraints.find(i=>i.key==='limit');assert.equal(clause.document.startLine,4);assert.equal(clause.text,'每个摘要不超过 30 words。');assert.ok(changed.refs.some(r=>r.snapshotId===clause.document.source.snapshotId&&r.eventId===clause.document.source.eventId));
 report.checks.blankSelectionAndScopedReview=true;
 await app.close();app=undefined;unlinkSync(path);await launch();await open();assert.deepEqual(await draft(),changed);await panel.screenshot({path:join(output,'restored-document.png')});
 await panel.locator('[data-review-action="keep"][data-issue="review-limit"]').click();await panel.locator('[data-review-action="exclude"][data-issue="rule-change-constraints.alias"]').click();await panel.locator('#publish-definition').click();await panel.locator('#use-definition').waitFor();
 await panel.locator('#use-definition').click();await panel.locator('[data-input="subject"]').fill('新的摘要主题');await panel.locator('#create-defined-work').click();await panel.locator('#back-to-list').waitFor();
 const workId=(await panel.evaluate(()=>window.workpet.getDashboard())).selectedWorkId,pkg=(await panel.evaluate(workId=>window.workpet.distillation('package',{workId}),workId)).json;assert.equal(pkg.definition.content.constraints.length,1);assert.equal(pkg.definition.content.constraints[0].text,'每个摘要不超过 30 words。');assert.equal(pkg.ruleSources[0].startLine,4);
 const bridge=JSON.parse(readFileSync(join(directory,'bridge.json'),'utf8'));const response=await fetch(`http://${bridge.host}:${bridge.port}/mcp`,{method:'POST',headers:{'content-type':'application/json','x-workpet-token':bridge.token},body:JSON.stringify({jsonrpc:'2.0',id:id(),method:'tools/call',params:{name:'get_work_context',arguments:{work_id:workId}}})});const value=await response.json();assert.ok(!value.error&&!value.result.isError);assert.equal(JSON.parse(value.result.content[0].text).workPackage.ruleSources[0].startLine,4);
 report.checks.restartRemovedOriginalPublicationAndMcp=true;report.status='PASSED';
}catch(error){report.status='FAILED';report.error=error.stack??String(error);process.exitCode=1;if(panel)await panel.screenshot({path:join(output,'failure.png')}).catch(()=>{});}
finally{if(app)await app.close().catch(()=>{});writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
