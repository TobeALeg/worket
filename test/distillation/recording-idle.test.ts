import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorkCore } from '../../dist/core/index.js';
import { ImprovementCollector } from '../../dist/improvement/collector.js';
import { RecordingCollection } from '../../dist/improvement/recording.js';
import { projectRecordingSample } from '../../dist/contracts/recording-view.js';
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'worket-idle-test-'));
  let core: any, collector: any, recording: any;
  const open = () => {
    core = createWorkCore({ databasePath: join(directory, 'local.sqlite') });
    collector = new ImprovementCollector(core.definitions.db, { improvementIdentity: () => 'fixture' } as any);
    recording = new RecordingCollection(core, collector);
  };
  open();
  const work = core.createWork({ definition: { key: 'qa', name: 'qa', version: 1 }, executor: { type: 'AGENT', name: 'qa' }, environment: { type: 'CODEX_DESKTOP', name: 'qa' }, source: { adapter: 'codex', conversationId: 'qa' } });
  recording.start(work.instance.id);
  const append = (externalId: string, sequence: number, content: string, kind = 'user.prompt') => core.appendSourceEvents(work.instance.id, [{ externalId, sequence, kind, content, timestamp: new Date(0).toISOString(), executorType: 'HUMAN', environmentType: 'CODEX_DESKTOP', metadata: {}, artifactRefs: [] }]);
  return { get core() { return core; }, get collector() { return collector; }, get recording() { return recording; }, work,
    append, restart() { core.close(); open(); }, close() { core.close(); rmSync(directory, { recursive: true, force: true }); },
    events: () => core.definitions.db.prepare('SELECT payload FROM improvement_outbox WHERE payload IS NOT NULL ORDER BY rowid').all().map((r: any) => JSON.parse(r.payload).event),
  };
}
test('idle restart skips snapshots and queue attempts; tool-only additions advance the local cursor without uploads', () => {
  const f = fixture(); try {
    f.append('a', 1, '当前要求'); f.recording.collect(); f.restart();
    const getWork = f.core.getWork.bind(f.core); let snapshots = 0;
    f.core.getWork = (...args: any[]) => { snapshots++; return getWork(...args); };
    const count = f.events().length;
    f.recording.collect(); f.recording.collect(); assert.equal(snapshots, 0);
    f.append('tool', 2, '秘密工具内容', 'tool.result'); snapshots = 0;
    f.recording.collect(); assert.equal(snapshots, 1); assert.equal(f.events().length, count);
    f.recording.collect(); assert.equal(snapshots, 1);
    assert.ok(!JSON.stringify(f.events()).includes('秘密工具内容'));
    // Upgrade from the previous format: a view exists but no scan checkpoint.
    f.core.definitions.db.exec('DELETE FROM recording_checkpoints'); f.restart();
    f.recording.collect(); assert.equal(f.events().length, count);
    assert.equal(f.core.definitions.db.prepare('SELECT source_row_id FROM recording_checkpoints').get().source_row_id, f.core.sourceCheckpoint(f.work.instance.id).rowId);
  } finally { f.close(); }
});
test('append position catches late messages with equal or lower source ordinals and keeps remote views complete', () => {
  const f = fixture(); try {
    f.append('first', 100, '先收到的内容'); f.recording.collect();
    f.append('late-equal', 100, '相同来源序号'); f.recording.collect();
    f.append('late-older', 50, '迟到旧序号'); f.recording.collect();
    const projected = projectRecordingSample(f.events());
    assert.equal(projected.ready, true);
    assert.deepEqual(projected.current.map(item => item.content), ['迟到旧序号', '先收到的内容', '相同来源序号']);
    assert.equal(projected.throughSequence, 102);
    const count = f.events().length; f.restart(); f.recording.collect(); assert.equal(f.events().length, count);
  } finally { f.close(); }
});
test('partial multipart queue and failed view/checkpoint transaction recover after restart without skipped or duplicate evidence', () => {
  const f = fixture(); try {
    const content = '合成消息😀'.repeat(8000);
    f.append('long', 1, content);
    const record = f.collector.record.bind(f.collector);
    f.collector.record = (id: string, key: string, kind: string, data: any, saved: any) => {
      if (kind === 'MESSAGE' && data.part === 1) throw Error('synthetic interruption');
      return record(id, key, kind, data, saved);
    };
    assert.throws(() => f.recording.collect(), /synthetic interruption/);
    assert.equal(f.events().filter((event: any) => event.kind === 'MESSAGE').length, 1);
    f.restart();
    f.core.definitions.db.exec("CREATE TRIGGER fail_checkpoint BEFORE INSERT ON recording_checkpoints BEGIN SELECT RAISE(ABORT,'synthetic checkpoint failure'); END");
    const views = f.events().filter((event: any) => event.kind === 'RECORDING_VIEW').length;
    assert.throws(() => f.recording.collect(), /synthetic checkpoint failure/);
    assert.equal(f.events().filter((event: any) => event.kind === 'RECORDING_VIEW').length, views);
    assert.equal(f.core.definitions.db.prepare('SELECT source_row_id FROM recording_checkpoints').get().source_row_id, 0);
    f.core.definitions.db.exec('DROP TRIGGER fail_checkpoint'); f.restart(); f.recording.collect();
    const projected = projectRecordingSample(f.events());
    assert.equal(projected.ready, true); assert.equal(projected.current[0].content, content);
    assert.equal(f.events().filter((event: any) => event.kind === 'MESSAGE').length, Math.ceil(content.length / 16000));
  } finally { f.close(); }
});
test('idle fast path still stops expired, completed, unbound or deleted work and does not revive opted-out samples', () => {
  for (const reason of ['expired', 'completed', 'unbound', 'deleted', 'optout']) {
    const f = fixture(); try {
      f.append('a', 1, '有效范围'); f.recording.collect();
      if (reason === 'expired') {
        const row = f.collector.list()[0]; const consent = JSON.parse(row.consent); consent.at = new Date(0).toISOString();
        f.core.definitions.db.prepare('UPDATE improvement_subscriptions SET consent=?').run(JSON.stringify(consent));
      } else if (reason === 'completed') f.core.completeWork(f.work.instance.id);
      else if (reason === 'unbound') f.core.stopCapture(f.work.instance.id);
      else if (reason === 'deleted') f.core.deleteWorkPermanently(f.work.instance.id, { confirmation: f.work.instance.id });
      else { f.collector.setEnabled(false); f.collector.setEnabled(true); }
      f.recording.collect(); assert.equal(f.collector.list()[0].state, 'STOPPED', reason);
      assert.equal(f.collector.list()[0].pending, 0, reason);
    } finally { f.close(); }
  }
});
