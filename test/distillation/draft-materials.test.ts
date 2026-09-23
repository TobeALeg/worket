import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID as id} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,unlinkSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createWorkCore} from '../../dist/core/index.js';
import {skillContent,writeSkillFixture} from '../../scripts/lib/skill-fixture.mjs';
import {DistillationService} from '../../dist/distillation/service.js';
import {FixtureClient,source} from './fixtures.ts';
function setup(){
 const directory=mkdtempSync(join(tmpdir(),'worket-draft-materials-')),databasePath=join(directory,'work.sqlite');
 const core=createWorkCore({databasePath}),skill=join(directory,'skill'),file=join(directory,'template.md');writeSkillFixture(skill);writeFileSync(file,'模板 v1');
 const content=structuredClone(skillContent);content.materialRoles.push({key:'template',text:'模板',required:true,basis:content.purpose.basis});
 const draft=()=>core.definitions.saveDraft({id:id(),revision:1,content:structuredClone(content),originalContent:structuredClone(content),refs:[],issues:[],resolutions:[]});
 const update=(d:any,bindings?:any,content=d.content)=>core.definitions.update({draftId:d.id,expectedRevision:d.revision,content,issueResolutions:[],...(bindings?{materialBindings:bindings}:{})});
 return {directory,databasePath,core,skill,file,draft,update};
}
test('draft selections survive restart and original deletion; publication uses saved file and whole skill',()=>{
 const f=setup();let core=f.core;
 try{
  const d=f.update(f.draft(),{builder:f.skill,template:f.file});assert.equal(d.materials?.length,2);
  core.close();core=createWorkCore({databasePath:f.databasePath});unlinkSync(f.file);rmSync(f.skill,{recursive:true});
  const restored=core.definitions.read<any>('definition_drafts',d.id);assert.deepEqual(restored.materials,d.materials);
  const published=core.definitions.publish({draftId:d.id,expectedRevision:d.revision,materialBindings:{},commandId:id()});
  assert.equal(readFileSync(published.materials.find(m=>m.role==='template')!.path,'utf8'),'模板 v1');
  core.definitions.materials.verify(published.materials.find(m=>m.bundle)!);
  assert.equal(core.definitions.read<any>('definition_drafts',d.id).materials,undefined);
 }finally{core.close();}
});
test('replacing or removing a choice collects only blobs with no draft or published owner',()=>{
 const f=setup();try{
  let a=f.update(f.draft(),{template:f.file}),b=f.update(f.draft(),{template:f.file});const old=a.materials![0]!;
  writeFileSync(f.file,'模板 v2');a=f.update(a,{template:f.file});assert.ok(existsSync(old.path),'second draft still owns v1');
  b=f.update(b,undefined,{...b.content,materialRoles:b.content.materialRoles.filter((r:any)=>r.key!=='template')});assert.ok(!existsSync(old.path));
  const staged=a.materials![0]!;a=f.update(a,{builder:f.skill});const published=f.core.definitions.publish({draftId:a.id,expectedRevision:a.revision,materialBindings:{},commandId:id()});
  let c=f.update(f.draft(),{template:f.file});f.core.definitions.delete({definitionKey:published.definitionKey,confirmation:'永久删除',commandId:id()});assert.ok(existsSync(staged.path),'draft retains shared blob after definition deletion');
  c=f.update(c,undefined,{...c.content,materialRoles:[]});assert.ok(!existsSync(staged.path));
 }finally{f.core.close();}
});
test('failed selection leaves prior draft intact and removes new unowned copied material; changing role kind clears binding',()=>{
 const f=setup();try{
  let d=f.update(f.draft(),{template:f.file});const saved=structuredClone(d);const before=f.core.definitions.db.prepare('SELECT count(*) n FROM definition_materials').get()!.n;
  writeFileSync(f.file,'新内容');assert.throws(()=>f.update(d,{template:f.file,builder:join(f.directory,'missing')}));
  assert.deepEqual(f.core.definitions.read('definition_drafts',d.id),saved);assert.equal(f.core.definitions.db.prepare('SELECT count(*) n FROM definition_materials').get()!.n,before);
  assert.throws(()=>f.update(d,{removed:f.file}),/INVALID_INPUT/);
  d=f.update(d,undefined,{...d.content,materialRoles:d.content.materialRoles.map((r:any)=>r.key==='template'?{...r,kind:'SKILL'}:r)});assert.equal(d.materials?.length,0);
  assert.ok(!existsSync(saved.materials![0]!.path));
 }finally{f.core.close();}
});
test('manual revision reopens its latest saved draft without losing bindings or creating another candidate',()=>{
 const f=setup();try{
  const d=f.update(f.draft(),{builder:f.skill,template:f.file});
  const base=f.core.definitions.publish({draftId:d.id,expectedRevision:d.revision,materialBindings:{},commandId:id()});
  let manual=f.core.definitions.revise({definitionId:base.id,commandId:id()});
  writeFileSync(f.file,'修订模板');manual=f.update(manual,{template:f.file});
  const resumed=f.core.definitions.revise({definitionId:base.id,commandId:id()});assert.deepEqual(resumed,manual);
  const other=f.core.definitions.publish({draftId:manual.id,expectedRevision:manual.revision,materialBindings:{},commandId:id()});assert.equal(other.version,2);
  assert.notEqual(f.core.definitions.revise({definitionId:other.id,commandId:id()}).id,manual.id);
 }finally{f.core.close();}
});
for (const action of ['cancel','delete-source']) test(`${action} clears staged draft blobs while keeping another owner`,async()=>{
 const f=setup();try{
  const work=source(f.core),client=new FixtureClient(),service=new DistillationService(f.core,client),snapshot=service.prepare({workIds:[work.instance.id],includedFileIds:[]});
  let job=service.start({preparationId:snapshot.id,expectedContentHash:snapshot.contentHash,consentVersion:'worket-data-v1',commandId:id()});await new Promise(r=>setImmediate(r));job=await service.get(job.id);
  let d=f.core.definitions.read<any>('definition_drafts',job.draftId!);d=f.update(d,{template:f.file},{...d.content,materialRoles:[{key:'template',text:'模板',required:true,basis:d.content.purpose.basis}]});
  let other=f.update(f.draft(),{template:f.file});const path=d.materials[0].path;
  if(action==='cancel') await service.cancel(job.id); else f.core.deleteWorkPermanently(work.instance.id,{confirmation:work.instance.id});assert.equal(f.core.definitions.read<any>('definition_drafts',d.id).materials,undefined);assert.ok(existsSync(path));
  other=f.update(other,undefined,{...other.content,materialRoles:[]});assert.ok(!existsSync(path));
 }finally{f.core.close();}
});
