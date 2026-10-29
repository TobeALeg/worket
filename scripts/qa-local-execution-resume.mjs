import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { _electron as electron } from 'playwright';
const root=process.cwd(), output=join(root,'reports/local-execution-2026-10-29');
const session=JSON.parse(readFileSync(join(output,'session.json'),'utf8'));
const {directory,definitionId,workId}=session;
const app=await electron.launch({executablePath:join(root,'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),args:['.',`--user-data-dir=${directory}`,'--dev'],cwd:root,env:{...process.env,WORKPET_SKIP_INTEGRATIONS:'1',WORKPET_BRIDGE_CONFIG:join(directory,'bridge.json'),WORKPET_DATA_DIR:directory,WORKET_CONNECTOR_ISOLATION:'1'}});
try {
  let panel;
  for(let i=0;i<100;i++){panel=app.windows().find(p=>p.url().endsWith('/panel.html'));if(panel)break;await new Promise(r=>setTimeout(r,100));}
  assert.ok(panel);
  await panel.locator('#tab-definitions').click();
  await panel.locator(`[data-definition="${definitionId}"]`).click();
  await panel.locator('#use-definition').click();
  assert.equal(await panel.locator('#local-directory').textContent(),'/Users/dandi/VideoCreator');
  assert.match(await panel.locator('#local-files').textContent(),/export-standard.md/);
  await panel.locator('#local-project-fields summary').click();
  await panel.screenshot({path:join(output,'04-remembered-project.png')});
  await panel.evaluate(async workId=>{const d=await window.workpet.getDashboard(workId);await(await import('./distillation.js')).workDefinitionAction(d.selectedWork,'execution-evidence');},workId);
  await panel.waitForFunction(()=>document.querySelector('#local-status')?.textContent.includes('本轮结束'));
  const record=await panel.evaluate(workId=>window.workpet.localExecution('get',{workId}),workId);
  const second=JSON.parse(readFileSync(join(output,'second-turn.json'),'utf8'));
  assert.equal(record.manifestHash,second.manifestHash); assert.equal(record.status,'TURN_ENDED');
  await panel.screenshot({path:join(output,'05-reopened-evidence.png')});
  await panel.locator('#execution-followup').fill('最后核对：只读取刚才的 script-draft.md 和 execution-proof.json，确认备注已写入、revision 为 2 且阶段仍是 awaiting_review。用一句话返回核对结果，不再修改任何文件。');
  await panel.locator('#continue-execution').click();
  let latest;
  for(let i=0;i<240;i++){
    latest=await panel.evaluate(workId=>window.workpet.localExecution('get',{workId}),workId);
    if(latest.status==='TURN_ENDED'&&latest.turnId!==second.turnId)break;
    assert.ok(!['FAILED','UNKNOWN','WAITING_APPROVAL'].includes(latest.status),latest.error??latest.status);
    await new Promise(r=>setTimeout(r,1000));
  }
  assert.equal(latest.status,'TURN_ENDED');assert.notEqual(latest.turnId,second.turnId);assert.equal(latest.threadId,second.threadId);assert.equal(latest.manifestHash,second.manifestHash);
  const d=await panel.evaluate(workId=>window.workpet.getDashboard(workId),workId);assert.equal(d.selectedWork.status,'OPEN');
  const proof=JSON.parse(readFileSync('/Users/dandi/VideoCreator/videos/20261029-worket-autostart/execution-proof.json','utf8'));
  assert.equal(proof.revision,2);assert.equal(proof.stage,'awaiting_review');
  assert.match(readFileSync('/Users/dandi/VideoCreator/videos/20261029-worket-autostart/script-draft.md','utf8'),/低机位靠近水面，注意脚下安全/);
  await panel.waitForFunction(()=>document.querySelector('#local-status')?.textContent.includes('本轮结束'));
  await panel.screenshot({path:join(output,'06-resumed-thread.png')});
  writeFileSync(join(output,'third-turn.json'),JSON.stringify(latest,null,2));
  writeFileSync(join(output,'acceptance.json'),JSON.stringify({passed:true,...session,threadId:latest.threadId,turnIds:[JSON.parse(readFileSync(join(output,'first-turn.json'))).turnId,second.turnId,latest.turnId],manifestHash:latest.manifestHash,workStatus:d.selectedWork.status,checks:['real Electron start button','original thread revision','same immutable manifest','remembered directory and selected files','restart readback','restart same-thread continuation','actual VideoCreator draft and revision proof']},null,2));
  console.log(JSON.stringify({passed:true,threadId:latest.threadId,directory}));
} finally {await app.close();}
