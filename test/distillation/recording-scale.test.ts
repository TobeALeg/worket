import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createWorkCore} from '../../dist/core/index.js';
import {ImprovementCollector} from '../../dist/improvement/collector.js';
import {RecordingCollection} from '../../dist/improvement/recording.js';
import {ImprovementStore} from '../../server/improvement.mjs';

test('550-message offline recording survives restart and drains all evidence with linear-size delta views', async()=>{
 const directory=mkdtempSync(join(tmpdir(),'worket-scale-test-')),path=join(directory,'local.sqlite');
 let core=createWorkCore({databasePath:path});const remote=new ImprovementStore(':memory:');let bytes=0,calls=0,first=true;
 const client:any={improvementIdentity:()=> 'same',capabilities:async()=>({improvement:remote.policy()}),uploadSample:async(v:any,guard:any)=>{guard?.();const value=remote.receive('qa',v);bytes+=Buffer.byteLength(JSON.stringify(v));calls++;if(first){first=false;throw Error('response lost after receipt');}return value;}};
 let collector=new ImprovementCollector(core.definitions.db,client),recording=new RecordingCollection(core,collector);
 const work=core.createWork({definition:{key:'qa',name:'qa',version:1},executor:{type:'AGENT',name:'qa'},environment:{type:'CODEX_DESKTOP',name:'qa'},source:{adapter:'codex',conversationId:'qa'}});
 recording.start(work.instance.id);
 try{
  for(let n=1;n<=550;n++){
   core.appendSourceEvents(work.instance.id,[{externalId:'m-'+n,sequence:n,kind:'user.prompt',content:`合成消息 ${n}`,timestamp:new Date(0).toISOString(),executorType:'HUMAN',environmentType:'CODEX_DESKTOP',metadata:{},artifactRefs:[]}]);recording.collect();
   if(n===275){core.close();core=createWorkCore({databasePath:path});collector=new ImprovementCollector(core.definitions.db,client);recording=new RecordingCollection(core,collector);recording.collect();}
  }
  const payloads=core.definitions.db.prepare('SELECT payload FROM improvement_outbox WHERE payload IS NOT NULL').all().map(row=>JSON.parse(String(row.payload)));
  assert.ok(payloads.filter(p=>p.event.kind==='RECORDING_VIEW').slice(1).every(p=>p.event.data.entries.length===1 && p.event.data.baseSequence===p.event.data.sequence-1));
  assert.ok(Buffer.byteLength(JSON.stringify(payloads))<700000,'queue grows with changes, not repeated entire history');
  while(collector.list()[0].pending&&collector.list()[0].state==='ACTIVE')await collector.flush();
  const saved=remote.get(remote.list()[0].id);assert.equal(saved.events.length,1102);assert.equal(saved.recordingView.ready,true);assert.equal(saved.recordingView.current.length,550);
  assert.equal(collector.list()[0].state,'ACTIVE');assert.equal(calls,1103);assert.ok(bytes<700000);
  const prior=calls;recording.collect();await collector.flush();assert.equal(calls,prior);
 }finally{core.close();remote.close();rmSync(directory,{recursive:true,force:true});}
});
