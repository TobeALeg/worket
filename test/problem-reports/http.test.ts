import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createManagedService } from '../../server/managed.mjs';
import { envelope } from './fixture.ts';
import { randomUUID } from 'node:crypto';
import { reportHash } from '../../dist/contracts/problem-report.js';

test('未配置模型也能完整接收报告、跨身份隔离、管理员备注保密、删除后不复活',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'worket-report-http-'));
  const service=createManagedService({directory});await new Promise<void>(resolve=>service.server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${(service.server.address() as any).port}`;
  let cookie='',csrf='';
  const admin=async(path:string,method='GET',input?:unknown)=>{const response=await fetch(url+'/admin/api/'+path,{method,headers:{Cookie:cookie,'X-Worket-CSRF':csrf,'Content-Type':'application/json'},...(input ? {body:JSON.stringify(input)} : {})});return {status:response.status,value:await response.json(),headers:response.headers};};
  const send=async(path:string,token:string,method='GET',input?:unknown)=>{const response=await fetch(url+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(input ? {body:JSON.stringify(input)} : {})});return {status:response.status,value:await response.json()};};
  try {
    const setup=await admin('setup','POST',{password:'synthetic-feedback-test'});assert.equal(setup.status,200);cookie=setup.headers.get('set-cookie')!.split(';')[0]!;csrf=setup.value.csrf;
    const first=(await admin('clients','POST',{name:'反馈测试',days:7})).value;const second=(await admin('clients','POST',{name:'其他测试',days:7})).value;
    assert.ok(first.token);assert.deepEqual((await send('/v1/capabilities',first.token)).value.problemReportSchemaVersions,[1]);
    const e=envelope();
    const ownedId=randomUUID(),otherId=randomUUID();
    for(const [id,subject] of [[ownedId,first.userId],[otherId,second.userId]]) {
      service.db.prepare("INSERT INTO requests(id,subject,command_key,hash,status,created,updated,calls,usage_json,error) VALUES(?,?,?,'test','FAILED',?,?,0,'{}',?)").run(id,subject,id,Date.now(),Date.now(),'private provider error /Users/private Bearer token');
      e.report.diagnostics!.events.push({...e.report.diagnostics!.events[0]!,action:'connection',phase:'failed',code:'SERVICE_REQUEST_FAILED',requestId:id});
    }
    e.sha256=reportHash(e.report);
    const received=await send('/v1/problem-reports',first.token,'POST',e);assert.equal(received.status,200);assert.equal(received.value.sha256,e.sha256);
    assert.deepEqual((await send('/v1/problem-reports',first.token,'POST',e)).value,received.value);
    assert.equal((await send(`/v1/problem-reports/${e.report.reportId}`,second.token)).status,404);
    const list=await admin('problem-reports');const item=list.value.items[0];assert.equal(item.report.screenshots[0].data,undefined);assert.deepEqual(item.report.diagnostics.events,[]);assert.ok(item.errorCodes.includes('SERVICE_REQUEST_FAILED'));const path=`problem-reports/${item.subject}/${item.reportId}`;
    const detail=(await admin(path)).value;assert.deepEqual(detail.requests.map((request:any)=>request.id),[ownedId]);assert.equal(detail.requests[0].error,'SERVICE_REQUEST_FAILED');assert.doesNotMatch(JSON.stringify(detail),/private provider error|Bearer token|Users\/private/);
    assert.equal((await admin(path,'PUT',{state:'排查中',note:'管理员私有内容',publicNote:'正在检查'})).status,200);
    const user=await send(`/v1/problem-reports/${item.reportId}`,first.token);assert.equal(user.value.publicNote,'正在检查');assert.equal(user.value.note,undefined);assert.equal(user.value.subject,undefined);
    const image=await fetch(url+'/admin/api/'+path+'/images/'+e.report.screenshots[0]!.id,{headers:{Cookie:cookie}});assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');
    assert.equal((await fetch(url+'/admin/api/'+path+'/images/'+e.report.screenshots[0]!.id)).status,401);
    assert.equal((await send(`/v1/problem-reports/${item.reportId}`,first.token,'DELETE')).status,200);assert.equal((await send('/v1/problem-reports',first.token,'POST',e)).value.code,'REPORT_DELETED');assert.equal((await admin('problem-reports')).value.items.length,0);
    assert.equal((await admin(`clients/${first.id}/revoke`,'POST',{})).status,200);assert.equal((await send('/v1/problem-reports',first.token)).status,401);
  } finally {await service.close();rmSync(directory,{recursive:true,force:true});}
});
