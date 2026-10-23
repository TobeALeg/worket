import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createWorkCore } from '../../dist/core/index.js';
import { mapModel } from '../../dist/renderer/workflow-map.js';
import { seedWorkflow } from '../../scripts/lib/workflow-fixture.mjs';

test('maps keep output identities, partial join readiness and adopted generations distinct from current upstream progress', t => {
  const directory = mkdtempSync(join(tmpdir(), 'worket-map-')), core = createWorkCore({ databasePath: join(directory, 'work.sqlite') });
  t.after(() => { core.close(); rmSync(directory, { recursive: true, force: true }); });
  const seed = seedWorkflow(core), w = core.workflows, definition = w.save({ content: seed.content, commandId: randomUUID() });
  const file = join(directory, 'input.md'); writeFileSync(file, 'map fixture');
  const runId = w.create({ workflowId: definition.id, name: '地图验证', inputs: { brand: file }, commandId: randomUUID() });
  const cmd = (nodeId: string) => ({ runId, nodeId, generation: w.run(runId).nodes[nodeId]!.at(-1)!.generation, expectedRevision: w.run(runId).revision, commandId: randomUUID() });
  const finish = (id: string, outputs: Record<string, string>) => {
    w.prepare(cmd(id)); w.submit({ ...cmd(id), outputs });
    w.review({ ...cmd(id), decision: 'PASS', criteria: { complete: 'PASS', correct: 'PASS' } });
  };
  finish('research', { report: file }); finish('script', { script: file, copy: '封面文案' });
  w.prepare(cmd('video')); finish('cover', { image: file });
  let detail = w.detail(runId), model = mapModel(definition, detail.contracts, detail);
  const mergeCard = model.cards.find(c => c.node.id === 'pack')!;
  assert.equal(mergeCard.state, '未到达');
  assert.equal(mergeCard.rows.find(r => r.key === 'video')!.filled, false);
  assert.equal(mergeCard.rows.find(r => r.key === 'image')!.filled, true);
  const videoEdge = model.connections.find(e => e.to === 'video')!, coverEdge = model.connections.find(e => e.to === 'cover')!;
  assert.notEqual(videoEdge.color, coverEdge.color, 'two different outputs from one work keep separate identities');
  w.submit({ ...cmd('video'), outputs: { video: file } });
  detail = w.detail(runId); model = mapModel(definition, detail.contracts, detail);
  assert.equal(model.cards.find(c => c.node.id === 'video')!.state, '待验收');
  assert.equal(model.connections.find(e => e.to === 'pack' && e.from === 'video')!.ready, false);
  w.rework({ ...cmd('script'), note: '新一轮脚本' });
  detail = w.detail(runId); model = mapModel(definition, detail.contracts, detail);
  assert.equal(model.cards.find(c => c.node.id === 'video')!.rows.find(r => r.kind === 'input')!.filled, true, 'downstream still uses its adopted generation');
  const positions = (m: ReturnType<typeof mapModel>) => m.cards.map(c => [c.node.id, c.x, c.y]);
  assert.deepEqual(positions(model), positions(mapModel(definition, detail.contracts)), 'definition and run preserve node positions');
});

test('flow motion follows real execution, stops for paused runs, and never turns submission into completion', t => {
  const directory = mkdtempSync(join(tmpdir(), 'worket-map-motion-')), core = createWorkCore({ databasePath: join(directory, 'work.sqlite') });
  t.after(() => { core.close(); rmSync(directory, { recursive: true, force: true }); });
  const seed = seedWorkflow(core), w = core.workflows, definition = w.save({ content: seed.content, commandId: randomUUID() });
  const file = join(directory, 'input.md'); writeFileSync(file, 'map fixture');
  const id = w.create({ workflowId: definition.id, name: '执行投影', inputs: { brand: file }, commandId: randomUUID() });
  const detail = w.detail(id);
  detail.run.nodes.research![0]!.phase = 'ACCEPTED';
  detail.run.nodes.script![0]!.phase = 'PREPARED';
  detail.phases.script = '等待接手';
  assert.ok(!mapModel(definition, detail.contracts, detail).connections.some(e => e.active));
  detail.phases.script = '执行中';
  assert.ok(mapModel(definition, detail.contracts, detail).connections.some(e => e.active));
  detail.run.status = 'COMPLETED';
  assert.equal(mapModel(definition, detail.contracts, detail).cards.find(c => c.node.id === 'pack')!.current, true);
  detail.run.status = 'PAUSED';
  assert.ok(!mapModel(definition, detail.contracts, detail).connections.some(e => e.active));
});
