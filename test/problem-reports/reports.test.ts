import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,readFileSync,readdirSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Diagnostics } from '../../dist/diagnostics/recorder.js';
import { ReportStore } from '../../dist/problem-reports/store.js';
import { ReportClient } from '../../dist/problem-reports/client.js';
import { ProblemReports } from '../../dist/problem-reports/service.js';
import { ContractError } from '../../dist/contracts/definition.js';
import { validateEnvelope,reportHash,REPORT_LIMITS } from '../../dist/contracts/problem-report.js';
import { ProblemReportStore } from '../../server/problem-reports.mjs';
import { envelope } from './fixture.ts';

test('报告只接收白名单事件、完整图片与明确的本次日志授权',()=>{
  const e=envelope();validateEnvelope(e);
  for(const mutate of [(v:any)=>v.report.diagnostics.events[0].message='secret',(v:any)=>v.report.authorization.diagnostics=false,(v:any)=>v.report.screenshots[0].data='AA==',(v:any)=>v.report.environment.path='/Users/private']) {
    const bad=structuredClone(e);mutate(bad);bad.sha256=reportHash(bad.report);assert.throws(()=>validateEnvelope(bad));
  }
  const noLogs=envelope(false);validateEnvelope(noLogs);assert.equal(noLogs.report.diagnostics,null);
});
test('结构化轨迹不保存错误原文，同一交接共享 trace；故障在重启后保留',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'worket-diagnostics-'));
  try {
    const recorder=new Diagnostics(directory);
    await assert.rejects(recorder.operation('handoff',async()=>{recorder.event('handoff','selected',{executor:'codex'});throw new Error('Bearer private-token /Users/private chat content');}));
    const events=recorder.snapshot().events.filter(e=>e.action==='handoff');assert.equal(new Set(events.map(e=>e.traceId)).size,1);assert.equal(events.at(-1)?.code,'OPERATION_FAILED');
    const text=readdirSync(join(directory,'diagnostics')).filter(f=>f.endsWith('.jsonl')).map(f=>readFileSync(join(directory,'diagnostics',f),'utf8')).join('');assert.doesNotMatch(text,/private-token|Users|chat content/);
    const restarted=new Diagnostics(directory);assert.equal(restarted.previousExit,true);assert.ok(restarted.fault()?.events.some(e=>e.phase==='failed'));restarted.close();
    const normal=new Diagnostics(directory);assert.equal(normal.previousExit,false);normal.close();
  } finally {rmSync(directory,{recursive:true,force:true});}
});
test('草稿固定诊断范围，发送清除草稿；断网且回执丢失后的重启重试只接收一次',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'worket-report-')),server=new ProblemReportStore(':memory:');
  const diagnostics=new Diagnostics(directory);let lost=true;
  class Client extends ReportClient {
    override async request(path:string,method='GET',input?:any):Promise<any> {
      if(path==='/v1/capabilities')return {problemReportSchemaVersions:[1]};
      if(method==='POST'){const receipt=server.receive('user','device',input);if(lost){lost=false;throw new ContractError('REPORT_NETWORK_UNAVAILABLE','network',true);}return receipt;}
      if(method==='DELETE')return server.delete('user',path.split('/').at(-1));
    }
  }
  const client=new Client(()=>({url:'https://test.example',token:'test'}));
  try {
    const store=new ReportStore(directory),reports=new ProblemReports(store,client,diagnostics,{version:'0.1.8',platform:'darwin',arch:'arm64'});
    const initial=reports.draft();diagnostics.event('handoff','pending');
    const saved=reports.save({description:'出了问题',consent:true,scope:initial.scope});assert.deepEqual(saved.diagnostics,initial.diagnostics);
    reports.add(envelope().report.screenshots[0]!);
    const item=reports.submit({description:'出了问题',consent:true,scope:initial.scope});
    // Wait for the explicitly submitted async attempt, not a new unauthorized request.
    for(let i=0;i<30 && !store.get(item.id).attempts;i++)await new Promise(r=>setTimeout(r,1));
    for(let i=0;i<30 && store.get(item.id).status==='SENDING';i++)await new Promise(r=>setTimeout(r,1));
    assert.equal(store.get(item.id).status,'WAITING');assert.equal(store.draft(),null);reports.close();
    const restored=new ReportStore(directory);assert.equal(restored.get(item.id).envelope?.sha256,item.envelope?.sha256);restored.update(item.id,{nextAttempt:0});
    const retry=new ProblemReports(restored,client,diagnostics,reports.environment);await retry.send(item.id);assert.equal(restored.get(item.id).status,'RECEIVED');assert.equal(server.list('user').length,1);retry.close();
  } finally {diagnostics.close();server.close();rmSync(directory,{recursive:true,force:true});}
});
test('身份变化暂停上传，不追加日志；取消先落墓碑阻止迟到上传复活',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'worket-report-scope-')),server=new ProblemReportStore(':memory:');let token='first',calls=0;
  const diagnostics=new Diagnostics(directory);
  class Client extends ReportClient {override async request():Promise<any>{calls++;throw new Error('must not send');}}
  const client=new Client(()=>({url:'https://test.example',token})),store=new ReportStore(directory),reports=new ProblemReports(store,client,diagnostics,{version:'0.1.8',platform:'darwin',arch:'arm64'});
  try {
    const e=envelope(),item=store.enqueue(client.scope(),e);token='second';await reports.send(item.id);assert.equal(calls,0);assert.equal(store.get(item.id).status,'PAUSED');assert.throws(()=>reports.retry(item.id));
    const changed=reports.draft();assert.equal(changed.consent,false);
    server.delete('user',e.report.reportId);assert.throws(()=>server.receive('user','device',e),/REPORT_DELETED/);
    const fresh=envelope();server.receive('user','device',fresh);const wrong=structuredClone(fresh);wrong.report.description='不同内容';wrong.sha256=reportHash(wrong.report);assert.throws(()=>server.receive('user','device',wrong),/IDEMPOTENCY_CONFLICT/);
    assert.throws(()=>server.get('other',fresh.report.reportId),/NOT_FOUND/);
    const expired=envelope();expired.report.submittedAt=new Date(Date.now()-REPORT_LIMITS.localTtl-1000).toISOString();expired.sha256=reportHash(expired.report);assert.throws(()=>server.receive('user','device',expired),/REPORT_EXPIRED/);
  } finally {reports.close();diagnostics.close();server.close();rmSync(directory,{recursive:true,force:true});}
});

test('草稿图片与授权重启恢复，草稿和未收报告到期后清理正文',()=>{
  const directory=mkdtempSync(join(tmpdir(),'worket-report-expiry-'));
  try {
    const store=new ReportStore(directory),e=envelope();
    const draft={description:'补截图后继续',screenshots:e.report.screenshots,diagnostics:e.report.diagnostics!,consent:true,scope:'same',occurredAt:e.report.occurredAt,updatedAt:Date.now()};
    store.writeDraft(draft);assert.deepEqual(new ReportStore(directory).draft(),draft);
    const item=store.enqueue('same',e);store.writeDraft({...draft,updatedAt:Date.now()-REPORT_LIMITS.localTtl-1});
    const saved=JSON.parse(readFileSync(store.path,'utf8'));saved.reports[0].createdAt=Date.now()-REPORT_LIMITS.localTtl-1;
    writeFileSync(store.path,JSON.stringify(saved));
    const restored=new ReportStore(directory);assert.equal(restored.draft(),null);assert.equal(restored.get(item.id).status,'EXPIRED');assert.equal(restored.get(item.id).envelope,null);
    assert.doesNotMatch(readFileSync(store.path,'utf8'),/补截图后继续/);
  } finally {rmSync(directory,{recursive:true,force:true});}
});
test('后台接收与删除标记在重启后保持，独立容量限额及 30 天清理生效',()=>{
  const directory=mkdtempSync(join(tmpdir(),'worket-report-server-')),path=join(directory,'reports.sqlite');let server=new ProblemReportStore(path);
  try {
    const e=envelope(),receipt=server.receive('user','device',e);server.close();server=new ProblemReportStore(path);
    assert.deepEqual(server.receive('user','device',e),receipt);
    server.db.prepare('UPDATE problem_reports SET bytes=? WHERE id=?').run(REPORT_LIMITS.deviceDailyBytes,e.report.reportId);
    assert.throws(()=>server.receive('user','device',envelope()),/REPORT_RATE_LIMITED/);
    server.db.prepare('UPDATE problem_reports SET received=? WHERE id=?').run(Date.now()-REPORT_LIMITS.reportTtl-1,e.report.reportId);server.expire();
    assert.throws(()=>server.get('user',e.report.reportId),/NOT_FOUND/);assert.equal(server.db.prepare('SELECT payload FROM problem_reports WHERE id=?').get(e.report.reportId).payload,null);
    server.close();server=new ProblemReportStore(path);assert.throws(()=>server.receive('user','device',e),/REPORT_DELETED/);
  } finally {server.close();rmSync(directory,{recursive:true,force:true});}
});

test('取消未知上传的删除标记受设备限额约束，已有报告仍可随时删除',()=>{
  const server=new ProblemReportStore(':memory:');
  try {
    const e=envelope();server.receive('user','device',e);
    for(let i=1;i<REPORT_LIMITS.deviceDaily;i++)server.delete('user',randomUUID(),'device');
    assert.throws(()=>server.delete('user',randomUUID(),'device'),/REPORT_RATE_LIMITED/);
    assert.deepEqual(server.delete('user',e.report.reportId,'device'),{deleted:true});
    assert.throws(()=>server.get('user',e.report.reportId),/NOT_FOUND/);
  } finally {server.close();}
});
