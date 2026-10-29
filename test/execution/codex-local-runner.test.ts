import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { CodexAppServerClient } from '../../dist/adapters/codex/app-server-client.js';
import { CodexLocalRunner } from '../../dist/adapters/codex/local-runner.js';

test('stdio execution binds cwd and routes a server approval without auto-granting or consuming it as an RPC response', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'worket-runner-'));
  const file = join(dir, 'server'), log = join(dir, 'requests.jsonl');
  writeFileSync(file, `#!${process.execPath}
const {createInterface}=require('node:readline'),{appendFileSync}=require('node:fs');
const send=x=>process.stdout.write(JSON.stringify(x)+'\\n');
createInterface({input:process.stdin}).on('line',line=>{
 const r=JSON.parse(line);appendFileSync(${JSON.stringify(log)},line+'\\n');
 if(r.id===900){send({method:'turn/completed',params:{threadId:'thread-1',turn:{id:'turn-1',status:'completed'}}});return;}
 if(!r.method||r.id===undefined)return;
 const result=r.method==='initialize'?{userAgent:'fixture-v1'}:r.method==='thread/start'?{thread:{id:'thread-1'},model:'fixture',sandbox:{type:'workspaceWrite'},approvalPolicy:'on-request'}:r.method==='turn/start'?{turn:{id:'turn-1'}}:{};
 send({id:r.id,result});
 if(r.method==='turn/start')send({id:900,method:'item/commandExecution/requestApproval',params:{threadId:'thread-1',command:'touch example.txt',cwd:${JSON.stringify(dir)}}});
});
`, { mode: 0o700 });
  const client = new CodexAppServerClient([file], ((binary, args, options) => spawn(process.execPath, [binary, ...args], options)) as typeof spawn);
  const runner = new CodexLocalRunner(client), events: any[] = [];
  let resolveApproval: () => void, resolveEnd: () => void;
  const approval = new Promise<void>(resolve => resolveApproval = resolve);
  const ended = new Promise<void>(resolve => resolveEnd = resolve);
  try {
    await runner.start({ cwd: dir, prompt: 'one task', onEvent: e => { events.push(e); if (e.type === 'approval') resolveApproval(); if (e.type === 'turn' && e.status === 'TURN_ENDED') resolveEnd(); } });
    await approval;
    const calls = () => readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.equal(calls().some(r => r.id === 900), false);
    const start = calls().find(r => r.method === 'thread/start');
    assert.equal(start.params.cwd, dir); assert.equal(start.params.sandbox, 'workspace-write'); assert.equal(start.params.approvalPolicy, 'on-request');
    assert.match(events.find(e => e.type === 'thread').runtime, /fixture-v1/);
    assert.throws(() => runner.approve('wrong-thread', '900', true), /失效/);
    runner.approve('thread-1', '900', false); await ended;
    assert.deepEqual(calls().find(r => r.id === 900).result, { decision: 'decline' });
    assert.throws(() => runner.approve('thread-1', '900', true), /失效/);
  } finally { runner.close(); rmSync(dir, { recursive: true, force: true }); }
});
