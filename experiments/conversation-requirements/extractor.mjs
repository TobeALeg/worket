import { indexSource,hydrateDraft } from './evidence.mjs';
import { randomUUID } from 'node:crypto';
import { digest } from './provider.mjs';
import { validateRecord,validateDraft,wrapDraft } from './contracts.mjs';
import { VERSION,DIRECT,EVIDENCE,SYNTHESIS,REVIEW,REPAIR,GROUND,SUPPORT_AUDIT } from './prompts.mjs';

export function windows(messages,maxChars=12000) {
  if(!Number.isInteger(maxChars)||maxChars<200)throw new Error('chunkChars must be >=200');
  const result=[];let current=[],size=0;
  for(const m of messages) {
    const n=JSON.stringify(m).length;
    // Preserve a large message whole: never silently discard the beginning/middle.
    if(current.length&&size+n>maxChars){result.push(current);current=[];size=0;}
    current.push(m);size+=n;
  }
  if(current.length)result.push(current);
  if(result.length>30)throw new Error('More than 30 extraction windows; explicit record selection required');
  return result;
}
export async function extractRequirements(record,provider,{strategy='verified',chunkChars=12000}={}) {
  validateRecord(record);
  if(!['direct','structured','verified','grounded','audited'].includes(strategy))throw new Error('strategy: direct | structured | verified | grounded | audited');
  const start=Date.now(),callStart=provider.calls?.length??0;
  const run={schemaVersion:1,kind:'WorkAnalysisRun',id:randomUUID(),workInstanceId:record.work.instanceId,sourceRecordId:record.id,sourceHash:digest(record),algorithmVersion:VERSION,strategy,chunkChars,startedAt:new Date().toISOString()};
  const ledger=[],sourceIndex=indexSource(record),modelRecord=sourceIndex.view;
  let draft;
  if(['direct','grounded','audited'].includes(strategy))draft=await provider.json(DIRECT,modelRecord,{phase:'direct'});
  else {
    for(const [index,messages] of windows(modelRecord.messages,chunkChars).entries()) {
      const evidence=await provider.json(EVIDENCE,{work:record.work,messages},{phase:`evidence-${index}`});
      const expected=messages.map(m=>m.id);
      if(!Array.isArray(evidence.coveredMessageIds)||new Set(evidence.coveredMessageIds).size!==expected.length||evidence.coveredMessageIds.length!==expected.length||!expected.every(id=>evidence.coveredMessageIds.includes(id))||!Array.isArray(evidence.observations))throw new Error('Evidence window coverage incomplete');
      for(const o of evidence.observations) {
        const span=sourceIndex.byId.get(o.spanId);
        if(!span||!messages.some(m=>m.id===span.messageId))throw new Error('Evidence ledger contains an unknown/out-of-window span');
      }
      ledger.push(evidence);
    }
    draft=await provider.json(SYNTHESIS,{record:modelRecord,ledger},{phase:'synthesis'});
    run.preReviewDraft=structuredClone(draft);
    if(strategy==='verified')draft=await provider.json(REVIEW,{record:modelRecord,candidate:draft,mechanicalIssues:validateDraft(hydrateDraft(draft,sourceIndex),record)},{phase:'review'});
  }
  if(['grounded','audited'].includes(strategy)){
    run.preGroundingDraft=structuredClone(draft);
    const cards=(draft.requirements??[]).map(r=>({id:r.id,text:r.text,origin:r.origin,status:r.status,evidence:(r.evidence??[]).map(e=>{
      const span=sourceIndex.byId.get(e.spanId);
      return span?{...span,role:record.messages.find(m=>m.id===span.messageId).role}:e;
    })}));
    draft=await provider.json(GROUND,{record:modelRecord,candidate:draft,claimEvidenceCards:cards},{phase:'source-grounding'});
  }
  draft=hydrateDraft(draft,sourceIndex);
  let errors=validateDraft(draft,record);
  if(errors.length) {
    // Same repair allowance for all strategies; repairs are visible and charged.
    const invalidIds=(Array.isArray(draft?.requirements)?draft.requirements:[]).filter(r=>errors.some(e=>e.startsWith(r.id+':'))).map(r=>r.id);
    const onlyRequirements=errors.every(e=>invalidIds.some(id=>e.startsWith(id+':')));
    if(onlyRequirements&&invalidIds.length){
      const fixed=await provider.json(REPAIR,{record:modelRecord,invalidRequirements:draft.requirements.filter(r=>invalidIds.includes(r.id)),errors},{phase:'contract-repair'});
      if(!Array.isArray(fixed.requirements)||!invalidIds.every(id=>fixed.requirements.some(r=>r.id===id)))throw new Error('Targeted repair lost requirement IDs');
      const originalIds=new Set(draft.requirements.map(r=>r.id));
      const replacements=fixed.requirements.filter(r=>invalidIds.includes(r.id)||!originalIds.has(r.id));
      run.ignoredRepairIds=fixed.requirements.filter(r=>!invalidIds.includes(r.id)&&originalIds.has(r.id)).map(r=>r.id);
      draft.requirements=[...draft.requirements.filter(r=>!invalidIds.includes(r.id)),...replacements];
    }else draft=await provider.json(REVIEW,{record:modelRecord,candidate:draft,mechanicalIssues:errors},{phase:'contract-repair'});
    draft=hydrateDraft(draft,sourceIndex);
    errors=validateDraft(draft,record);
  }
  if(errors.length)throw new Error(`Draft rejected: ${errors.join('; ')}`);
  if(strategy==='audited') {
    const active=draft.requirements.filter(r=>r.status==='ACTIVE');
    const audit=await provider.json(SUPPORT_AUDIT,{record:modelRecord,activeClaims:active,questions:draft.questions},{phase:'support-audit'});
    applySupportAudit(draft,audit);
    run.supportAudit=audit;
  }
  errors=validateDraft(draft,record);
  if(errors.length)throw new Error(`Audited draft rejected: ${errors.join('; ')}`);
  Object.assign(run,{finishedAt:new Date().toISOString(),durationMs:Date.now()-start,calls:provider.calls?.slice(callStart)??[],ledger});
  return {draft:wrapDraft(draft,record,run),run};
}

/** Conservative semantic gate: model may reject claims, never write new authorized requirements. */
export function applySupportAudit(draft,audit) {
  const active=draft.requirements.filter(r=>r.status==='ACTIVE');
  const covers=(rows,key,ids)=>Array.isArray(rows)&&rows.length===ids.length&&new Set(rows.map(r=>r[key])).size===ids.length&&ids.every(id=>rows.some(r=>r[key]===id));
  if(!covers(audit?.claims,'requirementId',active.map(r=>r.id))||!covers(audit?.questions,'questionId',draft.questions.map(q=>q.id)))throw new Error('Support audit coverage incomplete');
  for(const a of audit.claims)if(!['SUPPORTED','UNSUPPORTED','UNCERTAIN'].includes(a.verdict)||typeof a.reason!=='string'||!a.reason.trim())throw new Error('Invalid support verdict');
  for(const q of audit.questions)if(typeof q.unnecessary!=='boolean'||typeof q.blocksWholeWork!=='boolean'||typeof q.reason!=='string'||!q.reason.trim())throw new Error('Invalid question support verdict');
  for(const a of audit.claims)if(a.verdict!=='SUPPORTED'){
    const r=active.find(r=>r.id===a.requirementId);
    r.origin='INFERRED';r.status='UNRESOLVED';
  }
  draft.questions=draft.questions.filter(q=>!audit.questions.find(a=>a.questionId===q.id).unnecessary);
  for(const q of draft.questions)if(!audit.questions.find(a=>a.questionId===q.id).blocksWholeWork)q.priority='OPTIONAL';
  return draft;
}
