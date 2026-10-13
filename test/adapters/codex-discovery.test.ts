import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CodexAppServerClient } from '../../dist/adapters/codex/app-server-client.js';

function fixture(mode = 'modern') {
 const directory=mkdtempSync(join(tmpdir(),'worket-discovery-contract-'));
 const binary=join(directory,'codex-fixture'),log=join(directory,'rpc.jsonl');
 writeFileSync(binary, `#!${process.execPath}
const {createInterface}=require('node:readline'),{appendFileSync}=require('node:fs');
const mode=${JSON.stringify(mode)},log=${JSON.stringify(log)};
const thread=(id,name,extra={})=>({id,name,cwd:'/tmp',createdAt:1,updatedAt:2,turns:[],source:'vscode',...extra});
createInterface({input:process.stdin}).on('line',line=>{
 const req=JSON.parse(line);if(req.id===undefined)return;appendFileSync(log,JSON.stringify(req)+'\\n');let result={},error;
 if(req.method==='thread/list'){
  const p=req.params;
  if(mode==='state-legacy'&&'useStateDbOnly'in p)error={code:-32602,message:'unknown field useStateDbOnly'};
  else if(mode==='search-legacy'&&'searchTerm'in p)error={code:-32602,message:'unsupported parameter searchTerm'};
  else if(mode==='auth')error={code:-32001,message:'Access denied'};
  else if(mode==='invalid')result={data:'bad',nextCursor:null};
  else if(mode==='cursor')result={data:[thread('a','A')],nextCursor:p.cursor||'same'};
  else{const agent=thread('agent','Agent SOURCE',{threadSource:'agent_created_thread'});let data=p.useStateDbOnly?[agent,agent,thread('archived','Archived',{archived:true}),thread('user','User SOURCE')]:[thread('user','User SOURCE')];if(mode!=='search-legacy'&&p.searchTerm)data=data.filter(t=>t.name.includes(p.searchTerm));result={data,nextCursor:p.cursor?null:'second'};}
 }
 process.stdout.write(JSON.stringify({id:req.id,...(error?{error}:{result})})+'\\n');
});
`,{mode:0o700});
 const client=new CodexAppServerClient([binary],((binary,args,options)=>spawn(process.execPath,[binary,...args],options)) as typeof spawn);
 return{client,calls:()=>readFileSync(log,'utf8').trim().split('\n').map(line=>JSON.parse(line)).filter(c=>c.method==='thread/list'),close(){client.close();rmSync(directory,{recursive:true,force:true});}};
}

test('state discovery includes agent_created_thread without reading history; dedupe, archive exclusion and search preserve paging',async()=>{
 const f=fixture();try{
  assert.deepEqual((await f.client.listThreadPage(30)).threads.map(t=>t.id),['agent','user']);
  const searched=await f.client.listThreadPage(30,undefined,'Agent');assert.deepEqual(searched.threads.map(t=>t.id),['agent']);
  await f.client.listThreadPage(30,searched.nextCursor!,'Agent');
  assert.deepEqual(f.calls().map(c=>c.params),[
   {limit:30,archived:false,sortKey:'updated_at',sortDirection:'desc',useStateDbOnly:true},
   {limit:30,archived:false,sortKey:'updated_at',sortDirection:'desc',useStateDbOnly:true,searchTerm:'Agent'},
   {limit:30,cursor:'second',archived:false,sortKey:'updated_at',sortDirection:'desc',useStateDbOnly:true,searchTerm:'Agent'},
  ]);
 }finally{f.close();}
});

test('unsupported state parameter downgrades once and exposes compatibility notice without losing cursor',async()=>{
 const f=fixture('state-legacy');try{
  const first=await f.client.listThreadPage(30);assert.deepEqual(first.threads.map(t=>t.id),['user']);assert.match(first.notice!,/兼容/);
  await f.client.listThreadPage(30,first.nextCursor!);assert.equal(f.calls().length,3);assert.equal('useStateDbOnly'in f.calls()[2].params,false);assert.equal(f.calls()[2].params.cursor,'second');
 }finally{f.close();}
});

test('unsupported search filters each page locally and retains pagination with an explicit notice',async()=>{
 const f=fixture('search-legacy');try{
  const first=await f.client.listThreadPage(30,undefined,'Agent');assert.deepEqual(first.threads.map(t=>t.id),['agent']);assert.match(first.notice!,/已加载/);assert.equal(first.nextCursor,'second');
  await f.client.listThreadPage(30,first.nextCursor!,'Agent');assert.equal(f.calls().length,3);assert.equal('searchTerm'in f.calls()[2].params,false);
 }finally{f.close();}
});

test('real errors, malformed responses and repeated cursors fail without compatibility retries',async()=>{
 for(const mode of['auth','invalid','cursor']){const f=fixture(mode);try{
  if(mode==='cursor'){const first=await f.client.listThreadPage();await assert.rejects(f.client.listThreadPage(30,first.nextCursor!),/游标/);}
  else await assert.rejects(f.client.listThreadPage(),mode==='auth'?/Access denied/:/响应/);
  assert.equal(f.calls().length,mode==='cursor'?2:1);
 }finally{f.close();}}
});
