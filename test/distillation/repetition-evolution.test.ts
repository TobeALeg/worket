import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractDefinition } from '../../server/workflow.mjs';
import { normalizeEvolutionRelations } from '../../server/normalize-evolution.mjs';
import { mergeEvolution } from '../../dist/definitions/evolution.js';
import { validateResult } from '../../dist/contracts/definition.js';
import { hash } from '../../dist/definitions/storage.js';
import { semanticCases, semanticBaseline } from '../../scripts/lib/repetition-semantic-cases.mjs';
import { contractReplay } from '../../scripts/lib/contract-replay.mjs';
const root = fileURLToPath(new URL('../fixtures/repetition-evolution', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
function input(id: string) {
  const directory=join(root,id);
  const first=JSON.parse(JSON.parse(readFileSync(join(directory,'request-1.json'),'utf8'))[1].content);
  const final=JSON.parse(JSON.parse(readFileSync(join(directory,'request-2.json'),'utf8'))[1].content);
  const sources=[...new Set(first.events.map((e:any)=>e.sourceKey))].map(key=>({key,events:first.events.filter((e:any)=>e.sourceKey===key).map(({sourceKey,...event}:any)=>event)}));
  const request={schemaVersion:1,ruleSchemaVersion:1,evidenceSchemaVersion:1,skillSchemaVersion:1,snapshotHash:hash(sources),sources,evolution:final.baseline};
  const original=JSON.parse(readFileSync(join(directory,'response-2.json'),'utf8')).result;
  return {directory,request,original};
}
for(const entry of manifest.cases) test(`repetition actual-response replay: ${entry.id}`,async()=>{
  const {directory,request}=input(entry.id),replay=contractReplay(directory);let calls=0;
  const result=await extractDefinition(request,{model:'frozen-repetition-response',async call(messages:any){assert.ok(++calls<=2);return replay(messages,calls);}},new AbortController().signal);
  assert.equal(calls,2);
  const merged=mergeEvolution({content:structuredClone(semanticBaseline),contentHash:request.evolution.contentHash} as any,result);
  const trial=semanticCases.find(c=>c.id===entry.scenario)!;
  if(entry.outcome==='AMBIGUOUS_BASELINE_FAILED_ORIGINAL_EXPECTATION') {
    // Keep the failed original expectation visible. "Contains Chinese" and "Chinese only" differ.
    assert.throws(()=>trial.verify(merged),/instance-only English subtitles cannot become a default/);
    assert.equal(merged.evolution.changes.length,1);
    assert.equal(merged.evolution.changes[0]?.kind,'SUPPLEMENTS');
    assert.ok(merged.content.constraints.some(i=>i.text==='长期默认仅提供中文字幕，不改为默认中英双语。'));
  } else trial.verify(merged);
});

test('identical model relationship copies normalize without semantic edits; canonical domain input stays strict',()=>{
  const {request,original}=input('explicit-promotion');
  assert.throws(()=>validateResult(original,request as any),/增量关系由/);
  const value=structuredClone(original),expected=structuredClone(original);
  delete expected.evolution.changes[1].item.rule.relation;
  normalizeEvolutionRelations(value);assert.deepEqual(value,expected);validateResult(value,request as any);
  normalizeEvolutionRelations(value);assert.deepEqual(value,expected,'normalization is idempotent');
});

test('conflicting, malformed and out-of-scope model relationships still fail validation',()=>{
  const {request,original}=input('explicit-promotion');
  const mutations=[
    (c:any)=>{c.item.rule.relation.kind='REPLACES';},
    (c:any)=>{c.item.rule.relation.target='deliverables.mp4';},
    (c:any)=>{c.item.rule.relation.extra='not canonical';},
    (c:any)=>{c.item.rule.relation=[];},
    (c:any)=>{c.kind='ADD';},
    (c:any)=>{delete c.target;},
    (c:any)=>{c.target=c.item.rule.relation.target='constraints.missing';},
    (c:any)=>{c.kind=c.item.rule.relation.kind='REPLACES';c.item.rule.scope='INSTANCE';},
    (c:any)=>{c.item.basis.refs[0].eventId='nonexistent';},
  ];
  for(const mutate of mutations) {
    const value=structuredClone(original);mutate(value.evolution.changes[1]);normalizeEvolutionRelations(value);
    assert.throws(()=>validateResult(value,request as any));
  }
});
