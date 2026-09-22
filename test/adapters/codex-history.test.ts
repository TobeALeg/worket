import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCodexHistory } from '../../dist/adapters/codex/history.js';
const item = (id: string, text = id) => ({ id, type: 'agentMessage', text });
const turn = (id: string, view = 'full') => ({ id, status: 'completed', itemsView: view, items: [item(id)] });
const metadata = { id: 'thread', cwd: '/tmp', createdAt: 0, updatedAt: 1, turns: [] };
test('turn and item pagination preserve order, load summaries, and de-duplicate exact overlaps', async () => {
  const calls: any[] = [];
  const result = await readCodexHistory(async (method, args) => {
    calls.push([method, args]);
    if (method === 'thread/read') return { thread: metadata } as any;
    if (method === 'thread/turns/list') return (args.cursor ? { data: [turn('a'), turn('b', 'summary')], nextCursor: null } : { data: [turn('a')], nextCursor: 'second' }) as any;
    return (args.cursor ? { data: [{ turnId: 'b', item: item('b2') }], nextCursor: null } : { data: [{ turnId: 'b', item: item('b1') }], nextCursor: 'more-items' }) as any;
  }, 'thread');
  assert.deepEqual(result.turns.map(t => t.id), ['a', 'b']);
  assert.deepEqual(result.turns[1].items.map(i => i.id), ['b1', 'b2']);
  assert.ok(calls.every(([method,args]) => method === 'thread/read' ? args.includeTurns === false : args.sortDirection === 'asc'));
});
test('legacy fallback requires method-not-found and rejects explicitly incomplete legacy history', async () => {
  for (const view of [undefined, 'full', 'summary']) {
    let reads = 0;
    const request = async (method: string, args: any): Promise<any> => {
      if (method === 'thread/turns/list') throw Object.assign(new Error('not supported'), { code: -32601 });
      reads++; return { thread: { ...metadata, turns: args.includeTurns ? [{ ...turn('legacy'), itemsView: view }] : [] } };
    };
    if (view === 'summary') await assert.rejects(readCodexHistory(request, 'thread'), /CODEX_HISTORY_INCOMPLETE/);
    else assert.equal((await readCodexHistory(request, 'thread')).turns[0].id, 'legacy');
    assert.equal(reads, 2);
  }
});
test('stalled, malformed, changed and cross-turn pages fail without returning partial events or falling back', async () => {
  const scenarios = ['cursor', 'missing-end', 'empty-next', 'changed', 'cross-turn', 'network', 'auth', 'unknown-view'];
  for (const scenario of scenarios) {
    let reads = 0;
    await assert.rejects(readCodexHistory(async (method, args) => {
      if (method === 'thread/read') { reads++; return { thread: metadata } as any; }
      if (scenario === 'network' || scenario === 'auth') throw Object.assign(new Error(scenario), { code: -32000 });
      if (scenario === 'cursor') return { data: [turn('a')], nextCursor: 'same' } as any;
      if (scenario === 'missing-end') return { data: [turn('a')] } as any;
      if (scenario === 'empty-next') return { data: [], nextCursor: 'later' } as any;
      if (scenario === 'changed') return args.cursor ? { data: [{ ...turn('a'), status: 'failed' }], nextCursor: null } as any : { data: [turn('a')], nextCursor: 'later' } as any;
      if (scenario === 'unknown-view') return { data: [turn('a', 'unknown')], nextCursor: null } as any;
      if (method === 'thread/turns/list') return { data: [turn('a', 'summary')], nextCursor: null } as any;
      return { data: [{ turnId: 'other', item: item('wrong') }], nextCursor: null } as any;
    }, 'thread'), undefined, scenario);
    assert.equal(reads, 1, scenario+' must not silently fall back');
  }
});
test('a later page failure is atomic and history read bounds terminate unbounded cursors', async () => {
  let page = 0;
  await assert.rejects(readCodexHistory(async method => {
    if (method === 'thread/read') return { thread: metadata } as any;
    return { data: [turn(String(page))], nextCursor: String(++page) } as any;
  }, 'thread'), /上限/);
  assert.equal(page, 513);
  await assert.rejects(readCodexHistory(async (method,args) => {
    if (method === 'thread/read') return { thread: metadata } as any;
    if (args.cursor) throw new Error('page failed');
    return { data: [turn('a')], nextCursor: 'second' } as any;
  }, 'thread'), /page failed/);
});

test('real stdio client preserves method-not-found fallback and refuses a failed later page', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path'); const { tmpdir } = await import('node:os');
  const { historyFixture, writeHistoryFixture } = await import('../../scripts/lib/codex-history-fixture.mjs');
  const { CodexAppServerClient } = await import('../../dist/adapters/codex/app-server-client.js');
  const directory = mkdtempSync(join(tmpdir(), 'worket-history-stdio-')), fixture = historyFixture();
  const { binary, dataPath } = writeHistoryFixture(directory, fixture), client = new CodexAppServerClient([binary]);
  try {
    const modern = await client.readThread(fixture.thread.id);
    assert.equal(modern.events.length, 4);
    fixture.mode = 'legacy'; writeFileSync(dataPath, JSON.stringify(fixture));
    assert.deepEqual((await client.readThread(fixture.thread.id)).events, modern.events);
    fixture.mode = 'failure'; writeFileSync(dataPath, JSON.stringify(fixture));
    await assert.rejects(client.readThread(fixture.thread.id), /synthetic second page failure/);
  } finally { client.close(); rmSync(directory, { recursive: true, force: true }); }
});
