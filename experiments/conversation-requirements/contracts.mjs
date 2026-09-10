import { digest } from './provider.mjs';
export function validateRecord(record) {
  if(record?.schemaVersion!==1 || record.kind!=='WorkRecord' || !record.id || !record.work?.instanceId || !Array.isArray(record.messages) || !record.messages.length) throw new Error('Expected WorkRecord v1 with id, work.instanceId and messages');
  const ids=new Set();
  for(const m of record.messages) {
    if(typeof m.id!=='string'||!m.id||ids.has(m.id)||!['user','assistant','tool'].includes(m.role)||typeof m.content!=='string'||!m.content.trim()) throw new Error('Invalid/duplicate source message');
    ids.add(m.id);
  }
  if(Buffer.byteLength(JSON.stringify(record))>400000) throw new Error('Record exceeds 400KB experiment budget; split by WorkInstance, never truncate silently');
  return record;
}
const values={category:['OBJECTIVE','INPUT','DELIVERABLE','CONSTRAINT','ACCEPTANCE','METHOD'],scope:['INSTANCE','REUSABLE'],origin:['USER_STATED','USER_CONFIRMED','AGENT_PROPOSED','INFERRED'],status:['ACTIVE','SUPERSEDED','REJECTED','UNRESOLVED']};
/** Mechanical provenance checks cannot decide semantic entailment. Audit/evaluation handles that separately. */
export function validateDraft(draft,record) {
  const errors=[],messages=new Map(record.messages.map(m=>[m.id,m])),ids=new Set();
  if(typeof draft?.title!=='string'||!draft.title.trim()||!Array.isArray(draft.requirements)||!Array.isArray(draft.questions)) return ['Invalid draft shape'];
  function refs(item,label) {
    if(!Array.isArray(item.evidence)||!item.evidence.length) {errors.push(`${label}: missing evidence`);return [];}
    return item.evidence.flatMap(e=>{
      const m=messages.get(e.messageId);
      if(!m||typeof e.quote!=='string'||!e.quote.trim()||!m.content.includes(e.quote)) {errors.push(`${label}: invalid quote/ref ${e.messageId}`);return [];}
      return [m];
    });
  }
  for(const r of draft.requirements) {
    if(typeof r.id!=='string'||!r.id||ids.has(r.id))errors.push('Invalid/duplicate requirement id');
    ids.add(r.id);
    if(typeof r.text!=='string'||!r.text.trim()||typeof r.applicability!=='string'||!Array.isArray(r.supersedes)) errors.push(`${r.id}: missing text/applicability/supersedes`);
    for(const [key,allowed] of Object.entries(values))if(!allowed.includes(r[key]))errors.push(`${r.id}: invalid ${key}`);
    const sources=refs(r,r.id);
    if(['USER_STATED','USER_CONFIRMED'].includes(r.origin)&&!sources.some(m=>m.role==='user')) errors.push(`${r.id}: user origin without user evidence`);
    if(r.origin==='USER_CONFIRMED') {
      const proposalPositions=sources.filter(m=>m.role==='assistant').map(m=>record.messages.indexOf(m));
      const userPositions=sources.filter(m=>m.role==='user').map(m=>record.messages.indexOf(m));
      if(!proposalPositions.length||!userPositions.some(u=>proposalPositions.every(a=>a<u)))errors.push(`${r.id}: confirmation requires a proposal and later user evidence`);
    }
    if(['AGENT_PROPOSED','INFERRED'].includes(r.origin)&&r.status==='ACTIVE')errors.push(`${r.id}: unconfirmed claim cannot be ACTIVE`);
  }
  const byId=new Map(draft.requirements.map(r=>[r.id,r]));
  for(const r of draft.requirements)for(const old of r.supersedes??[]) {
    if(old===r.id||!byId.has(old)||!['SUPERSEDED','REJECTED'].includes(byId.get(old)?.status))errors.push(`${r.id}: invalid supersedes ${old}`);
  }
  const qids=new Set();
  for(const q of draft.questions) {
    if(typeof q.id!=='string'||qids.has(q.id)||!q.text||!q.reason||!['BLOCKING','OPTIONAL'].includes(q.priority))errors.push('Invalid question');
    qids.add(q.id);refs(q,q.id);
  }
  return errors;
}
export function wrapDraft(draft,record,run) {
  const needsClarification=!draft.requirements.some(r=>r.status==='ACTIVE'&&['OBJECTIVE','DELIVERABLE'].includes(r.category))||draft.questions.some(q=>q.priority==='BLOCKING')||draft.requirements.some(r=>r.status==='UNRESOLVED'&&r.origin!=='AGENT_PROPOSED');
  return {schemaVersion:1,kind:'WorkRequirementsDraft',id:`requirements-${digest({source:record,version:run.algorithmVersion,strategy:run.strategy,content:draft}).slice(0,16)}`,workInstanceId:record.work.instanceId,sourceRecordId:record.id,snapshotHash:digest(record),status:needsClarification?'NEEDS_CLARIFICATION':'READY_FOR_REVIEW',title:draft.title,requirements:draft.requirements,questions:draft.questions,analysisRunId:run.id};
}
export function renderDraft(draft) {
  const lines=[`# ${draft.title}`,`\n工作实例：${draft.workInstanceId}  ·  状态：${draft.status}`, '\n## 工作要求'];
  for(const r of draft.requirements.filter(r=>r.status==='ACTIVE'))lines.push(`- **${r.category}** ${r.text} [${r.scope}]${r.applicability?' — '+r.applicability:''}\n  来源：${r.evidence.map(e=>`${e.messageId}「${e.quote}」`).join('；')}`);
  lines.push('\n## 待澄清');
  for(const q of draft.questions)lines.push(`- [${q.priority}] ${q.text}（${q.reason}）`);
  if(!draft.questions.length)lines.push('当前记录未识别出待澄清项；仍需用户审阅。');
  lines.push('\n## 变更与未确认内容');
  for(const r of draft.requirements.filter(r=>r.status!=='ACTIVE'))lines.push(`- [${r.status}/${r.origin}] ${r.text}`);
  return lines.join('\n')+'\n';
}
