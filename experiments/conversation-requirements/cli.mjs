import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve,dirname } from 'node:path';
import { DeepSeek } from './provider.mjs';
import { extractRequirements } from './extractor.mjs';
import { renderDraft } from './contracts.mjs';
const args=process.argv.slice(2);
if(args.includes('--help')||args.length<2) {
 console.log('node experiments/conversation-requirements/cli.mjs RECORD.json OUTPUT.json [direct|structured|verified]\nRequires DEEPSEEK_API_KEY. Sends only the supplied record to DeepSeek V4.1 Flash (deepseek-flash). OUTPUT.md and OUTPUT.run.json are written beside the draft.');
 process.exit(args.includes('--help')?0:1);
}
const [source,output,strategy='verified']=args;
const record=JSON.parse(await readFile(source,'utf8'));
const result=await extractRequirements(record,new DeepSeek({thinking:process.env.WORKET_RESEARCH_THINKING==='true'}),{strategy});
await mkdir(dirname(resolve(output)),{recursive:true});
await writeFile(output,JSON.stringify(result.draft,null,2)+'\n');
await writeFile(output.replace(/\.json$/,'')+'.md',renderDraft(result.draft));
await writeFile(output.replace(/\.json$/,'')+'.run.json',JSON.stringify(result.run,null,2)+'\n');
console.log(JSON.stringify({output,status:result.draft.status,requirements:result.draft.requirements.length,calls:result.run.calls.length,durationMs:result.run.durationMs}));
