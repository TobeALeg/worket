import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {DeepSeek,digest} from './provider.mjs';
import {extractRequirements} from './extractor.mjs';
import {renderDraft} from './contracts.mjs';
import {judgeCase,aggregate} from './evaluate.mjs';
import {VERSION} from './prompts.mjs';
const [corpusPath,outDir,strategy='verified',filter='']=process.argv.slice(2);
if(!corpusPath||!outDir)throw new Error('Usage: node benchmark.mjs CORPUS.json OUTPUT_DIR [direct|structured|verified] [case-id-substring]');
const corpusText=await readFile(corpusPath,'utf8'),samples=JSON.parse(corpusText).filter(c=>!filter||c.id.includes(filter));
if(!samples.length)throw new Error('No selected samples');
await mkdir(outDir,{recursive:true});
const moduleFiles=['prompts.mjs','extractor.mjs','evidence.mjs','contracts.mjs','provider.mjs','evaluate.mjs'];
const codeHashes=Object.fromEntries(await Promise.all(moduleFiles.map(async name=>[name,digest(await readFile(new URL(name,import.meta.url),'utf8'))])));
const config={codeHashes,version:VERSION,model:'deepseek-flash',family:'DeepSeek-V4.1-Flash',thinking:process.env.WORKET_RESEARCH_THINKING==='true',strategy,corpusHash:digest(corpusText),filter,chunkChars:12000};
const configPath=join(outDir,'config.json');
try {const old=JSON.parse(await readFile(configPath,'utf8'));if(digest(old)!==digest(config))throw new Error('Existing experiment has different config; use a new output directory');}catch(e){if(e.code!=='ENOENT')throw e;await writeFile(configPath,JSON.stringify(config,null,2)+'\n');}
let index=0;const rows=[];
async function worker(){
 while(index<samples.length){
  const sample=samples[index++],path=join(outDir,sample.id+'.json');
  let checkpoint;
  try {await access(path);checkpoint=JSON.parse(await readFile(path,'utf8'));if(checkpoint.metrics||checkpoint.error){rows.push(checkpoint);continue;}}catch(e){if(e.code!=='ENOENT')throw e;}
  const provider=new DeepSeek({thinking:config.thinking});
  let row=checkpoint??{id:sample.id,split:sample.split,provenance:sample.provenance,sourceHash:digest(sample.record)};
  try {
   const result=checkpoint?.draft?{draft:checkpoint.draft,run:checkpoint.run}:await extractRequirements(sample.record,provider,{strategy,chunkChars:config.chunkChars});
   // Persist usable extraction before judge, so judge failure does not destroy evidence.
   Object.assign(row,{draft:result.draft,run:result.run});
   await writeFile(path,JSON.stringify(row,null,2)+'\n',{mode:0o600});
   await writeFile(join(outDir,sample.id+'.md'),renderDraft(row.draft),{mode:0o600});
   Object.assign(row,await judgeCase(sample,row.draft,provider));
  }catch(e){row.error=e.message;}
  row.allCalls=[...(checkpoint?.allCalls??checkpoint?.run?.calls??[]),...provider.calls];
  await writeFile(path,JSON.stringify(row,null,2)+'\n',{mode:0o600});rows.push(row);
  console.log(JSON.stringify({id:sample.id,strategy,metrics:row.metrics,error:row.error,calls:provider.calls.length}));
 }
}
await Promise.all([worker(),worker()]);
rows.sort((a,b)=>a.id.localeCompare(b.id));
const summary={config,completedAt:new Date().toISOString(),aggregate:aggregate(rows),cases:rows.map(r=>({id:r.id,metrics:r.metrics,error:r.error})),usage:rows.flatMap(r=>r.allCalls??[]).reduce((s,c)=>({calls:s.calls+1,inputTokens:s.inputTokens+(c.usage?.prompt_tokens??0),outputTokens:s.outputTokens+(c.usage?.completion_tokens??0),durationMs:s.durationMs+(c.durationMs??0)}),{calls:0,inputTokens:0,outputTokens:0,durationMs:0})};
await writeFile(join(outDir,'summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary.aggregate));
if(summary.aggregate.errors)process.exitCode=2;
