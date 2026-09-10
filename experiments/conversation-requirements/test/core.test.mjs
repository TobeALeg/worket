import {aggregate} from '../evaluate.mjs';
import {indexSource,hydrateDraft} from '../evidence.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDraft,validateRecord} from '../contracts.mjs';
import {extractRequirements,windows} from '../extractor.mjs';
import {importCodex,redact} from '../import-codex.mjs';
const record={schemaVersion:1,kind:'WorkRecord',id:'record-a',work:{instanceId:'work-a'},messages:[{id:'m1',role:'user',content:'只写草案，不发送。'},{id:'m2',role:'assistant',content:'我会发送邮件。'}]};
const draft=()=>({title:'邮件草案',requirements:[{id:'r1',category:'CONSTRAINT',text:'不发送邮件',scope:'INSTANCE',origin:'USER_STATED',status:'ACTIVE',evidence:[{messageId:'m1',quote:'不发送'}],supersedes:[],applicability:''}],questions:[]});
test('rejects invented evidence, assistant as user, and unconfirmed active claim',()=>{
 const d=draft();d.requirements[0].evidence=[{messageId:'m2',quote:'我会发送邮件。'}];assert.match(validateDraft(d,record).join(),/user origin/);
 d.requirements[0].origin='AGENT_PROPOSED';assert.match(validateDraft(d,record).join(),/cannot be ACTIVE/);
 d.requirements[0].evidence=[{messageId:'m1',quote:'同意发送'}];assert.match(validateDraft(d,record).join(),/invalid quote/);
});
test('supersession must point to retained inactive history',()=>{const d=draft();d.requirements[0].supersedes=['missing'];assert.match(validateDraft(d,record).join(),/invalid supersedes/);});
test('record identity and complete message uniqueness are required',()=>{assert.throws(()=>validateRecord({...record,work:{}}));assert.throws(()=>validateRecord({...record,messages:[record.messages[0],record.messages[0]]}));});
test('windowing preserves beginning, long middle and final correction without truncation',()=>{const messages=[record.messages[0],{id:'long',role:'tool',content:'x'.repeat(4000)},record.messages[1]];assert.deepEqual(windows(messages,200).flat(),messages);});
test('public extraction interface retains WorkInstance and run provenance',async()=>{
 const provider={calls:[],async json(){this.calls.push({phase:'direct'});return draft();}};
 const result=await extractRequirements(record,provider,{strategy:'direct'});
 assert.equal(result.draft.workInstanceId,'work-a');assert.equal(result.run.workInstanceId,'work-a');assert.equal(result.draft.sourceRecordId,'record-a');assert.equal(result.draft.analysisRunId,result.run.id);assert.equal(result.draft.status,'NEEDS_CLARIFICATION');
});
test('structured pipeline refuses missing evidence coverage',async()=>{const p={async json(){return {coveredMessageIds:['m1'],observations:[]};}};await assert.rejects(extractRequirements(record,p,{strategy:'structured'}),/coverage incomplete/);});
test('Codex importer excludes hidden reasoning, approval prompts and subagent notifications',()=>{
 const row=p=>JSON.stringify({type:'response_item',payload:p});
 const msg=(role,text,phase)=>row({type:'message',role,phase,content:[{type:role==='user'?'input_text':'output_text',text}]});
 const source=[row({type:'reasoning',summary:[{text:'SECRET_REASONING'}]}),msg('user','# AGENTS.md instructions'),msg('user','<subagent_notification>not user</subagent_notification>'),msg('user','请做报告'),msg('assistant','分析内容','analysis'),msg('assistant','建议PDF','final')].join('\n');
 const result=importCodex(source);assert.deepEqual(result.messages.map(m=>m.content),['请做报告','建议PDF']);assert.equal(result.provenance.exclusions.scaffolding,2);
});
test('common credentials removed without printing values',()=>{const raw='sk-'+'a'.repeat(32);assert(!redact(raw).includes(raw));assert.equal(redact('contact person@example.com'),'contact [REDACTED_EMAIL]');});

test('model output cannot overwrite authoritative work identity or review state',async()=>{
 const p={calls:[],async json(){return {...draft(),workInstanceId:'foreign-work',sourceRecordId:'foreign-record',kind:'PublishedWorkDefinition',status:'CONFIRMED'};}};
 const {draft:result}=await extractRequirements(record,p,{strategy:'direct'});
 assert.equal(result.workInstanceId,'work-a');assert.equal(result.sourceRecordId,'record-a');assert.equal(result.kind,'WorkRequirementsDraft');assert.notEqual(result.status,'CONFIRMED');
});

test('program-owned spans roundtrip Markdown, whitespace, emoji and source offsets',()=>{
 const r={...record,messages:[{id:'m1',role:'user',content:'**不要** 发送。\n😀 保留两位小数。'}]};
 const idx=indexSource(r);assert.equal(idx.view.messages[0].spans.map(s=>s.text).join(''),r.messages[0].content);
 for(const span of idx.byId.values())assert.equal(r.messages[0].content.slice(span.start,span.end),span.quote);
 const d=draft();d.requirements[0].evidence=[{spanId:'m1:s1',messageId:'attacker',quote:'同意发送'}];
 hydrateDraft(d,idx);assert.equal(d.requirements[0].evidence[0].quote,'**不要** 发送。');assert.equal(d.requirements[0].evidence[0].messageId,'m1');
});

test('source sessions and work identities are independent',()=>{
 const source=JSON.stringify({type:'session_meta',payload:{id:'session-a'}})+'\n'+JSON.stringify({type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'做报告'}]}});
 const a=importCodex(source),b=importCodex(source);
 assert.notEqual(a.work.instanceId,b.work.instanceId);assert.equal(a.provenance.sourceSessionId,b.provenance.sourceSessionId);
 assert.equal(importCodex(source,{instanceId:'existing-work'}).work.instanceId,'existing-work');
});

test('confirmation must follow all cited proposals, not just one',()=>{
 const rec={...record,messages:[{id:'a1',role:'assistant',content:'采用方案A。'},{id:'u1',role:'user',content:'确认。'},{id:'a2',role:'assistant',content:'另外部署生产。'}]};
 const d=draft();Object.assign(d.requirements[0],{origin:'USER_CONFIRMED',evidence:[{messageId:'a1',quote:'采用方案A。'},{messageId:'u1',quote:'确认。'},{messageId:'a2',quote:'另外部署生产。'}]});
 assert.match(validateDraft(d,rec).join(),/later user evidence/);
});

test('evaluation denominator includes failed cases instead of silently dropping them',()=>{
 const rows=[{expected:{checks:2,positive:2},metrics:{checks:2,met:2,positive:2,positiveMet:2,critical:2,criticalMet:2,active:2,unsupported:0,unnecessaryQuestions:0,pass:true}},{expected:{checks:2,positive:2},error:'provider failed'}];
 const a=aggregate(rows);assert.equal(a.checkRate,0.5);assert.equal(a.positiveRecall,0.5);assert.equal(a.errors,1);
});


test('semantic gate only downgrades and refuses incomplete coverage',async()=>{
 const {applySupportAudit}=await import('../extractor.mjs');
 const d=draft();d.questions=[{id:'q1',text:'A or B?',priority:'BLOCKING'}];
 const text=d.requirements[0].text;
 const audit={claims:[{requirementId:d.requirements[0].id,verdict:'UNSUPPORTED',reason:'source does not entail exclusive restriction'}],questions:[{questionId:'q1',unnecessary:false,blocksWholeWork:false,reason:'alternative delivery authorized'}]};
 applySupportAudit(d,audit);assert.equal(d.requirements[0].text,text);assert.equal(d.requirements[0].status,'UNRESOLVED');assert.equal(d.requirements[0].origin,'INFERRED');assert.equal(d.questions[0].priority,'OPTIONAL');
 assert.throws(()=>applySupportAudit(d,audit),/coverage incomplete/);
});
test('semantic gate audits the final repaired draft, not an obsolete candidate',async()=>{
 const phases=[];const p={calls:[],async json(system,input,{phase}){phases.push(phase);if(phase==='support-audit'){assert.equal(input.activeClaims[0].text,'修复后的内容');return {claims:[{requirementId:'r1',verdict:'SUPPORTED',reason:'supported'}],questions:[]};}if(phase==='contract-repair'){const d=draft();d.requirements[0].text='修复后的内容';return d;}const d=draft();d.requirements[0].category='INVALID';return d;}};
 await extractRequirements(record,p,{strategy:'audited'});assert.deepEqual(phases,['direct','source-grounding','contract-repair','support-audit']);
});
