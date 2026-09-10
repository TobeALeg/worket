import { randomUUID } from 'node:crypto';
import { digest } from './provider.mjs';
import { validateRecord,validateDraft,wrapDraft } from './contracts.mjs';
import { VERSION,DIRECT,EVIDENCE,SYNTHESIS,REVIEW } from './prompts.mjs';

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
  if(!['direct','structured','verified'].includes(strategy))throw new Error('strategy: direct | structured | verified');
  const start=Date.now(),callStart=provider.calls?.length??0;
  const run={schemaVersion:1,kind:'WorkAnalysisRun',id:randomUUID(),workInstanceId:record.work.instanceId,sourceRecordId:record.id,sourceHash:digest(record),algorithmVersion:VERSION,strategy,chunkChars,startedAt:new Date().toISOString()};
  const ledger=[];
  let draft;
  if(strategy==='direct')draft=await provider.json(DIRECT,record,{phase:'direct'});
  else {
    for(const [index,messages] of windows(record.messages,chunkChars).entries()) {
      const evidence=await provider.json(EVIDENCE,{work:record.work,messages},{phase:`evidence-${index}`});
      const expected=messages.map(m=>m.id);
      if(!Array.isArray(evidence.coveredMessageIds)||new Set(evidence.coveredMessageIds).size!==expected.length||evidence.coveredMessageIds.length!==expected.length||!expected.every(id=>evidence.coveredMessageIds.includes(id))||!Array.isArray(evidence.observations))throw new Error('Evidence window coverage incomplete');
      for(const o of evidence.observations) {
        const source=messages.find(m=>m.id===o.messageId);
        if(!source||typeof o.quote!=='string'||!o.quote.trim()||!source.content.includes(o.quote))throw new Error('Evidence ledger contains invented source/quote');
      }
      ledger.push(evidence);
    }
    draft=await provider.json(SYNTHESIS,{record,ledger},{phase:'synthesis'});
    if(strategy==='verified')draft=await provider.json(REVIEW,{record,candidate:draft,mechanicalIssues:validateDraft(draft,record)},{phase:'review'});
  }
  let errors=validateDraft(draft,record);
  if(errors.length) {
    // Same repair allowance for all strategies; repairs are visible and charged.
    draft=await provider.json(REVIEW,{record,candidate:draft,mechanicalIssues:errors},{phase:'contract-repair'});
    errors=validateDraft(draft,record);
  }
  if(errors.length)throw new Error(`Draft rejected: ${errors.join('; ')}`);
  Object.assign(run,{finishedAt:new Date().toISOString(),durationMs:Date.now()-start,calls:provider.calls?.slice(callStart)??[],ledger});
  return {draft:wrapDraft(draft,record,run),run};
}
