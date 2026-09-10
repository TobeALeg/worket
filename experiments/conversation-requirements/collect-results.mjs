/** Produce shareable evidence from an explicit run manifest; real conversation bodies stay private. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {digest} from './provider.mjs';
import {aggregate} from './evaluate.mjs';
const [manifestPath,outputPath]=process.argv.slice(2);
if(!manifestPath||!outputPath)throw new Error('Usage: node collect-results.mjs MANIFEST.json OUTPUT.json');
const manifest=JSON.parse(await readFile(manifestPath,'utf8')),runs=[];
for(const item of manifest){
 if(!['synthetic','real'].includes(item.visibility))throw new Error('Explicit synthetic/real visibility required');
 const summary=JSON.parse(await readFile(join(item.path,'summary.json'),'utf8')),cases=[],rawRows=[];
 for(const c of summary.cases){
  const raw=await readFile(join(item.path,c.id+'.json'),'utf8'),row=JSON.parse(raw);
  rawRows.push(row);
  const evidence={id:row.id,split:row.split,sourceHash:row.sourceHash,resultHash:digest(raw),metrics:row.metrics,error:row.error,modelCalls:(row.allCalls??[]).map(({phase,attempt,httpStatus,durationMs,requestHash,responseId,requestedModel,returnedModel,usage,finishReason,status})=>({phase,attempt,httpStatus,durationMs,requestHash,responseId,requestedModel,returnedModel,usage,finishReason,status}))};
  if(item.visibility==='synthetic')Object.assign(evidence,{draft:row.draft,verdict:row.verdict});
  cases.push(evidence);
 }
 runs.push({label:item.label,visibility:item.visibility,summary:{...summary,aggregate:aggregate(rawRows)},cases});
}
await mkdir(dirname(resolve(outputPath)),{recursive:true});await writeFile(outputPath,JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),runs},null,2)+'\n');
console.log(JSON.stringify({output:outputPath,runs:runs.length,containsRealConversationBodies:false}));
