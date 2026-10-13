import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AppService } from '../../dist/app/app-service.js';
import { WorkPetMcpHandler } from '../../dist/bridge/mcp-handler.js';
import { createCodexExecutor } from '../../dist/adapters/codex/executor.js';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'worket-reopen-'));
  const databasePath = join(directory, 'work.sqlite');
  const prompts: string[] = [];
  let fail = false;
  let gate: Promise<void> | null = null;
  const threads = new Map<string, string>();
  const source = { async listThreadPage() { return { threads: [], nextCursor: null }; },
    async readThread(id: string) { return { threadId: id, title: 'synthetic', applicationTitle: 'synthetic', cwd: '/tmp', createdAt: '', updatedAt: '', events: [{id: id+'-prompt',externalId: id+'-prompt',sequence: 1,kind: 'user.prompt',content: threads.get(id) ?? 'source evidence',timestamp: '2026-10-13T00:00:00Z',executorType: 'HUMAN',environmentType: 'CODEX_DESKTOP'}] }; }, close() {} };
  const adapter = createCodexExecutor({ codex: source as any, openUrl: async url => { prompts.push(new URL(url).searchParams.get('prompt')!); if (gate) await gate; if (fail) throw new Error('launch failed'); } });
  const open = () => new AppService({databasePath, executors:[adapter]});
  return {open, prompts, threads, setFail: (v: boolean) => {fail=v;}, setGate: (v: Promise<void>|null) => {gate=v;}, cleanup: () => rmSync(directory,{recursive:true,force:true})};
}

test('reopen persists exact delivery through restart; rapid clicks and failed reopen preserve pending state', async () => {
  const f=fixture(); let app=f.open();
  try {
    const id=(await app.createWorkFromConversation({executorId:'codex',threadId:'source'})).selectedWorkId!;
    const first=await app.handoff(id,'codex');
    assert.match(first.notice!,/已请求打开/); assert.doesNotMatch(first.notice!,/已准备好/);
    const before=app.core().getWork(id)!; const episodes=before.episodes.length;
    assert.equal(before.packageReadAt,null);
    app.close(); app=f.open();
    await app.reopenHandoff(id);
    assert.equal(f.prompts[1],f.prompts[0]);
    assert.equal(app.core().getWork(id)!.activeBinding!.id,before.activeBinding!.id);
    let release!: () => void; f.setGate(new Promise<void>(r=>{release=r;}));
    const opening=app.reopenHandoff(id);
    await assert.rejects(app.reopenHandoff(id),/正在交接/);
    assert.throws(()=>app.cancelHandoff(id,'已确认未接手'),/仍在打开/);
    await assert.rejects(app.handoff(id,'codex'),/正在交接/);
    release(); await opening; f.setGate(null);
    f.setFail(true); await assert.rejects(app.reopenHandoff(id),/launch failed/);
    assert.equal(app.core().getWork(id)!.activeBinding!.id,before.activeBinding!.id);
    assert.equal(app.core().getWork(id)!.episodes.length,episodes);
    assert.equal(app.core().getWork(id)!.packageReadAt,null);
    f.setFail(false);
    app.cancelHandoff(id,'已确认未接手');
    assert.equal(app.core().getWork(id)!.activeBinding!.conversationId,'source');
    assert.ok(app.core().getWork(id)!.sourceArchive.some(e=>e.content==='source evidence'));
    await assert.rejects(app.reopenHandoff(id),/已确认或已取消/);
    await app.handoff(id,'codex'); const newer=f.prompts.at(-1)!;
    assert.notEqual(newer,f.prompts[0]);
    f.threads.set('late',f.prompts[0]!);
    assert.equal((await app.syncHook('codex',{hook_event_name:'UserPromptSubmit',session_id:'late',prompt:f.prompts[0]})).accepted,false);
    f.threads.set('target',newer);
    assert.equal((await app.syncHook('codex',{hook_event_name:'UserPromptSubmit',session_id:'target',prompt:newer})).accepted,true);
    const detail=app.dashboard(id).selectedWork!;
    assert.equal(detail.dispatchStatus,'BOUND'); assert.equal(detail.dispatchReadAt,null);
    const deliveryId=app.core().getWork(id)!.packageDeliveryId!;
    const read:any=await new WorkPetMcpHandler(app.core()).handle({id:'read',method:'tools/call',params:{name:'get_work_context',arguments:{work_id:id,delivery_id:deliveryId}}});
    assert.ok(!read.error); assert.ok(app.dashboard(id).selectedWork!.dispatchReadAt);
    await assert.rejects(app.reopenHandoff(id),/已确认或已取消/);
  } finally {app.close(); f.cleanup();}
});

test('initial launch failure restores source; delayed genuine confirmation wins without duplicate episode', async () => {
  const f=fixture(); const app=f.open();
  try {
    const id=(await app.createWorkFromConversation({executorId:'codex',threadId:'source'})).selectedWorkId!;
    f.setFail(true); await assert.rejects(app.handoff(id,'codex'),/launch failed/);
    assert.equal(app.core().getWork(id)!.activeBinding!.conversationId,'source');
    f.setFail(false); await app.handoff(id,'codex'); const count=app.core().getWork(id)!.episodes.length;
    let release!:()=>void;f.setGate(new Promise<void>(r=>{release=r;}));
    const opening=app.reopenHandoff(id);
    while(f.prompts.length<3) await new Promise(r=>setImmediate(r));
    const prompt=f.prompts.at(-1)!;f.threads.set('target',prompt);
    assert.equal((await app.syncHook('codex',{hook_event_name:'UserPromptSubmit',session_id:'target',prompt})).accepted,true);
    release();await opening;
    assert.equal(app.core().getWork(id)!.activeBinding!.conversationId,'target');
    assert.equal(app.core().getWork(id)!.episodes.length,count);
    assert.equal(app.core().getWork(id)!.packageReadAt,null);
  }finally{app.close();f.cleanup();}
});

test('legacy digest-only pending delivery does not reconstruct or replace the original prompt', async()=>{
  const f=fixture();const app=f.open();
  try {
    const id=(await app.createWorkFromConversation({executorId:'codex',threadId:'source'})).selectedWorkId!;
    await app.handoff(id,'codex');
    app.core().definitions.db.prepare('DELETE FROM connector_reopen_requests WHERE work_id=?').run(id);
    await assert.rejects(app.reopenHandoff(id),/旧交付未保存/);
    assert.equal(f.prompts.length,1);
  }finally{app.close();f.cleanup();}
});

// Transport errors are independent of verified user/source confirmation.
test('late genuine binding is preserved when initial open request later rejects', async()=>{
 const f=fixture();const app=f.open();
 try{
  const id=(await app.createWorkFromConversation({executorId:'codex',threadId:'source'})).selectedWorkId!;
  let release!:()=>void;f.setGate(new Promise<void>(r=>{release=r;})); f.setFail(true);
  const opening=app.handoff(id,'codex');
  while(!f.prompts.length)await new Promise(r=>setImmediate(r));
  const prompt=f.prompts[0]!;f.threads.set('target',prompt);
  assert.equal((await app.syncHook('codex',{hook_event_name:'UserPromptSubmit',session_id:'target',prompt})).accepted,true);
  release(); await assert.rejects(opening,/launch failed/);
  assert.equal(app.core().getWork(id)!.activeBinding!.conversationId,'target');
  assert.equal(app.dashboard(id).selectedWork!.dispatchStatus,'BOUND');
 }finally{app.close();f.cleanup();}
});

test('Codex receipt only acknowledges open request, never draft appearance', async()=>{
 const adapter=createCodexExecutor({openUrl:async()=>{}});
 const receipt=await adapter.deliver!({workId:'w',deliveryId:'d',title:'t',purpose:'CONTINUE',prompt:'synthetic'});
 assert.equal(receipt.status,'OPEN_REQUESTED');assert.equal(receipt.conversationId,undefined);
 assert.match(receipt.guidance!,/不代表草稿已出现/);
});
