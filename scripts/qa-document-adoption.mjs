// Preregistered synthetic file/chat sources, actual Electron/model/MCP; no business delivery claim.
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {_electron as electron} from 'playwright';
import {createWorkCore} from '../dist/core/index.js';
import {hash} from '../dist/definitions/storage.js';
import {source} from '../test/distillation/fixtures.ts';
import {createAIService} from '../server/service.mjs';
import {recordedModelProvider} from './lib/recorded-model-provider.mjs';
import {contractReplay} from './lib/contract-replay.mjs';
import {norm,documentCases,verifyDraft,verifyContent,verifyLabels} from './lib/document-adoption-cases.mjs';
assert.ok(process.env.WORKET_DOCUMENT_REPLAY || process.env.WORKET_DOCUMENT_LIVE==='1','explicit live or replay selection required');
const run=new Date().toISOString().replace(/[:.]/g,'-'),output=join(process.cwd(),'output/document-adoption',run);mkdirSync(output,{recursive:true});
const summary={run,status:'RUNNING',synthetic:true,externalAgent:false,cases:[]};
for(const trial of documentCases.filter(c=>!process.env.WORKET_DOCUMENT_CASE||c.id===process.env.WORKET_DOCUMENT_CASE)){
 const out=join(output,trial.id);mkdirSync(out);const directory=mkdtempSync(join(tmpdir(),'worket-document-adoption-')),path=join(directory,'FRAME.md');writeFileSync(path,norm);
 const core=createWorkCore({databasePath:join(directory,'workpet.sqlite')}),original=source(core,trial.conversation);
 core.addArtifactRef(original.instance.id,{path,filename:'FRAME.md',role:'REFERENCE',mimeType:'text/markdown',size:Buffer.byteLength(norm),sha256:hash(norm),lastModifiedAt:new Date().toISOString(),availability:'AVAILABLE'});core.completeWork(original.instance.id);core.close();
 const replay=process.env.WORKET_DOCUMENT_REPLAY?contractReplay(join(process.env.WORKET_DOCUMENT_REPLAY,trial.id)):null;let replayCalls=0;
 const provider=replay?{model:'frozen-document-adoption',calls:0,usages:[],async call(messages){const value=replay(messages,++replayCalls);writeFileSync(join(out,`request-${replayCalls}.json`),JSON.stringify(messages,null,2));writeFileSync(join(out,`response-${replayCalls}.json`),JSON.stringify(value,null,2));return value;}}:recordedModelProvider({directory:out,maxCalls:2});
 const secret=randomUUID(),service=createAIService({mode:'development',devSecret:secret,issuer:'qa',audience:'qa',provider,limits:{dailyCalls:2}});await new Promise(r=>service.server.listen(0,'127.0.0.1',r));
 const header=Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url'),body=Buffer.from(JSON.stringify({sub:'qa-document',iss:'qa',aud:'qa',exp:Date.now()/1000+3600})).toString('base64url');const token=`${header}.${body}.${createHmac('sha256',secret).update(`${header}.${body}`).digest('base64url')}`;
 const report={id:trial.id,status:'RUNNING',directory,output:out,packaged:!!process.env.WORKPET_EXECUTABLE_PATH,actualProviderCalls:0,usage:[],checks:{}};let app,panel;
 try{
  app=await electron.launch({executablePath:process.env.WORKPET_EXECUTABLE_PATH??join(process.cwd(),'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),args:[...(process.env.WORKPET_EXECUTABLE_PATH?['--use-mock-keychain']:['.']),`--user-data-dir=${directory}`,'--dev'],cwd:process.cwd(),env:{...process.env,WORKPET_SKIP_INTEGRATIONS:'1',WORKPET_DATA_DIR:directory,WORKPET_BRIDGE_CONFIG:join(directory,'bridge.json')}});
  const until=Date.now()+15000;while(!panel&&Date.now()<until){panel=app.windows().find(p=>p.url().endsWith('/panel.html'));if(!panel)await new Promise(r=>setTimeout(r,100));}assert.ok(panel);panel.setDefaultTimeout(15000);
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/panel.html'));w.setSize(410,700);w.show();});
  await panel.evaluate(({url,token})=>window.workpet.configureWorketService({url,token}),{url:`http://127.0.0.1:${service.server.address().port}`,token});
  await panel.locator('#tab-completed').click();await panel.locator('[data-distill-work]').check();await panel.locator('#distill-selected').click();
  await panel.locator('[data-file-id]').check();await panel.locator('#apply-range').click();await panel.locator('[data-file-role]').selectOption('NORMATIVE');await panel.locator('#apply-range').click();
  await panel.locator('#improvement-consent').uncheck();await panel.locator('#consent').check();await panel.locator('#start-distillation').click();
  let job;const deadline=Date.now()+420000;while(Date.now()<deadline){[job]=await panel.evaluate(()=>window.workpet.distillation('jobs'));if(job&&['AWAITING_REVIEW','FAILED'].includes(job.status))break;await new Promise(r=>setTimeout(r,1000));}
  writeFileSync(join(out,'job.json'),JSON.stringify(job,null,2));assert.equal(job?.status,'AWAITING_REVIEW',job?.error);
  const draft=await panel.evaluate(id=>window.workpet.distillation('draft',{id}),job.draftId);writeFileSync(join(out,'draft.json'),JSON.stringify(draft,null,2));verifyDraft(draft);report.checks.semanticScopeAndDocumentClauses=true;
  await panel.evaluate(async id=>(await import('./distillation.js')).openJob(id),job.id);await panel.screenshot({path:join(out,'review.png')});
  for(const role of draft.content.materialRoles.filter(role=>role.kind==='SKILL')){
   const skill=join(directory,'qa-video-skill');mkdirSync(skill,{recursive:true});writeFileSync(join(skill,'SKILL.md'),'# QA Video Defaults\n合成绑定夹具：未明确的制作参数按本次脚本处理。未执行视频业务。');
   await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},skill);
   await panel.locator(`[data-review-action="material"][data-address="materialRoles.${role.key}"]`).click();
  }
  for(const issue of draft.issues){const button=panel.locator(`[data-review-action="accept"][data-issue="${issue.id}"]`);if(await button.count())await button.click();}
  await panel.locator('#publish-definition').click();await panel.locator('#use-definition').waitFor();const definition=(await panel.evaluate(()=>window.workpet.distillation('definitions'))).items[0];
  unlinkSync(path);await panel.locator('#use-definition').click();await panel.locator(`[data-input="${definition.content.inputs[0].key}"]`).fill('下一期全新脚本文本');await panel.locator('#create-defined-work').click();await panel.locator('#back-to-list').waitFor();
  const workId=(await panel.evaluate(()=>window.workpet.getDashboard())).selectedWorkId,pkg=(await panel.evaluate(workId=>window.workpet.distillation('package',{workId}),workId)).json;writeFileSync(join(out,'package.json'),JSON.stringify(pkg,null,2));verifyContent(pkg.definition.content);
  assert.equal(Object.values(pkg.inputs)[0],'下一期全新脚本文本');assert.equal(pkg.definition.version,1);
  await panel.locator('[data-action="complete"]').click();const labels=await panel.locator('[data-criterion]').evaluateAll(elements=>elements.map(e=>[...e.parentElement.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('').trim()));verifyLabels(labels);report.acceptanceLabels=labels;
  const bridge=JSON.parse(readFileSync(join(directory,'bridge.json'),'utf8'));const response=await fetch(`http://${bridge.host}:${bridge.port}/mcp`,{method:'POST',headers:{'content-type':'application/json','x-workpet-token':bridge.token},body:JSON.stringify({jsonrpc:'2.0',id:randomUUID(),method:'tools/call',params:{name:'get_work_context',arguments:{work_id:workId}}})});const value=await response.json();assert.ok(!value.error&&!value.result.isError);verifyContent(JSON.parse(value.result.content[0].text).workPackage.definition.content);
  report.checks.removedOriginalNewInstanceAcceptanceAndMcp=true;report.status='PASSED';
 }catch(error){report.status='FAILED';report.error=error.stack??String(error);if(panel){await panel.screenshot({path:join(out,'failure.png')}).catch(()=>{});writeFileSync(join(out,'failure-dom.txt'),await panel.locator('body').innerText().catch(()=>''));}}
 finally{report.actualProviderCalls=provider.calls;report.usage=provider.usages;writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));summary.cases.push(report);console.log(JSON.stringify(report));await app?.close();await service.close();}
}
summary.status=summary.cases.length&&summary.cases.every(c=>c.status==='PASSED')?'PASSED':'FAILED';writeFileSync(join(output,'report.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));process.exitCode=summary.status==='PASSED'?0:1;
