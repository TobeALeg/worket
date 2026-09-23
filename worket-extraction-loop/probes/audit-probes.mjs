/** Diagnostic probes, NOT a production acceptance suite. Uses exact audited source.
 * All inputs and providers are synthetic; there are no network calls.
 * A GAP_REPRODUCED means an undesired output can pass a specific module boundary,
 * not that a real model emitted it or a human published it.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateResult, validateRequest } from '../audit-snapshot/dist/contracts/definition.js';
import { extractDefinition, chunksFor } from '../audit-snapshot/server/workflow.mjs';
import { LocalRuleExtractor } from '../audit-snapshot/src/extractor/local-rule-extractor.ts';

const sha = text => createHash('sha256').update(text).digest('hex');
const req = {
  schemaVersion: 1, snapshotHash: 'synthetic-audit',
  sources: [{key:'work-1',events:[
    {key:'event-1',sequence:1,kind:'user.prompt',content:'制作视频方案，每次都必须注明来源。本次给客户甲做30秒视频，不要沿用到其他客户。',hash:sha('audit-1')},
    {key:'event-2',sequence:2,kind:'agent.response',content:'建议所有以后的视频都使用倒计时。',hash:sha('audit-2')}
  ]}]
};
// Hashes are computed from the actual content (not the labels).
for (const s of req.sources) for (const e of s.events) e.hash = sha(e.content);
const refs = () => [{snapshotId:'wire',workId:'work-1',eventId:'event-1'}];
const item = (key,text) => ({key,text,basis:{type:'SOURCE',origin:'USER_STATED',refs:refs()}});
const mkResult = (request=req) => ({
  schemaVersion:1,compatibility:'COMPATIBLE',
  content:{schemaVersion:1,name:'视频方案',purpose:item('purpose','制作视频方案'),inputs:[],
    deliverables:[item('deliverable','视频方案')],constraints:[item('source','每次都必须注明来源')],
    acceptanceCriteria:[item('acceptance','来源已标注')],methods:[],materialRoles:[]},
  issues:[],groups:[],requirements:[{id:'r1',text:'每次都必须注明来源',scope:'REUSABLE',sourceKeys:['work-1/event-1'],replacedBy:null}],
  coverage:{inputEvents:request.sources.reduce((n,s)=>n+s.events.length,0),processedEvents:request.sources.reduce((n,s)=>n+s.events.length,0),processedChunks:1,eventKeys:request.sources.flatMap(s=>s.events.map(e=>`${s.key}/${e.key}`)),exclusions:[]},
  versions:{schema:1,prompt:'fixture',model:'fixture'}
});
const records=[];
async function probe(id,title,type,run){
  try { const details = await run(); records.push({id,title,status:type,...details}); }
  catch(e){records.push({id,title,status:'PROBE_ERROR',error:e.stack??String(e)});}
}
async function workflow(final,options={}){
  const input=options.request??req, calls=[];
  const provider={model:'AUDIT_SYNTHETIC_NOT_A_LIVE_MODEL',async call(messages){
    const payload=JSON.parse(messages[1].content); calls.push(payload);
    return {result: payload.phase==='extract' ? {
      requirements:options.intermediate ?? [{id:'r1',text:'每次都必须注明来源',scope:'REUSABLE',sourceKeys:['work-1/event-1'],replacedBy:null}],
      issues:[],eventKeys:payload.events.map(e=>`${e.sourceKey}/${e.key}`)
    } : structuredClone(final), usage:null};
  }};
  const output=await extractDefinition(input,provider,new AbortController().signal);
  return {output,calls};
}
await probe('C01','正常候选经真实workflow完成','CONTROL_PASSED',async()=>{
  const {calls}=await workflow(mkResult()); assert.equal(calls.length,2);
  return {providerCalls:calls.length};
});
await probe('C02','不存在的引用被拦截','CONTROL_PASSED',async()=>{
  const r=mkResult();r.content.constraints[0].basis.refs[0].eventId='missing';
  await assert.rejects(()=>workflow(r),/INVALID_SOURCE_REF/);return {};
});
await probe('C03','Agent来源冒充USER_STATED被workflow拦截','CONTROL_PASSED',async()=>{
  const r=mkResult();r.content.constraints[0].basis.refs[0].eventId='event-2';
  await assert.rejects(()=>workflow(r),/INVALID_SOURCE_REF/);return {};
});
await probe('G01','replacedBy循环可以通过结果校验和workflow','GAP_REPRODUCED',async()=>{
  const r=mkResult();r.requirements[0].replacedBy='r2';
  r.requirements.push({...r.requirements[0],id:'r2',replacedBy:'r1'});
  const {output}=await workflow(r);return {requirements:output.requirements};
});
await probe('G02','INSTANCE要求可出现在通用constraints，缺少可机检的映射屏障','GAP_REPRODUCED',async()=>{
  const r=mkResult();r.requirements[0]={id:'r1',text:'本次做30秒',scope:'INSTANCE',sourceKeys:['work-1/event-1'],replacedBy:null};
  r.content.constraints=[item('duration','所有视频必须30秒')];
  const {output}=await workflow(r);return {requirements:output.requirements,constraints:output.content.constraints};
});
await probe('G03','历史客户值可作为defaultValue通过workflow','GAP_REPRODUCED',async()=>{
  const r=mkResult();r.content.inputs=[{...item('customer','客户名称'),valueType:'TEXT',required:true,defaultValue:'客户甲'}];
  const {output}=await workflow(r);return {input:output.content.inputs[0]};
});
await probe('G04','合法事件引用不证明语义：相反要求可以通过workflow','GAP_REPRODUCED',async()=>{
  const r=mkResult();r.content.constraints=[item('source','以后不需要注明来源')];
  const {output}=await workflow(r);return {source:req.sources[0].events[0].content,constraint:output.content.constraints[0]};
});
await probe('G05','event coverage完整而requirements为空仍可返回有效content','GAP_REPRODUCED',async()=>{
  const r=mkResult();r.requirements=[];
  const {output,calls}=await workflow(r,{intermediate:[]});
  assert.equal(calls[1].chunks[0].requirements.length,0);
  return {coverage:output.coverage,requirements:output.requirements,contentPresent:!!output.content};
});
await probe('G06','非法中间requirement可以进入聚合阶段','GAP_REPRODUCED',async()=>{
  const {calls}=await workflow(mkResult(),{intermediate:[{id:'x',scope:'ALIEN',sourceKeys:['not-a-source'],garbage:true}]});
  assert.equal(calls[1].chunks[0].requirements[0].scope,'ALIEN');
  return {intermediateObservedByAggregate:calls[1].chunks[0].requirements};
});
await probe('L01','单事件超过chunkBytes明确拒绝，不静默丢弃','LIMIT_CONFIRMED',async()=>{
  const large=structuredClone(req);large.sources[0].events=[{...large.sources[0].events[0],content:'x'.repeat(24100)}];
  large.sources[0].events[0].hash=sha(large.sources[0].events[0].content);
  validateRequest(large);assert.throws(()=>chunksFor(large),/INPUT_TOO_LARGE/);
  return {singleEventCharacters:24100,requestValidation:'accepted',chunking:'INPUT_TOO_LARGE'};
});
const local = new LocalRuleExtractor();
const event=(id,kind,content)=>({externalId:id,sequence:1,kind,content,metadata:{},artifactRefs:[]});
await probe('G07','本地规则提取单批10条明确约束只返回前8条','GAP_REPRODUCED',async()=>{
  const patch=await local.extract({events:[event('e1','user.prompt',Array.from({length:10},(_,i)=>`必须满足第${i+1}项要求。`).join('\n'))]});
  assert.equal(patch.constraints.length,8);return {inputConstraints:10,outputConstraints:8,lastReturned:patch.constraints.at(-1).text};
});
await probe('G08','含否定语气的已完成字样仍进入completedActions','GAP_REPRODUCED',async()=>{
  const patch=await local.extract({events:[event('e1','agent.response','不能声称已完成，实际上还没开始。')]});
  assert.equal(patch.completedActions.length,1);
  return {completedActions:patch.completedActions,note:'文本仍保留否定且origin=AGENT_PROPOSED；这不是数据库COMPLETED状态'};
});
const files={
  'src/contracts/definition.ts':'9f8070830abadaf900564231c29996e404823f29',
  'src/extractor/local-rule-extractor.ts':'d44c013fb76d0796a0487f1cf3401584f11652eb',
  'server/workflow.mjs':'1a2412135aee544d02dec7468a7b5b9a9312a8e8'
};
const sourceVerification=Object.entries(files).map(([path,expected])=>{
  const bytes=readFileSync(new URL(`../audit-snapshot/${path}`,import.meta.url));
  const actual=createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
  return {path,expectedGitBlobSha:expected,actualGitBlobSha:actual,match:actual===expected};
});
const report={auditDate:'2026-09-18',baseCommit:'17f045c7f274e7e06e1e488f59bbd3423227beac',node:process.version,
  evidenceClass:'isolated_exact_source_modules_with_synthetic_inputs_and_mock_provider',
  fullRepositoryTestsRun:false,liveModelCalls:0,desktopTestsRun:false,sourceVerification,records,
  counts:records.reduce((o,r)=>(o[r.status]=(o[r.status]??0)+1,o),{})};
const replayId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0,8);
const replayDirectory = new URL(`../results/replays/${replayId}/`, import.meta.url);
mkdirSync(replayDirectory, { recursive: true });
const destination = new URL('module-probes.json', replayDirectory);
report.executedAt = new Date().toISOString();
writeFileSync(destination,JSON.stringify(report,null,2)+'\n', {flag:'wx'});
console.log(JSON.stringify({sourceVerification,counts:report.counts,results:records.map(({id,title,status})=>({id,title,status})),report:fileURLToPath(destination)},null,2));
process.exitCode=records.some(r=>r.status==='PROBE_ERROR')||sourceVerification.some(s=>!s.match)?1:0;
