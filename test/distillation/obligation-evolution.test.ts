import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractDefinition } from '../../server/workflow.mjs';
import { mergeEvolution } from '../../dist/definitions/evolution.js';
import { hash } from '../../dist/definitions/storage.js';
import { semanticCases, semanticBaseline } from '../../scripts/lib/obligation-semantic-cases.mjs';
import { semanticCases as platformCases, semanticBaseline as platformBaseline } from '../../scripts/lib/evolution-semantic-cases.mjs';
import { contractReplay } from '../../scripts/lib/contract-replay.mjs';
const root = fileURLToPath(new URL('../fixtures/obligation-evolution', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
for (const entry of manifest.cases) test(`obligation evolution actual-response replay: ${entry.id}`, async () => {
  const directory=join(root,entry.id),replay=contractReplay(directory);
  const first=JSON.parse(JSON.parse(readFileSync(join(directory,'request-1.json'),'utf8'))[1].content);
  const final=JSON.parse(JSON.parse(readFileSync(join(directory,'request-2.json'),'utf8'))[1].content);
  const sources=[...new Set(first.events.map(e=>e.sourceKey))].map(key=>({key,events:first.events.filter(e=>e.sourceKey===key).map(({sourceKey,...event})=>event)}));
  const request={schemaVersion:1,ruleSchemaVersion:1,evidenceSchemaVersion:1,skillSchemaVersion:1,snapshotHash:hash(sources),sources,evolution:final.baseline};
  let calls=0;
  const run=()=>extractDefinition(request,{model:'frozen-obligation-response',async call(messages){assert.ok(++calls<=2);return replay(messages,calls);}},new AbortController().signal);
  if(entry.outcome==='RULE_SCOPE_MISMATCH') await assert.rejects(run(),{code:'RULE_SCOPE_MISMATCH'});
  else {
    const result=await run();const merged=mergeEvolution({content:structuredClone(entry.suite === 'platform' ? platformBaseline : semanticBaseline),contentHash:request.evolution.contentHash} as any,result);
    (entry.suite === 'platform' ? platformCases : semanticCases).find(trial=>trial.id===entry.scenario).verify(merged);
  }
  assert.equal(calls,2);
});
