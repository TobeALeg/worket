import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';

test('MCP transport errors preserve string, number and zero IDs; notifications stay silent', async()=>{
 const directory=await mkdtemp(join(tmpdir(),'worket-proxy-error-'));
 const config=join(directory,'bridge.json');
 // Invalid loopback configuration fails before any network or real Worket access.
 await writeFile(config,JSON.stringify({host:'example.invalid',port:1,token:'synthetic'}));
 try{
  const child=spawn(process.execPath,[resolve('integrations/workbuddy-marketplace/plugins/workpet/bridge/mcp-proxy.mjs')],{env:{...process.env,WORKPET_BRIDGE_CONFIG:config}});
  let out='';let err='';child.stdout.on('data',x=>{out+=x;});child.stderr.on('data',x=>{err+=x;});
  const exit=new Promise<number|null>((res,rej)=>{child.on('error',rej);child.on('exit',res);});
  child.stdin.end([
   JSON.stringify({jsonrpc:'2.0',id:'init',method:'initialize'}),
   JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'}),
   JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call'}),
   JSON.stringify({jsonrpc:'2.0',id:0,method:'tools/call'}),
   '{invalid-json',
  ].join('\n')+'\n');
  assert.equal(await exit,0,err);
  const responses=out.trim().split('\n').map(x=>JSON.parse(x));
  assert.deepEqual(responses.map(x=>x.id),['init',2,0,null]);
  assert.ok(responses.every(x=>x.error.code===-32603));
  assert.match(responses[0].error.message,/配置无效/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
