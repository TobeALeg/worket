import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {extractDefinition} from '../../server/workflow.mjs';
import {hash} from '../../dist/definitions/storage.js';
import {verifyDraft} from '../../scripts/lib/document-adoption-cases.mjs';
import {contractReplay} from '../../scripts/lib/contract-replay.mjs';
const root=fileURLToPath(new URL('../fixtures/document-adoption',import.meta.url));
const manifest=JSON.parse(readFileSync(join(root,'manifest.json'),'utf8'));
for(const entry of manifest.cases)test(`document adoption actual response: ${entry.id}`,async()=>{
 const directory=join(root,entry.id),replay=contractReplay(directory);
 const first=JSON.parse(JSON.parse(readFileSync(join(directory,'request-1.json'),'utf8'))[1].content);
 const sources=[...new Set(first.events.map((e:any)=>e.sourceKey))].map(key=>({key,events:first.events.filter((e:any)=>e.sourceKey===key).map(({sourceKey,...event}:any)=>event)}));
 const request={schemaVersion:1,ruleSchemaVersion:1,evidenceSchemaVersion:1,skillSchemaVersion:1,snapshotHash:hash(sources),sources};let calls=0;
 const result=await extractDefinition(request,{model:'frozen-document-adoption',async call(messages:any){assert.ok(++calls<=2);return replay(messages,calls);}},new AbortController().signal);
 assert.equal(calls,2);verifyDraft(result);
});
