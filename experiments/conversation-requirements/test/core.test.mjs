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
 assert.equal(result.draft.workInstanceId,'work-a');assert.equal(result.run.workInstanceId,'work-a');assert.equal(result.draft.sourceRecordId,'record-a');assert.equal(result.draft.analysisRunId,result.run.id);assert.equal(result.draft.status,'READY_FOR_REVIEW');
});
test('structured pipeline refuses missing evidence coverage',async()=>{const p={async json(){return {coveredMessageIds:['m1'],observations:[]};}};await assert.rejects(extractRequirements(record,p,{strategy:'structured'}),/coverage incomplete/);});
test('Codex importer excludes hidden reasoning, approval prompts and subagent notifications',()=>{
 const row=p=>JSON.stringify({type:'response_item',payload:p});
 const msg=(role,text,phase)=>row({type:'message',role,phase,content:[{type:role==='user'?'input_text':'output_text',text}]});
 const source=[row({type:'reasoning',summary:[{text:'SECRET_REASONING'}]}),msg('user','# AGENTS.md instructions'),msg('user','<subagent_notification>not user</subagent_notification>'),msg('user','请做报告'),msg('assistant','分析内容','analysis'),msg('assistant','建议PDF','final')].join('\n');
 const result=importCodex(source);assert.deepEqual(result.messages.map(m=>m.content),['请做报告','建议PDF']);assert.equal(result.provenance.exclusions.scaffolding,2);
});
test('common credentials removed without printing values',()=>{const raw='sk-'+'a'.repeat(32);assert(!redact(raw).includes(raw));assert.equal(redact('contact person@example.com'),'contact [REDACTED_EMAIL]');});
