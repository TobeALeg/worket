/** Offline recheck of a saved run. Never makes model calls. */
import {readFile} from 'node:fs/promises';
import {validateDraft,validateRecord} from './contracts.mjs';
import {digest} from './provider.mjs';
const [recordPath,resultPath]=process.argv.slice(2);
if(!recordPath||!resultPath)throw new Error('Usage: node verify-evidence.mjs RECORD.json RESULT.json');
const record=validateRecord(JSON.parse(await readFile(recordPath,'utf8'))),result=JSON.parse(await readFile(resultPath,'utf8')),draft=result.draft??result;
const errors=validateDraft(draft,record);
if(draft.workInstanceId!==record.work.instanceId||draft.sourceRecordId!==record.id||draft.snapshotHash!==digest(record))errors.push('Source/WorkInstance identity mismatch');
for(const r of [...draft.requirements,...draft.questions])for(const e of r.evidence){
 const m=record.messages.find(m=>m.id===e.messageId);
 if(e.start!==undefined&&m?.content.slice(e.start,e.end)!==e.quote)errors.push('Source offset mismatch');
}
console.log(JSON.stringify({valid:errors.length===0,requirements:draft.requirements.length,errors},null,2));
if(errors.length)process.exitCode=1;
