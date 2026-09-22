import test from 'node:test';
import assert from 'node:assert/strict';
import { projectRecordingSample } from '../../dist/contracts/recording-view.js';
import { recordingView } from '../../dist/improvement/recording-view.js';
import { validateSample, IMPROVEMENT_POLICY } from '../../dist/contracts/improvement.js';
import { ImprovementCollector } from '../../dist/improvement/collector.js';
import { ImprovementStore } from '../../server/improvement.mjs';
import { DatabaseSync } from 'node:sqlite';
const at = new Date().toISOString();
const event = (sourceEventId: string, sequence: number, content: string, part = 0, parts = 1) => ({ id: `${sourceEventId}-${part}`, kind: 'MESSAGE', at, data: { sourceEventId, sequence, content, timestamp: at, kind: 'user.prompt', part, parts } });
const view = (sequence: number, entries: any[]) => ({ id: `view-${sequence}`, kind: 'RECORDING_VIEW', at, data: { sequence, entries } });
const input = (event: any, schemaVersion = 2) => ({ schemaVersion, sampleId: 'sample', consent: { version: IMPROVEMENT_POLICY.recordingVersion, scope: 'RECORDING', at }, event });

test('current recording view requires complete chunks and matching source evidence across reorder, retry and conflict', () => {
  const first = event('first', 1, 'old');
  const next = [event('next', 2, 'new ', 0, 2), event('next', 2, 'requirement', 1, 2)];
  const current = view(2, [{ sourceEventId: 'first', status: 'SUPERSEDED', supersededBy: 'next' }, { sourceEventId: 'next', status: 'CURRENT' }]);
  assert.equal(projectRecordingSample([first] as any).ready, false);
  assert.equal(projectRecordingSample([current, first, next[0]] as any).ready, false);
  const all = [next[1], current, first, next[0], next[0]];
  const result = projectRecordingSample(all as any);
  assert.equal(result.ready, true); assert.deepEqual(result.current.map(m => m.content), ['new requirement']);
  assert.equal(result.messages[0].status, 'SUPERSEDED');
  const conversation = projectRecordingSample([event('original', 1, 'old user'), event('reply', 2, 'agent reply'), event('revised', 3, 'new user'),
    view(3, [{sourceEventId:'original',status:'SUPERSEDED',supersededBy:'revised'},{sourceEventId:'reply',status:'CURRENT'},{sourceEventId:'revised',status:'CURRENT'}])] as any);
  assert.deepEqual(conversation.current.map(m=>m.content), ['new user','agent reply']);
  const pending = view(3, [{ sourceEventId: 'first', status: 'SUPERSEDED', supersededBy: 'next' }, { sourceEventId: 'next', status: 'PENDING' }]);
  assert.equal(projectRecordingSample([...all, pending] as any).ready, false);
  const absent = view(4, [{ sourceEventId: 'first', status: 'SUPERSEDED', supersededBy: 'next' }, { sourceEventId: 'next', status: 'ABSENT' }]);
  assert.deepEqual(projectRecordingSample([...all, absent, pending] as any).current, []);
  assert.equal(projectRecordingSample([...all, absent, pending] as any).ready, true);
  assert.equal(projectRecordingSample([...all, event('new-unindexed', 5, 'not yet covered')] as any).ready, false);
  assert.equal(projectRecordingSample([...all, event('next', 2, 'conflict', 0, 2)] as any).ready, false);
  assert.equal(projectRecordingSample([...all, view(2, [{sourceEventId: 'first', status: 'CURRENT'}])] as any).ready, false);
});

test('local projection carries only visible-message IDs, including absence and restoration; hidden chains stay excluded', () => {
  const source = (id: string, sequence: number, kind: string, content: string, previousEventId?: string) => ({ id, sequence, kind, content, metadata: { path: '/secret', worketSource: { adapter: 'codex', conversationId: 'private', externalId: 'native', previousEventId } } });
  const archive = [source('a', 1, 'user.prompt', 'old'), source('b', 2, 'user.prompt', 'new', 'a'), source('tool', 3, 'tool.result', 'hidden'), source('tool-absent', 4, 'source.absent', '', 'tool'), source('check', 5, 'source.check', '', 'b')];
  let result = recordingView(archive as any);
  assert.deepEqual(result, { sequence: 5, entries: [{ sourceEventId: 'a', status: 'SUPERSEDED', supersededBy: 'b' }, { sourceEventId: 'b', status: 'PENDING' }] });
  archive.push(source('absent', 6, 'source.absent', '', 'check')); assert.equal(recordingView(archive as any).entries[1].status, 'ABSENT');
  archive.push(source('restored', 7, 'user.prompt', 'new', 'absent')); result = recordingView(archive as any);
  assert.equal(result.entries[1].supersededBy, 'restored'); assert.equal(result.entries[2].status, 'CURRENT');
  for (const excluded of ['secret', 'private', 'native', 'tool', 'check', 'absent']) assert.ok(!JSON.stringify(result).includes(excluded));
});

test('versioned recording transport rejects unsupported fields and old servers retain the queue without sending partial semantics', async () => {
  const valid = input(view(1, [{ sourceEventId: 'a', status: 'CURRENT' }]));
  assert.doesNotThrow(() => validateSample(valid));
  assert.throws(() => validateSample({ ...valid, schemaVersion: 1 }), /INVALID_INPUT/);
  assert.throws(() => validateSample(input(view(1, [{ sourceEventId: 'a', status: 'CURRENT', path: '/secret' }]))), /INVALID_INPUT/);
  assert.throws(() => validateSample(input(view(1, [{ sourceEventId: 'a', status: 'SUPERSEDED', supersededBy: 'missing' }]))), /INVALID_INPUT/);
  assert.doesNotThrow(() => validateSample(input(event('a', 1, 'legacy'), 1)));
  const db = new DatabaseSync(':memory:'); const remote = new ImprovementStore(':memory:'); let supported = false, calls = 0;
  const c = new ImprovementCollector(db, { improvementIdentity: () => 'same', capabilities: async () => ({ improvement: supported ? remote.policy() : IMPROVEMENT_POLICY }), uploadSample: async (v: any, guard: any) => { guard?.(); calls++; return remote.receive('qa', v); } } as any);
  try {
    c.enroll('sample', 'RECORDING', 'scope', { workId: 'work', title: 'scope' });
    c.record('sample', 'message', 'MESSAGE', event('a', 1, 'new').data);
    c.record('sample', 'view', 'RECORDING_VIEW', view(1, [{sourceEventId:'a',status:'CURRENT'}]).data);
    await c.flush(); assert.equal(calls, 0); assert.equal(c.list()[0].pending, 3); assert.equal(c.list()[0].error, 'COLLECTION_UPDATE_REQUIRED');
    supported = true; await c.flush(); assert.equal(calls, 3); const saved = remote.get(remote.list()[0].id); assert.equal(saved.recordingView.ready, true);
    assert.deepEqual(saved.recordingView.current.map((m: any) => m.content), ['new']); assert.equal(c.list()[0].pending, 0);
  } finally { db.close(); remote.close(); }
});
