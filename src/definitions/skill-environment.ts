import {basename,dirname,join} from 'node:path';
import {existsSync,lstatSync,mkdirSync,mkdtempSync,readdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {ensure} from '../contracts/definition.js';
import {prepareMaterialPath,replaceMaterialDirectory} from './material-files.js';
import {verifySkill} from './skill-materials.js';
import type {Material} from './storage.js';

/** Only explicitly bound skills participate. Names preserve sibling relative references. */
export function skillLayout(materials: Material[]): Map<string,Material> {
  const result=new Map<string,Material>(),names=new Map<string,string>();
  for(const material of materials.filter(m=>m.bundle)) {
    const name=basename(material.originalPath),key=name.normalize('NFC').toLowerCase();
    ensure(name && name!=='.' && name!=='..', 'INVALID_MATERIAL_PATH');
    const previous=names.get(key);
    ensure(!previous || (previous===name && result.get(previous)!.hash===material.hash), 'SKILL_NAME_CONFLICT', '技能目录同名但内容不同，请选择名称明确且互不冲突的技能目录');
    names.set(key,name);result.set(name,material);
  }
  return result;
}
function verifyEnvironment(directory: string, layout: Map<string,Material>): void {
  ensure(lstatSync(directory).isDirectory()&&!lstatSync(directory).isSymbolicLink(),'INVALID_MATERIAL_PATH');
  ensure(JSON.stringify(readdirSync(directory).sort())===JSON.stringify([...layout.keys()].sort()),'MATERIAL_MISSING');
  for(const [name,material] of layout) verifySkill({...material,path:join(directory,name,'SKILL.md')});
}

/** A derived, verified view of one immutable definition; never rereads mutable originals. */
export function skillEnvironment(store: string, definitionId: string, materials: Material[]): Map<string,string> {
  const skills=materials.filter(m=>m.bundle),layout=skillLayout(skills);
  if(skills.length<2) return new Map(skills.map(m=>[m.role,m.path]));
  ensure(/^[A-Za-z0-9_-]+$/.test(definitionId),'INVALID_INPUT');
  for(const material of skills) verifySkill(material);
  const target=join(store,'skill-environments',definitionId);
  prepareMaterialPath(store,target);
  let valid=false;
  try {verifyEnvironment(target,layout);valid=true;} catch { /* Rebuild only from verified fixed versions. */ }
  if(!valid) {
    const temporary=mkdtempSync(join(dirname(target),'.assemble-'));
    try {
      for(const [name,material] of layout) {
        const root=join(temporary,name);mkdirSync(root,{mode:0o700});
        for(const directory of material.bundle!.directories) mkdirSync(join(root,directory),{recursive:true,mode:0o700});
        for(const file of material.bundle!.files) {
          const path=join(root,file.path);mkdirSync(dirname(path),{recursive:true,mode:0o700});
          writeFileSync(path,readFileSync(join(dirname(material.path),file.path)),{flag:'wx',mode:file.executable?0o700:0o600});
        }
      }
      verifyEnvironment(temporary,layout);
      replaceMaterialDirectory(temporary,target);
    } finally {if(existsSync(temporary)) rmSync(temporary,{recursive:true,force:true});}
  }
  verifyEnvironment(target,layout);
  return new Map(skills.map(m=>[m.role,join(target,basename(m.originalPath),'SKILL.md')]));
}

export function collectSkillEnvironments(store: string, definitionIds: Set<string>): void {
  const directory=join(store,'skill-environments');
  if(!existsSync(directory)) return;
  prepareMaterialPath(store,join(directory,'owned'));
  for(const entry of readdirSync(directory)) if(/^[A-Za-z0-9_-]+$/.test(entry) && !definitionIds.has(entry))
    rmSync(join(directory,entry),{recursive:true,force:true});
}
