import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppService } from '../../dist/app/app-service.js';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'worket-view-'));
  let reads = 0, enrollments = 0, failDelivery = false;
  const events: any[] = [];
  const add = () => events.push({ id: `e${events.length}`, externalId: `e${events.length}`, sequence: events.length + 1,
    kind: 'user.prompt', content: `必须交付第 ${events.length + 1} 份报告。`, timestamp: new Date().toISOString(), executorType: 'HUMAN', environmentType: 'FIXTURE' });
  add();
  const adapter = { id: 'fixture', name: 'Fixture', mark: 'F', bundleIds: [], environment: { type: 'FIXTURE', name: 'Fixture' },
    source: { async readThread(id: string) { reads++; return { threadId: id, title: '报告', applicationTitle: '报告', cwd: directory, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), events }; }, close() {} },
    async inspect() {}, async resolveCurrent() { return null; }, async deliver() { if (failDelivery) throw new Error('delivery failed'); return {}; } };
  const options = { databasePath: join(directory, 'work.sqlite'), executors: [adapter], foreground: { async detect() { return null; } }, onRecordingStarted() { enrollments++; } };
  let app = new AppService(options);
  return { get app() { return app; }, add, reads: () => reads, enrollments: () => enrollments,
    failDelivery() { failDelivery = true; }, restart() { app.close(); app = new AppService(options); },
    open: () => app.createWorkFromConversation({ executorId: 'fixture', threadId: 'source', mode: 'view' }),
    close() { app.close(); rmSync(directory, { recursive: true, force: true }); } };
}

test('查看按需更新同一工作，轮询与重启不采集，不开启后台准备或改进采集', async () => {
  const f = fixture();
  try {
    const first = await f.open(), id = first.selectedWorkId!;
    assert.equal(first.selectedWork?.captureStatus, 'stopped');
    const count = first.selectedWork!.eventCount, reads = f.reads();
    f.add(); await f.app.syncRecordedWorks();
    assert.equal(f.reads(), reads);
    assert.equal(f.app.dashboard(id).selectedWork!.eventCount, count);
    f.restart(); await f.app.syncRecordedWorks();
    assert.equal(f.reads(), reads);
    const updated = await f.open();
    assert.equal(updated.selectedWorkId, id);
    assert.ok(updated.selectedWork!.eventCount > count);
    assert.equal(f.app.core().listWorks().length, 1);
    assert.equal(f.enrollments(), 0);
    assert.equal(f.app.core().definitions.db.prepare('SELECT count(*) AS n FROM work_preparation').get()!.n, 0);
    assert.equal(f.app.dashboard(id).petState, 'sleeping');
  } finally { f.close(); }
});

test('查看后的交接失败仍保持按需模式，成功后进入原接手链路', async () => {
  const f = fixture();
  try {
    const id = (await f.open()).selectedWorkId!;
    f.failDelivery(); await assert.rejects(f.app.handoff(id, 'fixture'), /delivery failed/);
    const reads = f.reads(); f.add(); await f.app.syncRecordedWorks();
    assert.equal(f.reads(), reads);
    assert.equal(f.app.dashboard(id).selectedWork?.captureStatus, 'stopped');
  } finally { f.close(); }
  const g = fixture();
  try {
    const id = (await g.open()).selectedWorkId!;
    const handed = await g.app.handoff(id, 'fixture');
    assert.equal(handed.selectedWorkId, id);
    assert.equal(handed.selectedWork?.captureStatus, 'waiting');
    assert.equal(g.app.core().definitions.db.prepare('SELECT count(*) AS n FROM work_view_snapshots').get()!.n, 0);
  } finally { g.close(); }
});

test('旧已完成普通工作可以直接交接，打开历史本身不恢复工作', async () => {
  const f = fixture();
  try {
    const id = (await f.open()).selectedWorkId!;
    f.app.completeWork(id);
    assert.equal((await f.open()).selectedWork?.status, 'COMPLETED');
    const handed = await f.app.handoff(id, 'fixture');
    assert.equal(handed.selectedWork?.status, 'OPEN');
    assert.equal(handed.selectedWork?.captureStatus, 'waiting');
  } finally { f.close(); }
});
