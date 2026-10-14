import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WorkBuddyLocalHistory } from '../../dist/adapters/workbuddy/local-history.js';
import { readVisibleTranscript } from '../../dist/adapters/workbuddy/local-transcript.js';
import { reconcileLegacyEvents } from '../../dist/adapters/workbuddy/legacy-events.js';
const message = (id: string, role: string, text: string, providerData = {}) => ({
  id, sessionId: 'chat', type: 'message', role, timestamp: '2026-10-14T00:00:00Z',
  providerData: { conversationRequestId: 'request', ...providerData },
  content: [{ type: role === 'user' ? 'input_text' : 'output_text', text }],
});
const rows = [message('u', 'user', '<system-reminder>SECRET</system-reminder><user_query>visible</user_query>'),
  { type: 'reasoning', sessionId: 'chat', content: 'HIDDEN' },
  message('meta', 'user', 'PRIVATE SUMMARY', { isSummary: true }),
  message('a', 'assistant', 'answer')];
const body = rows.map(row => JSON.stringify(row)).join('\n') + '\n';
test('local projection excludes injected context and reasoning, defers active replies and rejects torn/mixed records', () => {
  const events = readVisibleTranscript(body, 'chat', true);
  assert.deepEqual(events.map(e => e.content), ['visible', 'answer']);
  assert.deepEqual(readVisibleTranscript(body, 'chat', false).map(e => e.content), ['visible']);
  assert.throws(() => readVisibleTranscript(body + '{', 'chat', true), /尚未写完/);
  assert.throws(() => readVisibleTranscript(body.replace('"sessionId":"chat"', '"sessionId":"other"'), 'chat', true), /身份/);
  assert.deepEqual(readVisibleTranscript(body + JSON.stringify(message('a', 'assistant', 'edited')) + '\n', 'chat', true).map(e => e.content), ['visible', 'edited']);
});
test('local history filters accounts/deleted sessions, pages deterministically and leaves database unchanged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buddy-local-'));
  try {
    await mkdir(join(root, 'storage/skeleton'), { recursive: true });
    await mkdir(join(root, 'projects/project'), { recursive: true });
    await writeFile(join(root, 'storage/skeleton/account-snapshot.json'), JSON.stringify({ primary: { uid: 'me' } }));
    const path = join(root, 'workbuddy.db'); const db = new DatabaseSync(path);
    db.exec('CREATE TABLE sessions(id TEXT,title TEXT,custom_title TEXT,cwd TEXT,status TEXT,created_at INTEGER,updated_at INTEGER,user_id TEXT,deleted_at INTEGER,transport TEXT)');
    const insert = db.prepare('INSERT INTO sessions VALUES(?,?,NULL,?, ?,1,2,?,?,?)');
    for (const [id, user, deleted] of [['chat', 'me', null], ['missing', 'me', null], ['other', 'someone', null], ['gone', 'me', 1], ['unowned', '', null]] as const)
      insert.run(id, id, '/tmp', 'completed', user, deleted, 'local');
    db.close();
    await writeFile(join(root, 'projects/project/chat.jsonl'), body);
    const before = await readFile(path); const source = new WorkBuddyLocalHistory(root);
    await writeFile(join(root, 'projects/project/unowned.jsonl'), body.replaceAll('chat', 'unowned'));
    await source.inspect();
    const page = await source.listThreadPage(1);
    assert.deepEqual(page.threads.map(t => t.id), ['chat']); assert.equal(page.nextCursor, null);
    assert.match(page.notice!, /1 个会话/);
    assert.equal((await source.listThreadPage(30, undefined, 'no-match')).threads.length, 0);
    assert.equal((await source.readThread('chat')).history, undefined);
    await assert.rejects(source.readThread('other'), /当前账号/);
    await assert.rejects(source.readThread('unowned'), /当前账号/);
    await assert.rejects(source.readThread('missing'), /本地正文/);
    assert.deepEqual(await readFile(path), before);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('SDK to local migration keeps evidence IDs and retains the alias for later edits', () => {
  const events = readVisibleTranscript(body, 'chat', true);
  const thread = { threadId: 'chat', events } as any;
  const archive = events.map((e, i) => ({ ...e, metadata: {}, externalId: `workbuddy:chat:request:${i ? 'assistant:2' : 'user:0'}` }));
  const first = reconcileLegacyEvents(thread, archive as any);
  assert.deepEqual(first.events.map(e => e.externalId), archive.map(e => e.externalId));
  const updated = { ...thread, events: events.map(e => ({ ...e, content: e.kind === 'agent.response' ? 'edited' : e.content })) };
  assert.equal(reconcileLegacyEvents(updated, first.events as any).events[1]!.externalId, archive[1]!.externalId);
});

test('visible user text keeps nested tags and explicit files without leaking image/context wrappers', () => {
  const row = message('u', 'user', '<system-reminder>secret</system-reminder><user_query>explain <user_query>this</user_query> @"/tmp/input.md"</user_query>');
  row.content.push({ type: 'input_text', text: '<image_local_path>/tmp/photo.jpg</image_local_path>' });
  const events = readVisibleTranscript(JSON.stringify(row), 'chat', true);
  assert.equal(events[0]!.content, 'explain <user_query>this</user_query> @"/tmp/input.md"');
  assert.deepEqual(events.filter(e => e.kind === 'artifact.added').map(e => e.content), ['/tmp/input.md', '/tmp/photo.jpg']);
});

test('internal user records cannot replace the active visible request', () => {
  for (const flag of ['isMeta', 'isSummary', 'isCompactInternal', 'skipRun']) {
    const transcript = [message('u', 'user', 'visible'), message('a', 'assistant', 'partial'),
      message('internal', 'user', 'hidden', { [flag]: true, conversationRequestId: 'internal-request' })]
      .map(row => JSON.stringify(row)).join('\n');
    assert.deepEqual(readVisibleTranscript(transcript, 'chat', false).map(e => e.content), ['visible']);
    assert.deepEqual(readVisibleTranscript(transcript, 'chat', true).map(e => e.content), ['visible', 'partial']);
  }
});
