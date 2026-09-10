import { randomUUID } from 'node:crypto';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { dirname,resolve } from 'node:path';
import { digest } from './provider.mjs';

export function redact(text) {
 return text.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,'[REDACTED_PRIVATE_KEY]')
 .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g,'[REDACTED_API_KEY]')
 .replace(/((?:api[_ -]?key|password|secret|token)\s*[=:]\s*["']?)[^\s"',;]{8,}/gi,'$1[REDACTED_SECRET]')
 .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{12,}/gi,'Bearer [REDACTED_TOKEN]')
 .replace(/\/Users\/[^/\s]+/g,'/Users/LOCAL_USER')
 .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[REDACTED_EMAIL]');
}
const scaffolding=/^(?:# AGENTS\.md|<environment_context>|<permissions|<recommended_plugins>|<codex_internal_context|<subagent_notification>|The following is the Codex agent history whose request action you are assessing)/;
/** Visible messages only: reasoning, tools, system/developer prompts and approval audits are excluded. */
export function importCodex(text,{instanceId,focus}={}) {
 let meta={},lineNumber=0;const messages=[],excluded={scaffolding:0,nonVisible:0,blank:0};
 for(const line of text.split('\n')) {
  lineNumber++;if(!line.trim())continue;
  let row;try{row=JSON.parse(line);}catch{throw new Error(`Invalid JSONL line ${lineNumber}`);}
  const p=row.payload??{};
  if(row.type==='session_meta'){meta=p;continue;}
  if(row.type!=='response_item'||p.type!=='message'||!['user','assistant'].includes(p.role)){excluded.nonVisible++;continue;}
  if(p.role==='assistant'&&['analysis','summary'].includes(p.channel??p.phase)){excluded.nonVisible++;continue;}
  const content=(p.content??[]).filter(c=>['input_text','output_text','text'].includes(c.type)).map(c=>c.text??'').join('\n').trim();
  if(!content){excluded.blank++;continue;}
  if(scaffolding.test(content)){excluded.scaffolding++;continue;}
  messages.push({id:`m${lineNumber}`,role:p.role,content:redact(content),episodeId:meta.id??'imported-session'});
 }
 if(!messages.some(m=>m.role==='user'))throw new Error('No real user messages after scaffolding exclusion');
 if(messages[0].role==='user'&&messages[0].content.includes('request action you are assessing'))throw new Error('Approval audit is not a user conversation');
 return {schemaVersion:1,kind:'WorkRecord',id:`record-${digest(text).slice(0,16)}`,work:{instanceId:instanceId??`work-${randomUUID()}`,...(focus?{focus}:{})},provenance:{format:'codex-visible-jsonl',sourceSessionId:meta.id??null,sourceHash:digest(text),redacted:true,exclusions:excluded,attachments:'Only visible text; linked file/image contents are not imported'},messages};
}
if(process.argv[1]&&import.meta.url===new URL(`file://${resolve(process.argv[1])}`).href) {
 const [source,out,focus,instanceId]=process.argv.slice(2);
 if(!source||!out)throw new Error('Usage: node import-codex.mjs SOURCE.jsonl OUTPUT.json [work focus] [existing WorkInstance ID]');
 const record=importCodex(await readFile(source,'utf8'),{focus,instanceId});
 await mkdir(dirname(resolve(out)),{recursive:true});await writeFile(out,JSON.stringify(record,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({output:out,messages:record.messages.length,exclusions:record.provenance.exclusions}));
}
