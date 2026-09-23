// Two explicitly selected synthetic skills; real Electron/MCP and cross-directory module execution.
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
const run=new Date().toISOString().replace(/[:.]/g,'-'),output=join(process.cwd(),'output/combined-skills',run);mkdirSync(output,{recursive:true});
const directory=mkdtempSync(join(tmpdir(),'worket-combined-skills-')),skill=join(directory,'report-builder'),template=join(directory,'format-kit');
writeSkillFixture(skill);
function dependency(label){mkdirSync(join(template,'references'),{recursive:true});mkdirSync(join(template,'scripts'),{recursive:true});writeFileSync(join(template,'SKILL.md'),'# Format Kit\n读取 references/format.md。');writeFileSync(join(template,'references/format.md'),label);writeFileSync(join(template,'scripts/format.mjs'),"import {readFileSync} from 'node:fs';export const format=readFileSync(new URL('../references/format.md',import.meta.url),'utf8');");}
dependency('依赖格式 v1');
writeFileSync(join(skill,'SKILL.md'),'# Report Builder\n读取 ../format-kit/SKILL.md 和 ../format-kit/references/format.md，然后执行 scripts/report.mjs <主题> <输出路径>。');
writeFileSync(join(skill,'scripts/format.mjs'),"export {format} from '../../format-kit/scripts/format.mjs';");
const core=createWorkCore({databasePath:join(directory,'workpet.sqlite')}),work=source(core,'以后用 Report Builder 技能和固定模板，依据每次的新主题生成报告。');
const client=new FixtureClient();client.get=async requestId=>{const candidate=result(client.request),basis=candidate.content.purpose.basis;candidate.content=structuredClone(skillContent);candidate.content.materialRoles.push({key:'template',text:'Format Kit',kind:'SKILL',required:true,basis});for(const row of [candidate.content.purpose,...Object.values(candidate.content).filter(Array.isArray).flat()]) row.basis=structuredClone(basis);return{requestId,status:'SUCCEEDED',result:candidate};};
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
async function select(role,path){await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},path);await panel.locator(`[data-review-action="material"][data-address="materialRoles.${role}"]`).click();}
try{
 await launch();await open();await select('builder',skill);await select('template',template);
 const conflict=join(directory,'conflict','report-builder');writeSkillFixture(conflict,'另一个同名技能');await select('template',conflict);
 await panel.locator('#save-draft').click();await panel.locator('#definition-error').filter({hasText:'技能目录同名'}).waitFor();
 const unchanged=await panel.evaluate(id=>window.workpet.distillation('draft',{id}),job.draftId);assert.equal(unchanged.materials?.length??0,0,'conflicting selection cannot partially save');
 await select('template',template);report.checks.nameCollisionCannotPartiallySave=true;
 await panel.locator('#save-draft').click();await panel.locator('#dr-status').filter({hasText:'已暂存'}).waitFor();
 await panel.locator('[data-review-action="close"]').click();await open();
 assert.equal(await panel.getByRole('button',{name:'更换资料',exact:true}).count(),2,'saved draft must retain both selected materials after reopen');
 report.checks.reopenRetainsSelections=true;
 await app.close();app=undefined;dependency('原件已改写 v2');
 await launch();await open();assert.equal(await panel.getByRole('button',{name:'更换资料',exact:true}).count(),2);
 await panel.screenshot({path:join(output,'restored-draft.png')});
 rmSync(template,{recursive:true});rmSync(skill,{recursive:true});
 await panel.locator('#publish-definition').click();await panel.locator('#use-definition').waitFor();
 await panel.locator('#use-definition').click();await panel.locator('[data-input="subject"]').fill('全新主题');await panel.locator('#create-defined-work').click();await panel.locator('#back-to-list').waitFor();
 const workId=(await panel.evaluate(()=>window.workpet.getDashboard())).selectedWorkId;
 const pkg=(await panel.evaluate(workId=>window.workpet.distillation('package',{workId}),workId)).json;
 const builder=pkg.skills.find(s=>s.name==='Report Builder'),format=pkg.skills.find(s=>s.name==='Format Kit');
 assert.equal(readFileSync(join(builder.directory,'../format-kit/references/format.md'),'utf8'),'依赖格式 v1','selected sibling dependency resolves from the fixed skill directory');
 assert.equal(dirname(builder.directory),dirname(format.directory));
 const artifact=join(directory,'report.md');execFileSync(process.execPath,[join(builder.directory,'scripts/report.mjs'),'全新主题',artifact]);assert.match(readFileSync(artifact,'utf8'),/全新主题\n依赖格式 v1/);
 const bridge=JSON.parse(readFileSync(join(directory,'bridge.json'),'utf8'));const response=await fetch(`http://${bridge.host}:${bridge.port}/mcp`,{method:'POST',headers:{'content-type':'application/json','x-workpet-token':bridge.token},body:JSON.stringify({jsonrpc:'2.0',id:id(),method:'tools/call',params:{name:'get_work_context',arguments:{work_id:workId}}})});
 const mcp=await response.json();assert.ok(!mcp.error);const value=JSON.parse(mcp.result.content[0].text);assert.equal(value.workPackage.definition.id,pkg.definition.id);assert.equal(value.workPackage.skills.find(s=>s.name==='Report Builder').directory,builder.directory);
 writeFileSync(join(format.directory,'references/format.md'),'损坏的协同副本');
 const refreshed=await fetch(`http://${bridge.host}:${bridge.port}/mcp`,{method:'POST',headers:{'content-type':'application/json','x-workpet-token':bridge.token},body:JSON.stringify({jsonrpc:'2.0',id:id(),method:'tools/call',params:{name:'get_work_context',arguments:{work_id:workId}}})});
 const checked=await refreshed.json();assert.ok(!checked.error);assert.ok(!checked.result.isError);assert.equal(readFileSync(join(format.directory,'references/format.md'),'utf8'),'依赖格式 v1');report.checks.mcpRebuildsDamagedDerivedEnvironment=true;
 report.checks.restartFrozenVersionPublicationAndMcp=true;report.checks.syntheticSkillExecution=true;
 await panel.locator('#tab-definitions').click();await panel.locator(`[data-definition="${pkg.definition.id}"]`).click();await panel.locator('#revise-definition').click();
 dependency('依赖格式 v2');await select('template',template);await panel.locator('#save-draft').click();await panel.locator('#dr-status').filter({hasText:'已暂存'}).waitFor();await panel.locator('[data-review-action="close"]').click();
 await panel.locator(`[data-definition="${pkg.definition.id}"]`).click();await panel.locator('#revise-definition').click();
 assert.equal(await panel.locator('[data-review-action="material"][data-address="materialRoles.template"]').innerText(),'更换资料','manual revision must resume its saved selections');
 await panel.locator('#publish-definition').click();await panel.locator('#use-definition').waitFor();
 const versions=await panel.evaluate(key=>window.workpet.distillation('versions',{key}),pkg.definition.definitionKey);assert.equal(versions[0].version,2);assert.equal(readFileSync(join(dirname(versions[0].materials.find(m=>m.role==='template').path),'references/format.md'),'utf8'),'依赖格式 v2');
 const old=(await panel.evaluate(workId=>window.workpet.distillation('package',{workId}),workId)).json;assert.equal(readFileSync(join(old.skills.find(s=>s.name==='Report Builder').directory,'../format-kit/references/format.md'),'utf8'),'依赖格式 v1');
 await panel.locator('#use-definition').click();await panel.locator('[data-input="subject"]').fill('第二次全新主题');await panel.locator('#create-defined-work').click();await panel.locator('#back-to-list').waitFor();
 const freshId=(await panel.evaluate(()=>window.workpet.getDashboard())).selectedWorkId;const fresh=(await panel.evaluate(workId=>window.workpet.distillation('package',{workId}),freshId)).json;
 const nextBuilder=fresh.skills.find(s=>s.name==='Report Builder');execFileSync(process.execPath,[join(nextBuilder.directory,'scripts/report.mjs'),'第二次全新主题',artifact]);assert.match(readFileSync(artifact,'utf8'),/第二次全新主题\n依赖格式 v2/);assert.notEqual(nextBuilder.directory,builder.directory);
 report.checks.dependencyVersionIsolation=true;
 report.checks.manualRevisionResumeAndOldInstance=true;report.status='PASSED';
}catch(error){report.status='FAILED';report.error=error.stack??String(error);process.exitCode=1;if(panel)await panel.screenshot({path:join(output,'failure.png')}).catch(()=>{});}
finally{if(app)await app.close().catch(()=>{});writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
