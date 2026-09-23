import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,rmSync,symlinkSync,chmodSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID as id} from 'node:crypto';
import {createWorkCore} from '../../dist/core/index.js';
import {MaterialStore} from '../../dist/definitions/storage.js';
import {skillEnvironment,skillLayout} from '../../dist/definitions/skill-environment.js';
import {skillContent,writeSkillFixture} from '../../scripts/lib/skill-fixture.mjs';
function setup(){
 const root=mkdtempSync(join(tmpdir(),'worket-combined-test-')),a=join(root,'builder'),b=join(root,'format-kit');writeSkillFixture(a);writeSkillFixture(b,'依赖 v1');
 const store=new MaterialStore(join(root,'materials'));return{root,a,b,store,materials:[store.copySkill(a,'builder'),store.copySkill(b,'format')]};
}
test('selected names and whole manifests survive missing originals; single skill stays at its canonical path',()=>{
 const f=setup();try{
  assert.equal(skillEnvironment(f.store.directory,'single',[f.materials[0]]).get('builder'),f.materials[0].path);
  writeSkillFixture(join(f.root,'unselected-skill'),'未选择的内容不可收集');
  rmSync(f.a,{recursive:true});rmSync(f.b,{recursive:true});const paths=skillEnvironment(f.store.directory,'both',f.materials);
  assert.equal(dirname(dirname(paths.get('builder')!)),dirname(dirname(paths.get('format')!)));
  assert.equal(readFileSync(join(dirname(paths.get('builder')!),'../format-kit/references/format.md'),'utf8'),'依赖 v1');
  assert.ok(existsSync(join(dirname(paths.get('format')!),'assets/empty')));
  assert.ok(!existsSync(join(dirname(dirname(paths.get('builder')!)),'unselected-skill')));
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('derived damage and extra files rebuild from fixed bytes; missing canonical bytes never use the cache as evidence',()=>{
 const f=setup();try{
  const first=skillEnvironment(f.store.directory,'definition',f.materials),path=join(dirname(first.get('format')!),'references/format.md');
  writeFileSync(path,'错误版本');writeFileSync(join(dirname(dirname(first.get('format')!)),'unexpected'),'extra');
  const second=skillEnvironment(f.store.directory,'definition',f.materials);assert.deepEqual(second,first);assert.equal(readFileSync(path,'utf8'),'依赖 v1');assert.ok(!existsSync(join(dirname(dirname(first.get('format')!)),'unexpected')));
  chmodSync(join(dirname(first.get('format')!),'scripts/report.mjs'),0o600);skillEnvironment(f.store.directory,'definition',f.materials);
  rmSync(dirname(f.materials[1].path),{recursive:true});assert.throws(()=>skillEnvironment(f.store.directory,'definition',f.materials),/MATERIAL_MISSING/);
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('same-name versions and case collisions are rejected; identical same-name roles may share',()=>{
 const f=setup();try{
  const other=join(f.root,'other','builder');writeSkillFixture(other,'不同版本');const different=f.store.copySkill(other,'other');
  assert.throws(()=>skillLayout([f.materials[0],different]),/SKILL_NAME_CONFLICT/);
  assert.throws(()=>skillLayout([f.materials[0],{...f.materials[0],originalPath:join(f.root,'Builder'),role:'other'}]),/SKILL_NAME_CONFLICT/);
  const paths=skillEnvironment(f.store.directory,'same',[f.materials[0],{...f.materials[0],role:'other'}]);assert.equal(paths.get('builder'),paths.get('other'));
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('substituted environment root never writes through a symlink',()=>{
 const f=setup();try{
  const outside=join(f.root,'outside');mkdirSync(outside);writeFileSync(join(outside,'keep'),'unchanged');
  mkdirSync(join(f.store.directory,'skill-environments'));symlinkSync(outside,join(f.store.directory,'skill-environments','definition'));
  assert.throws(()=>skillEnvironment(f.store.directory,'definition',f.materials),/INVALID_MATERIAL_PATH/);assert.equal(readFileSync(join(outside,'keep'),'utf8'),'unchanged');
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('deleting a definition removes its environment but preserves another definition and shared fixed skills',()=>{
 const f=setup(),core=createWorkCore({databasePath:join(f.root,'work.sqlite')});try{
  const repository=core.definitions;const content=structuredClone(skillContent);content.materialRoles.push({key:'format',text:'Format Kit',kind:'SKILL',required:true,basis:content.purpose.basis});
  const publish=()=>{const draft=repository.saveDraft({id:id(),revision:1,content,originalContent:content,refs:[],issues:[],resolutions:[]});return repository.publish({draftId:draft.id,expectedRevision:1,materialBindings:{builder:f.a,format:f.b},commandId:id()});};
  const a=publish(),b=publish(),one=skillEnvironment(repository.materials.directory,a.id,a.materials),two=skillEnvironment(repository.materials.directory,b.id,b.materials);
  repository.delete({definitionKey:a.definitionKey,confirmation:'永久删除',commandId:id()});assert.ok(!existsSync(one.get('builder')!));assert.ok(existsSync(two.get('builder')!));for(const m of b.materials)repository.materials.verify(m);
  repository.delete({definitionKey:b.definitionKey,confirmation:'永久删除',commandId:id()});assert.ok(!existsSync(two.get('builder')!));
 }finally{core.close();rmSync(f.root,{recursive:true,force:true});}
});
