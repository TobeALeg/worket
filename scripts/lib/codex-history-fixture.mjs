import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function historyFixture() {
  const user = (id, text) => ({ id, type: 'userMessage', content: [{ type: 'text', text }] });
  const agent = (id, text) => ({ id, type: 'agentMessage', text });
  return { mode: 'normal', thread: { id: 'synthetic-paged', name: '分页来源验收', cwd: '/tmp', createdAt: 1700000000, updatedAt: 1900000000, turns: [] },
    turns: [{ id: 'turn-old', status: 'completed', startedAt: 1700000000, itemsView: 'full', items: [user('user-old', '每次必须保留最早来源要求。'), agent('agent-old', '已完成最早资料核对。')] },
      { id: 'turn-new', status: 'completed', startedAt: 1700000020, itemsView: 'summary', items: [] }],
    items: [user('user-new', '每次必须检查分页末尾。'), agent('agent-new', '已完成最后一页。下一步：确认完整来源。')],
  };
}
// Used by a real spawned stdio child in QA, not by the production loader.
export function fixtureReply(method, params, fixture) {
  const fail = (message, code = -32000) => ({ error: { message, code } });
  if (method === 'initialize') return { result: {} };
  if (method === 'thread/read') return { result: { thread: { ...fixture.thread, turns: params.includeTurns ? fixture.turns.map(turn => fixture.mode === 'legacy' && turn.itemsView !== 'full' ? { ...turn, itemsView: 'full', items: fixture.items } : turn) : [] } } };
  if (method === 'thread/turns/list') {
    if (fixture.mode === 'legacy') return fail('Method not found', -32601);
    if (params.cursor && fixture.mode === 'failure') return fail('synthetic second page failure');
    return { result: { data: [fixture.turns[params.cursor ? 1 : 0]], nextCursor: params.cursor ? null : 'turn-page-two' } };
  }
  if (method === 'thread/items/list') return { result: { data: [{ turnId: 'turn-new', item: fixture.items[params.cursor ? 1 : 0] }], nextCursor: params.cursor ? null : 'item-page-two' } };
  return fail('Method not found', -32601);
}

export function writeHistoryFixture(directory, fixture = historyFixture()) {
  const dataPath = join(directory, "source.json"), rpcLog = join(directory, "rpc.jsonl"), binary = join(directory, "codex-fixture");
  writeFileSync(dataPath, JSON.stringify(fixture));
  writeFileSync(binary, `#!${process.execPath}
(async()=>{const {createInterface}=await import('node:readline');const {readFileSync,appendFileSync}=await import('node:fs');const {fixtureReply}=await import(${JSON.stringify(import.meta.url)});createInterface({input:process.stdin}).on('line',line=>{const req=JSON.parse(line);if(req.id===undefined)return;const out=fixtureReply(req.method,req.params,JSON.parse(readFileSync(${JSON.stringify(dataPath)},'utf8')));appendFileSync(${JSON.stringify(rpcLog)},JSON.stringify({method:req.method,params:req.params,error:out.error?.message})+'\\n');process.stdout.write(JSON.stringify({id:req.id,...out})+'\\n')})})();
`, { mode: 0o700 });
  return { dataPath, rpcLog, binary };
}
